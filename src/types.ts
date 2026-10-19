// Shared shapes for the client, the local API and the xlsx import.
// Dates are ISO 'YYYY-MM-DD' strings (or null when not set yet).

export type InPlan = 'Yes' | 'Parked';
export type TripStatus = 'Idea' | 'Planning' | 'Booked' | 'Done' | 'Cancelled';
export type LeaveStatus = 'Not requested' | 'Requested' | 'Approved' | 'Declined' | 'Cancelled';
export type ClearanceStatus = 'Pre-cleared' | 'Request needed' | 'Likely refused' | 'Unknown';

export type Travel = 'road' | 'flight';
export type Avoid = 'motorway' | 'toll' | 'ferry';

/** A place the road route must pass through: a town, or a point on the road you want to use. */
export interface Via {
  name: string;
  lat: number;
  lng: number;
}

/** A leg's road route, worked out by OSRM from OpenStreetMap data. */
export interface Route {
  key: string; // the ends, via points and avoid it was worked out for; when they change it's redone
  line: string | null; // encoded polyline (precision 5), or null when no road joins the two stops
  km: number;
  mins: number;
  roads: string; // main roads used, e.g. "I 5, US 101"
}

/** How you get from a stop to the next one. No leg means drive the best route. */
export interface Leg {
  by: Travel;
  via?: Via[]; // driving only, in travel order
  avoid?: Avoid; // driving only
  route?: Route;
}

/**
 * base: where you stay put for a while (the default, and what the map numbers).
 * overnight: a night or two on the move, e.g. towns down a coast road.
 * Places you only pass through are a driving leg's via points, not stops.
 */
export type StopKind = 'base' | 'overnight';

export interface Stop {
  name: string; // e.g. "Rome"
  country: string; // must match a Countries entry name where possible, e.g. "Italy"
  lat: number;
  lng: number;
  nights?: number | null; // nights spent at this stop, when known
  kind?: StopKind; // missing = 'base'
  leg?: Leg; // getting from here to the next stop; ignored on the last stop
}

export interface Leave {
  status: LeaveStatus;
  requestedOn: string | null;
  notes: string;
}

export interface Trip {
  id: string; // stable slug, e.g. "italy"
  name: string; // "Italy"
  destination: string; // free text from the sheet, e.g. "Rome - Venice - Verona - Como - Milan"
  stops: Stop[]; // ordered route; may be empty (destination TBC); names may repeat
  start: string | null;
  end: string | null;
  whoWith: string;
  inPlan: InPlan;
  cost: number; // GBP estimate
  status: TripStatus;
  bookBy: string | null;
  clearance: string; // unused free text; clearance is worked out from the stops
  notifiedOn: string | null;
  notes: string;
  leave: Leave;
}

export interface Settings {
  allowanceShifts: number; // 35
  rotaAnchor: string; // first day of a 4-on block, '2026-12-31'
  monthsUntilLastTrip: number; // 13
}

export interface Country {
  name: string;
  status: ClearanceStatus;
  note: string;
}

export interface SeedFile {
  settings: Settings;
  trips: Trip[];
}
