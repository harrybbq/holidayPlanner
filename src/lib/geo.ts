import type { Stop } from '../types';

export type LatLng = [number, number];

export function km(a: Pick<Stop, 'lat' | 'lng'>, b: Pick<Stop, 'lat' | 'lng'>): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** A gentle arc between two points so out-and-back legs don't sit on top of each other. */
export function arc(a: LatLng, b: LatLng, bend = 0.18, steps = 24): LatLng[] {
  const [y1, x1] = a;
  const [y2, x2] = b;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  // Perpendicular offset (always to the right of travel direction).
  const cx = mx + (y2 - y1) * bend;
  const cy = my - (x2 - x1) * bend;
  const pts: LatLng[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([u * u * y1 + 2 * u * t * cy + t * t * y2, u * u * x1 + 2 * u * t * cx + t * t * x2]);
  }
  return pts;
}

/** Bearing in degrees (screen-ish, for rotating an arrow) between two arc points. */
export function bearing(a: LatLng, b: LatLng): number {
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
}

export const TRIP_COLOURS = [
  '#d9480f', // burnt orange
  '#1971c2', // blue
  '#2b8a3e', // green
  '#9c36b5', // purple
  '#c2255c', // raspberry
  '#0c8599', // teal
  '#e67700', // amber
  '#5f3dc4', // indigo
  '#a61e4d', // wine
  '#087f5b', // pine
  '#364fc7', // royal
  '#862e9c', // plum
];

export function colourFor(index: number): string {
  return TRIP_COLOURS[index % TRIP_COLOURS.length];
}
