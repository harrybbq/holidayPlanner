// Same maths as the spreadsheet. All day arithmetic is done in UTC so that
// BST changeovers never produce 23/25-hour "days".
import type { Country, ClearanceStatus, Settings, Trip } from '../types';

const DAY = 86_400_000;

export function toDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
}

export function fromDay(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

export function todayIso(): string {
  const n = new Date();
  return fromDay(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / DAY);
}

export function daysBetween(a: string, b: string): number {
  return toDay(b) - toDay(a);
}

/** end - start, as the Trips sheet's Nights column. */
export function nights(t: Pick<Trip, 'start' | 'end'>): number | null {
  if (!t.start || !t.end) return null;
  return daysBetween(t.start, t.end);
}

/** Inclusive day count, as the Leave Tracker's Calendar days column. */
export function calendarDays(t: Pick<Trip, 'start' | 'end'>): number | null {
  const n = nights(t);
  return n === null ? null : n + 1;
}

/** True when this date is a working shift on the 4-on-4-off rota. */
export function isShiftDay(iso: string, anchor: string): boolean {
  const k = toDay(iso) - toDay(anchor);
  return ((k % 8) + 8) % 8 < 4;
}

/** Shifts lost to a trip: rota on-days from start to end inclusive. */
export function shiftsUsed(t: Pick<Trip, 'start' | 'end'>, anchor: string): number | null {
  if (!t.start || !t.end) return null;
  const a = toDay(t.start);
  const b = toDay(t.end);
  let n = 0;
  for (let d = a; d <= b; d++) if (isShiftDay(fromDay(d), anchor)) n++;
  return n;
}

export interface Summary {
  allowance: number;
  used: number;
  remaining: number;
  inPlanCost: number;
  parkedCost: number;
  monthlySaving: number;
  needsClearance: number;
}

export function summarise(trips: Trip[], settings: Settings, countries: Country[]): Summary {
  const inPlan = trips.filter((t) => t.inPlan === 'Yes');
  const used = inPlan
    .filter((t) => t.leave.status !== 'Cancelled' && t.status !== 'Cancelled')
    .reduce((s, t) => s + (shiftsUsed(t, settings.rotaAnchor) ?? 0), 0);
  const inPlanCost = inPlan.filter((t) => t.status !== 'Cancelled').reduce((s, t) => s + t.cost, 0);
  const parkedCost = trips.filter((t) => t.inPlan === 'Parked').reduce((s, t) => s + t.cost, 0);
  return {
    allowance: settings.allowanceShifts,
    used,
    remaining: settings.allowanceShifts - used,
    inPlanCost,
    parkedCost,
    monthlySaving: settings.monthsUntilLastTrip > 0 ? inPlanCost / settings.monthsUntilLastTrip : 0,
    needsClearance: inPlan.filter((t) => tripClearance(t, countries) !== 'Pre-cleared' && t.stops.length > 0)
      .length,
  };
}

const RANK: Record<ClearanceStatus, number> = {
  'Pre-cleared': 0,
  Unknown: 1,
  'Request needed': 2,
  'Likely refused': 3,
};

export function countryStatus(country: string, countries: Country[]): ClearanceStatus {
  const c = countries.find((x) => x.name.toLowerCase() === country.trim().toLowerCase());
  return c ? c.status : 'Unknown';
}

/** Worst clearance status across a trip's stops. */
export function tripClearance(t: Trip, countries: Country[]): ClearanceStatus {
  let worst: ClearanceStatus = 'Pre-cleared';
  for (const s of t.stops) {
    const st = countryStatus(s.country, countries);
    if (RANK[st] > RANK[worst]) worst = st;
  }
  return worst;
}

/** In-plan trips by start date, then undated, then parked (sheet order). */
export function sortTrips(trips: Trip[]): Trip[] {
  const key = (t: Trip) => (t.inPlan === 'Yes' ? 0 : 1);
  return [...trips].sort((a, b) => {
    if (key(a) !== key(b)) return key(a) - key(b);
    if (a.start && b.start) return a.start.localeCompare(b.start);
    if (a.start) return -1;
    if (b.start) return 1;
    return 0;
  });
}

/** Days from today until a date (negative = past). */
export function daysUntil(iso: string, today = todayIso()): number {
  return daysBetween(today, iso);
}

export function fmtDate(iso: string | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!iso) return '';
  return new Date(toDay(iso) * DAY).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

export function fmtMoney(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip';
}
