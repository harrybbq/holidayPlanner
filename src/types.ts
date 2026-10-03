// Shared shapes for the client, the local API and the xlsx import.
// Dates are ISO 'YYYY-MM-DD' strings (or null when not set yet).

export type InPlan = 'Yes' | 'Parked';
export type TripStatus = 'Idea' | 'Planning' | 'Booked' | 'Done' | 'Cancelled';
export type LeaveStatus = 'Not requested' | 'Requested' | 'Approved' | 'Declined' | 'Cancelled';
export type ClearanceStatus = 'Pre-cleared' | 'Request needed' | 'Likely refused' | 'Unknown';

export interface Stop {
  name: string; // e.g. "Rome"
  country: string; // must match a Countries entry name where possible, e.g. "Italy"
  lat: number;
  lng: number;
  nights?: number | null; // nights spent at this stop, when known
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
