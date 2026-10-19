// Road routes between stops, from the public OSRM server (OpenStreetMap data).
// Each driving leg stores its route along with the inputs it came from, so it is
// only fetched again when the stops, via points or avoid setting change.
// Shared by the browser, the local API and scripts/fill_routes.ts.
import type { Avoid, Leg, Route, Stop, Trip, Via } from '../types';
import { km, type LatLng } from './geo';

const OSRM = 'https://router.project-osrm.org/route/v1/driving/';

export const AVOID_LABEL: Record<Avoid, string> = { motorway: 'motorways', toll: 'toll roads', ferry: 'ferries' };

export type Found = Omit<Route, 'key'>;

export function legOf(s: Stop): Leg {
  return s.leg ?? { by: 'road' };
}

/** The leg's ends with its via points in between. */
export function legPoints(a: Stop, b: Stop, leg: Leg): LatLng[] {
  return [[a.lat, a.lng], ...(leg.via ?? []).map((v): LatLng => [v.lat, v.lng]), [b.lat, b.lng]];
}

export function legKey(a: Stop, b: Stop, leg: Leg): string {
  const pts = legPoints(a, b, leg).map((p) => p.map((n) => n.toFixed(4)).join(','));
  return pts.join(';') + (leg.avoid ? '!' + leg.avoid : '');
}

/** The stored road route, if it still matches the leg. */
export function freshRoute(a: Stop, b: Stop, leg: Leg): Route | null {
  return leg.route && leg.route.key === legKey(a, b, leg) ? leg.route : null;
}

/** Distance of a leg: by road once its route is known, otherwise as the crow flies. */
export function legKm(a: Stop, b: Stop): number {
  const leg = legOf(a);
  const r = leg.by === 'road' ? freshRoute(a, b, leg) : null;
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

export interface Job {
  tripId: string;
  index: number; // the leg leaves stops[index]
  key: string;
  points: LatLng[];
  avoid?: Avoid;
}

/** Driving legs whose road route is missing or out of date. */
export function pendingJobs(trips: Trip[], skip: (key: string) => boolean = () => false): Job[] {
  const out: Job[] = [];
  for (const t of trips) {
    for (let i = 0; i + 1 < t.stops.length; i++) {
      const a = t.stops[i];
      const b = t.stops[i + 1];
      const leg = legOf(a);
      if (leg.by !== 'road' || freshRoute(a, b, leg)) continue;
      const key = legKey(a, b, leg);
      if (!skip(key)) out.push({ tripId: t.id, index: i, key, points: legPoints(a, b, leg), avoid: leg.avoid });
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

// ---------- OSRM ----------

interface OsrmResponse {
  code: string;
  message?: string;
  routes?: Array<{ geometry: string; distance: number; duration: number; legs: Array<{ summary?: string }> }>;
}

// OSRM demo server usage policy: at most one request a second.
let lastRequest = 0;

/** Asks OSRM for the best driving route through the points, in order. */
export async function findRoute(points: LatLng[], avoid?: Avoid, headers?: Record<string, string>): Promise<Found> {
  const wait = lastRequest + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
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
  if (data.code === 'NoRoute' || data.code === 'NoSegment') return { line: null, km: 0, mins: 0, roads: '' };
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
