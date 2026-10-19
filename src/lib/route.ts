// Routes between stops over land, from OpenStreetMap data: roads from the public
// OSRM server, railways from the public BRouter server's rail profile.
// Each driving or train leg stores its route along with the inputs it came from,
// so it is only fetched again when the mode, stops, via points or avoid change.
// Shared by the browser, the local API and scripts/fill_routes.ts.
import type { Avoid, Leg, Route, Stop, Trip, Via } from '../types';
import { km, type LatLng } from './geo';

const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const BROUTER = 'https://brouter.de/brouter';

export const AVOID_LABEL: Record<Avoid, string> = { motorway: 'motorways', toll: 'toll roads', ferry: 'ferries' };

export type Found = Omit<Route, 'key'>;

export function legOf(s: Stop): Leg {
  return s.leg ?? { by: 'road' };
}

/** The leg's ends with its via points in between. A train runs from and to its chosen stations. */
export function legPoints(a: Stop, b: Stop, leg: Leg): LatLng[] {
  const train = leg.by === 'train';
  const from = (train && leg.board) || a;
  const to = (train && leg.alight) || b;
  return [[from.lat, from.lng], ...(leg.via ?? []).map((v): LatLng => [v.lat, v.lng]), [to.lat, to.lng]];
}

export function legKey(a: Stop, b: Stop, leg: Leg): string {
  const pts = legPoints(a, b, leg).map((p) => p.map((n) => n.toFixed(4)).join(',')).join(';');
  if (leg.by === 'train') return 'rail;' + pts;
  return pts + (leg.avoid ? '!' + leg.avoid : '');
}

/** The stored road route, if it still matches the leg. */
export function freshRoute(a: Stop, b: Stop, leg: Leg): Route | null {
  return leg.route && leg.route.key === legKey(a, b, leg) ? leg.route : null;
}

/** Distance of a leg: by road or rail once its route is known, otherwise as the crow flies. */
export function legKm(a: Stop, b: Stop): number {
  const leg = legOf(a);
  const r = leg.by === 'flight' ? null : freshRoute(a, b, leg);
  return r?.line ? r.km : km(a, b);
}

/** Puts a new via point where it adds the least distance, so vias stay in travel order. */
export function insertVia(a: Stop, b: Stop, via: Via[], v: Via): Via[] {
  const pts = [a, ...via, b];
  let best = 0;
  let bestExtra = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const extra = km(pts[i], v) + km(v, pts[i + 1]) - km(pts[i], pts[i + 1]);
    if (extra < bestExtra) [best, bestExtra] = [i, extra];
  }
  return [...via.slice(0, best), v, ...via.slice(best)];
}

const pairKey = (a: Stop, b: Stop) => `${a.lat},${a.lng};${b.lat},${b.lng}`;

/** Adds each leg's settings to `into`, by the pair of stops it joins. */
export function legsByPair(stops: Stop[], into = new Map<string, Leg>()): Map<string, Leg> {
  stops.forEach((s, i) => {
    const next = stops[i + 1];
    if (next && s.leg) into.set(pairKey(s, next), s.leg);
  });
  return into;
}

/**
 * After stops are added, removed or reordered: each pair of neighbours gets the leg
 * settings it had when last side by side, and new pairs drive the best route.
 */
export function relink(stops: Stop[], legs: Map<string, Leg>): Stop[] {
  return stops.map((s, i) => {
    const { leg: _old, ...rest } = s;
    const next = stops[i + 1];
    const leg = next && legs.get(pairKey(s, next));
    return leg ? { ...rest, leg } : rest;
  });
}

/** What to look up: a road or rail route through the points, in order. */
export interface Lookup {
  by: 'road' | 'train';
  points: LatLng[];
  avoid?: Avoid; // roads only
}

export interface Job extends Lookup {
  tripId: string;
  index: number; // the leg leaves stops[index]
  key: string;
}

/** Driving and train legs whose route is missing or out of date. */
export function pendingJobs(trips: Trip[], skip: (key: string) => boolean = () => false): Job[] {
  const out: Job[] = [];
  for (const t of trips) {
    for (let i = 0; i + 1 < t.stops.length; i++) {
      const a = t.stops[i];
      const b = t.stops[i + 1];
      const leg = legOf(a);
      if (leg.by === 'flight' || freshRoute(a, b, leg)) continue;
      const key = legKey(a, b, leg);
      const avoid = leg.by === 'road' ? leg.avoid : undefined;
      if (!skip(key)) out.push({ tripId: t.id, index: i, key, by: leg.by, points: legPoints(a, b, leg), avoid });
    }
  }
  return out;
}

/** Stores a fetched route on its leg, unless the leg changed while it was being fetched. */
export function withRoute(trips: Trip[], job: Job, found: Found): Trip[] {
  const t = trips.find((x) => x.id === job.tripId);
  const a = t?.stops[job.index];
  const b = t?.stops[job.index + 1];
  if (!t || !a || !b || legKey(a, b, legOf(a)) !== job.key) return trips;
  const route: Route = { key: job.key, ...found };
  const stops = t.stops.map((s, i) => (i === job.index ? { ...s, leg: { ...legOf(s), route } } : s));
  return trips.map((x) => (x === t ? { ...t, stops } : x));
}

export function fmtMins(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

// Both public servers ask for light use: at most one request a second between them.
let lastRequest = 0;
async function throttle() {
  const wait = lastRequest + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
}

/** Looks up the route for a driving or train leg. */
export function lookUp(q: Lookup, headers?: Record<string, string>): Promise<Found> {
  return q.by === 'train' ? findRail(q.points, headers) : findRoute(q.points, q.avoid, headers);
}

const NONE: Found = { line: null, km: 0, mins: 0, roads: '' };

// ---------- OSRM (roads) ----------

interface OsrmResponse {
  code: string;
  message?: string;
  routes?: Array<{ geometry: string; distance: number; duration: number; legs: Array<{ summary?: string }> }>;
}

/** Asks OSRM for the best driving route through the points, in order. */
export async function findRoute(points: LatLng[], avoid?: Avoid, headers?: Record<string, string>): Promise<Found> {
  await throttle();
  const url =
    OSRM +
    points.map(([lat, lng]) => `${lng},${lat}`).join(';') +
    '?overview=full&geometries=polyline&steps=true' +
    (avoid ? '&exclude=' + avoid : '');
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  let data: OsrmResponse;
  try {
    data = await r.json();
  } catch {
    throw new Error(`Route finder unavailable (${r.status})`);
  }
  return parseOsrm(data);
}

export function parseOsrm(data: OsrmResponse): Found {
  // NoSegment: a point is nowhere near a road (an island with no ferry, open sea).
  if (data.code === 'NoRoute' || data.code === 'NoSegment') return NONE;
  const r = data.routes?.[0];
  if (data.code !== 'Ok' || !r) throw new Error(data.message || `Route finder said ${data.code}`);
  // Each leg's summary names its two main roads; via points split the route into several legs.
  const roads = [...new Set(r.legs.flatMap((l) => (l.summary ? l.summary.split(', ') : [])))];
  return {
    line: encode(simplify(decode(r.geometry), 0.0003)),
    km: Math.round(r.distance / 1000),
    mins: Math.round(r.duration / 60),
    roads: roads.slice(0, 4).join(', '),
  };
}

// ---------- BRouter (railways) ----------

/** Asks BRouter for the shortest way along railway tracks through the points, in order. */
export async function findRail(points: LatLng[], headers?: Record<string, string>): Promise<Found> {
  await throttle();
  const url =
    BROUTER +
    '?lonlats=' +
    points.map(([lat, lng]) => `${lng},${lat}`).join('|') +
    '&profile=rail&alternativeidx=0&format=geojson';
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
  return parseBrouter(r.status, await r.text(), points);
}

// BRouter reaches out up to 60 km for a track; past this, the stop has no railway of its own.
const NEAR_TRACK_KM = 25;

/** Reads BRouter's reply: GeoJSON on success, a plain-text message (HTTP 400) when it can't route. */
export function parseBrouter(status: number, body: string, points: LatLng[]): Found {
  if (status !== 200) {
    // A stop with no railway near it, or the nearest track is a line that doesn't join up.
    if (/not mapped|no track found|island detected/i.test(body)) return NONE;
    const msg = body.trim().split('\n')[0];
    throw new Error(msg && !msg.startsWith('<') && msg.length < 200 ? msg : `Rail route finder unavailable (${status})`);
  }
  const track = (JSON.parse(body) as BrouterResponse).features?.[0];
  if (!track) throw new Error('Rail route finder sent no route');
  const rails = track.geometry.coordinates.map(([lng, lat]): LatLng => [lat, lng]);
  const gap = (p: LatLng, q: LatLng) => km({ lat: p[0], lng: p[1] }, { lat: q[0], lng: q[1] });
  const [start, end] = [points[0], points[points.length - 1]];
  if (gap(start, rails[0]) > NEAR_TRACK_KM || gap(end, rails[rails.length - 1]) > NEAR_TRACK_KM) return NONE;
  // The tracks start beside the station, so join the line up to the points asked for.
  const line = [start, ...rails, end];
  return { line: encode(simplify(line, 0.0003)), km: Math.round(Number(track.properties['track-length']) / 1000), mins: 0, roads: '' };
}

interface BrouterResponse {
  features?: Array<{ properties: Record<string, string>; geometry: { coordinates: number[][] } }>;
}

// ---------- polylines ----------

/** Google's encoded polyline format, precision 5 (what OSRM returns). */
export function decode(s: string): LatLng[] {
  const out: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let shift = 0;
    let n = 0;
    let b: number;
    do {
      b = s.charCodeAt(i++) - 63;
      n |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return n & 1 ? ~(n >> 1) : n >> 1;
  };
  while (i < s.length) {
    lat += next();
    lng += next();
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

export function encode(pts: LatLng[]): string {
  let out = '';
  let lat = 0;
  let lng = 0;
  const put = (d: number) => {
    let n = d < 0 ? ~(d << 1) : d << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const [y, x] of pts) {
    const a = Math.round(y * 1e5);
    const b = Math.round(x * 1e5);
    put(a - lat);
    put(b - lng);
    lat = a;
    lng = b;
  }
  return out;
}

/** Douglas-Peucker: drops points within `tol` degrees of the line, so stored routes stay small. */
export function simplify(pts: LatLng[], tol: number): LatLng[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let far = -1;
    let max = tol * tol;
    for (let k = i + 1; k < j; k++) {
      const d = offLine(pts[k], pts[i], pts[j]);
      if (d > max) [far, max] = [k, d];
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([i, far], [far, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

/** Squared distance in degrees from p to segment ab, with longitude shrunk by latitude. */
function offLine(p: LatLng, a: LatLng, b: LatLng): number {
  const c = Math.cos((a[0] * Math.PI) / 180);
  const [px, py, ax, ay, bx, by] = [p[1] * c, p[0], a[1] * c, a[0], b[1] * c, b[0]];
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2;
}
