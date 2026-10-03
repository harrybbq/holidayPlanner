import type { Country, Settings, Trip } from '../types';
import { calendarDays, countryStatus, daysUntil, fmtDate, fmtMoney, fromDay, nights, shiftsUsed, toDay, tripClearance } from '../lib/calc';
import { km } from '../lib/geo';

interface Props {
  trip: Trip;
  colour: string;
  settings: Settings;
  countries: Country[];
  onEdit: () => void;
  onClose: () => void;
}

const CLEARANCE_CLASS: Record<string, string> = {
  'Pre-cleared': 'ok',
  Unknown: 'warn',
  'Request needed': 'warn',
  'Likely refused': 'bad',
};

export default function TripDetail({ trip, colour, settings, countries, onEdit, onClose }: Props) {
  const n = nights(trip);
  const shifts = shiftsUsed(trip, settings.rotaAnchor);
  const clearance = tripClearance(trip, countries);
  const plannedNights = trip.stops.reduce((s, x) => s + (x.nights ?? 0), 0);
  const allNightsKnown = trip.stops.length > 0 && trip.stops.every((s) => s.nights);
  const totalKm = trip.stops.slice(1).reduce((s, x, i) => s + km(trip.stops[i], x), 0);

  // Arrival dates per stop, when the trip is dated and each stop's nights are known.
  let cursor = trip.start ? toDay(trip.start) : null;
  const arrivals = trip.stops.map((s) => {
    const here = cursor;
    if (cursor !== null && s.nights) cursor += s.nights;
    else cursor = null;
    return here === null ? null : fromDay(here);
  });

  const bookIn = trip.bookBy ? daysUntil(trip.bookBy) : null;

  return (
    <aside className="detail" style={{ ['--c' as string]: colour }}>
      <header className="detail-head">
        <div>
          <div className="eyebrow">
            <span className="swatch" /> {trip.inPlan === 'Yes' ? trip.status : 'Parked'} · {trip.whoWith || 'Solo'}
          </div>
          <h2>{trip.name}</h2>
          <div className="muted">{trip.destination}</div>
        </div>
        <div className="detail-actions">
          <button className="btn" onClick={onEdit}>Edit</button>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
      </header>

      <dl className="facts">
        <div>
          <dt>Dates</dt>
          <dd>{trip.start ? `${fmtDate(trip.start, { day: 'numeric', month: 'short' })} – ${fmtDate(trip.end)}` : 'Not set'}</dd>
        </div>
        <div>
          <dt>Nights</dt>
          <dd>{n ?? '–'}{n !== null && <span className="muted"> ({calendarDays(trip)} days)</span>}</dd>
        </div>
        <div>
          <dt>Shifts used</dt>
          <dd>{shifts ?? '–'}</dd>
        </div>
        <div>
          <dt>Est. cost</dt>
          <dd>{fmtMoney(trip.cost)}</dd>
        </div>
        <div>
          <dt>Book by</dt>
          <dd className={bookIn !== null && bookIn < 60 ? 'due' : ''}>
            {trip.bookBy ? fmtDate(trip.bookBy) : '–'}
            {bookIn !== null && <span className="muted"> ({bookIn >= 0 ? `${bookIn}d` : 'passed'})</span>}
          </dd>
        </div>
        {countries.length > 0 && (
          <div>
            <dt>Clearance</dt>
            <dd>
              <span className={`chip ${CLEARANCE_CLASS[clearance]}`}>{trip.stops.length ? clearance : 'No destination'}</span>
            </dd>
          </div>
        )}
      </dl>

      <section>
        <h3>
          Route
          {trip.stops.length > 1 && <span className="muted"> · {trip.stops.length} stops · ~{Math.round(totalKm).toLocaleString('en-GB')} km</span>}
        </h3>
        {trip.stops.length === 0 && <p className="muted">No destination yet. Add stops with Edit.</p>}
        <ol className="roadmap">
          {trip.stops.map((s, i) => {
            const next = trip.stops[i + 1];
            const st = countryStatus(s.country, countries);
            return (
              <li key={i}>
                <div className="rm-stop">
                  <span className="rm-num">{i + 1}</span>
                  <div className="rm-body">
                    <div className="rm-name">
                      {s.name}
                      <span className="muted"> · {s.country}</span>
                      {countries.length > 0 && st !== 'Pre-cleared' && <span className={`chip sm ${CLEARANCE_CLASS[st]}`}>{st}</span>}
                    </div>
                    <div className="muted small">
                      {arrivals[i] && fmtDate(arrivals[i], { weekday: 'short', day: 'numeric', month: 'short' })}
                      {arrivals[i] && s.nights ? ' · ' : ''}
                      {s.nights ? `${s.nights} night${s.nights === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                </div>
                {next && <div className="rm-leg">{Math.round(km(s, next)).toLocaleString('en-GB')} km to {next.name}</div>}
              </li>
            );
          })}
        </ol>
        {trip.stops.length > 0 && n !== null && plannedNights > 0 && plannedNights !== n && (
          <p className="warn-text small">
            Stop nights add up to {plannedNights}, but the dates give {n}.
          </p>
        )}
        {trip.stops.length > 1 && !allNightsKnown && trip.start && (
          <p className="muted small">Add nights to each stop to see arrival dates.</p>
        )}
      </section>

      <section>
        <h3>Leave</h3>
        <div className="leave-row">
          <span className={`chip ${trip.leave.status === 'Approved' ? 'ok' : trip.leave.status === 'Declined' ? 'bad' : 'warn'}`}>
            {trip.leave.status}
          </span>
          {trip.leave.requestedOn && <span className="muted small">requested {fmtDate(trip.leave.requestedOn)}</span>}
          {trip.notifiedOn && <span className="muted small">· work notified {fmtDate(trip.notifiedOn)}</span>}
        </div>
        {trip.leave.notes && <p className="small">{trip.leave.notes}</p>}
      </section>

      {trip.notes && (
        <section>
          <h3>Notes</h3>
          <p className="notes">{trip.notes}</p>
        </section>
      )}
    </aside>
  );
}
