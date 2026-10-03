// Local-only API served by the Vite dev server (no separate process).
// Data lives in ./data as JSON. The only outbound calls are OpenStreetMap
// tiles (browser) and Nominatim place lookups you trigger when adding a stop.
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Country, SeedFile, Settings, Trip } from '../src/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SEED = path.join(DATA_DIR, 'seed.json');
const TRIPS = path.join(DATA_DIR, 'trips.json');
const SETTINGS = path.join(DATA_DIR, 'settings.json');
// Work travel clearance lists: local only (gitignored), written by the xlsx import.
const COUNTRIES = path.join(DATA_DIR, 'countries.json');

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function seed(): SeedFile {
  return readJson<SeedFile>(SEED, {
    settings: { allowanceShifts: 35, rotaAnchor: '2026-12-31', monthsUntilLastTrip: 13 },
    trips: [],
  });
}

// First run: your working copy starts as the spreadsheet import.
function trips(): Trip[] {
  if (!fs.existsSync(TRIPS)) writeJson(TRIPS, seed().trips);
  return readJson<Trip[]>(TRIPS, []);
}

function settings(): Settings {
  return readJson<Settings>(SETTINGS, seed().settings);
}

function countries(): Country[] {
  return readJson<Country[]>(COUNTRIES, []);
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => resolve(s));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

// Nominatim usage policy: max 1 request/second, identify the app.
let lastGeocode = 0;
async function geocode(q: string) {
  const wait = lastGeocode + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeocode = Date.now();
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&accept-language=en&q=' +
    encodeURIComponent(q);
  const r = await fetch(url, { headers: { 'User-Agent': 'HolidayPlanner/0.1 (personal local app)' } });
  if (!r.ok) throw new Error(`Place search failed (${r.status})`);
  const rows = (await r.json()) as Array<{
    display_name: string;
    name?: string;
    lat: string;
    lon: string;
    address?: { country?: string };
  }>;
  return rows.map((x) => ({
    label: x.display_name,
    name: x.name || x.display_name.split(',')[0],
    country: x.address?.country ?? '',
    lat: Number(Number(x.lat).toFixed(4)),
    lng: Number(Number(x.lon).toFixed(4)),
  }));
}

export function apiPlugin(): Plugin {
  return {
    name: 'holidayplanner-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();
        try {
          const route = `${req.method} ${url.pathname}`;
          switch (route) {
            case 'GET /api/data':
              return send(res, 200, { trips: trips(), settings: settings(), countries: countries() });
            case 'PUT /api/trips': {
              const data = JSON.parse(await body(req)) as Trip[];
              if (!Array.isArray(data)) return send(res, 400, { error: 'Expected an array of trips' });
              writeJson(TRIPS, data);
              return send(res, 200, { ok: true });
            }
            case 'PUT /api/settings': {
              const data = JSON.parse(await body(req)) as Settings;
              writeJson(SETTINGS, data);
              return send(res, 200, { ok: true });
            }
            case 'POST /api/reset': {
              // Throws away local edits and re-copies the spreadsheet import.
              const s = seed();
              writeJson(TRIPS, s.trips);
              writeJson(SETTINGS, s.settings);
              return send(res, 200, { ok: true });
            }
            case 'GET /api/geocode': {
              const q = (url.searchParams.get('q') ?? '').trim();
              if (q.length < 2) return send(res, 400, { error: 'Type a place name' });
              return send(res, 200, await geocode(q));
            }
            default:
              return send(res, 404, { error: 'Not found' });
          }
        } catch (e) {
          return send(res, 500, { error: (e as Error).message });
        }
      });
    },
  };
}
