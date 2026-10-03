// One data layer for both ways of running the app.
// Local (npm run dev): the Vite dev server's /api reads and writes ./data.
// Published (GitHub Pages, built with VITE_STATIC=1): there is no server, so the
// committed seed is baked into the build and edits are kept in this browser.
import type { Country, SeedFile, Settings, Trip } from '../types';

export const STATIC = !!import.meta.env.VITE_STATIC;

export interface Place {
  label: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
}

export interface AppData {
  trips: Trip[];
  settings: Settings;
  countries: Country[];
}

const TRIPS_KEY = 'holidayplanner.trips.v1';
const SETTINGS_KEY = 'holidayplanner.settings.v1';
const BUILD_KEY = 'holidayplanner.build.v1';

function stored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function send(path: string, method: string, data?: unknown): Promise<void> {
  const r = await fetch(path, {
    method,
    headers: data === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

export async function loadData(): Promise<AppData> {
  if (!STATIC) return (await fetch('/api/data')).json();
  const seed = (await import('../../data/seed.json')).default as unknown as SeedFile;
  // A new deploy carries newer data, so it replaces edits made on the old one.
  try {
    if (localStorage.getItem(BUILD_KEY) !== __BUILD_ID__) {
      localStorage.removeItem(TRIPS_KEY);
      localStorage.removeItem(SETTINGS_KEY);
      localStorage.setItem(BUILD_KEY, __BUILD_ID__);
    }
  } catch {
    /* storage unavailable: just show the seed */
  }
  return {
    trips: stored<Trip[]>(TRIPS_KEY) ?? seed.trips,
    settings: stored<Settings>(SETTINGS_KEY) ?? seed.settings,
    // The clearance lists are local only and never published.
    countries: [],
  };
}

export async function saveTrips(trips: Trip[]): Promise<void> {
  if (STATIC) return store(TRIPS_KEY, trips);
  await send('/api/trips', 'PUT', trips);
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (STATIC) return store(SETTINGS_KEY, settings);
  await send('/api/settings', 'PUT', settings);
}

/** Throws away edits and goes back to the spreadsheet import. */
export async function reset(): Promise<void> {
  if (STATIC) {
    localStorage.removeItem(TRIPS_KEY);
    localStorage.removeItem(SETTINGS_KEY);
    return;
  }
  await send('/api/reset', 'POST');
}

// Nominatim usage policy: max 1 request/second.
let lastGeocode = 0;

export async function geocode(q: string): Promise<Place[]> {
  if (!STATIC) {
    const r = await fetch('/api/geocode?q=' + encodeURIComponent(q));
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    return data;
  }
  const wait = lastGeocode + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeocode = Date.now();
  const r = await fetch(
    'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&accept-language=en&q=' +
      encodeURIComponent(q),
  );
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
