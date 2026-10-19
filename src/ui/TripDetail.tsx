import type { Country, Settings, Stop, Trip } from '../types';
import { baseNumbers, calendarDays, countryStatus, daysUntil, fmtDate, fmtMoney, fromDay, nights, shiftsUsed, stopKind, toDay, tripClearance } from '../lib/calc';
import { km } from '../lib/geo';
import { AVOID_LABEL, fmtMins, freshRoute, legKey, legKm, legOf } from '../lib/route';

interface Props {
  trip: Trip;
  colour: string;
  settings: Settings;
  countries: Country[];
  routeErrors: Record<string, string>;
  onEdit: () => void;
  onClose: () => void;
}

const kms = (n: number) => Math.round(n).toLocaleString('en-GB');

/** How you get from a to b: the flight, the road route, or why there isn't one yet. */
function LegInfo({ a, b, routeErrors }: { a: Stop; b: Stop; routeErrors: Record<string, string> }) {
  const leg = legOf(a);
  if (leg.by === 'flight') return <div className="rm-leg">✈ Fly ~{kms(km(a, b))} km to {b.name}</div>;
  const r = freshRoute(a, b, leg);
  const chosen = [
    leg.via?.length ? 'via ' + leg.via.map((v) => v.name).join(', ') : '',
    leg.avoid ? 'no ' + AVOID_LABEL[leg.avoid] : '',
  ].filter(Boolean);
  if (r?.line) {
    const detail = [r.roads, ...chosen].filter(Boolean).join(' · ');
    return (
      <div className="rm-leg">
        Drive {kms(r.km)} km · {fmtMins(r.mins)} to {b.name}
        {detail && <div className="rm-roads">{detail}</div>}
      </div>
    );
  }
  if (r) {
    return (
      <div className="rm-leg">
        <span className="warn-text">No road to {b.name}{chosen.length ? ` (${chosen.join(', ')})` : ''}.</span> Edit the trip to fly
        this leg{chosen.length ? ' or change its roads' : ''}.
      </div>
    );
  }
  const err = routeErrors[legKey(a, b, leg)];
  return (
    <div className="rm-leg">
      Drive to {b.name} · {err ? <span className="warn-text">couldn't get the route: {err}</span> : 'finding the roads…'}
    </div>
  );
}

const CLEARANCE_CLASS: Record<string, string> = {
  'Pre-cleared': 'ok',
  Unknown: 'warn',
  'Request needed': 'warn',
  'Likely refused': 'bad',
};

export default function TripDetail({ trip, colour, settings, countries, routeErrors, onEdit, onClose }: Props) {
  const n = nights(trip);
  const shifts = shiftsUsed(trip, settings.rotaAnchor);
  const clearance = tripClearance(trip, countries);
  const plannedNights = trip.stops.reduce((s, x) => s + (x.nights ?? 0), 0);
  const allNightsKnown = trip.stops.length > 0 && trip.stops.every((s) => s.nights);
  // Driving counts road distance once each route is in; until then, and for flights, it's as the crow flies.
  const totals = { road: 0, flight: 0 };
  trip.stops.slice(1).forEach((x, i) => (totals[legOf(trip.stops[i]).by] += legKm(trip.stops[i], x)));
  const distance = [
    totals.road > 0 && `~${kms(totals.road)} km by road`,
    totals.flight > 0 && `~${kms(totals.flight)} km flying`,
  ].filter(Boolean);

  // Arrival dates per stop, when the trip is dated and each stop's nights are known.
  let cursor = trip.start ? toDay(trip.start) : null;
  const arrivals = trip.stops.map((s) => {
    const here = cursor;
    if (cursor !== null && s.nights) cursor += s.nights;
    else cursor = null;
    return here === null ? null : fromDay(here);
  });

  const nums = baseNumbers(trip.stops);
  const bases = nums.filter((x) => x !== null).length;
  const overnights = trip.stops.length - bases;
  const stopCount = overnights ? `${bases} bases · ${overnights} overnight` : `${trip.stops.length} stops`;

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
          {trip.stops.length > 1 && <span className="muted"> · {[stopCount, ...distance].join(' · ')}</span>}
        </h3>
        {trip.stops.length === 0 && <p className="muted">No destination yet. Add stops with Edit.</p>}
        <ol className="roadmap">
          {trip.stops.map((s, i) => {
            const next = trip.stops[i + 1];
            const st = countryStatus(s.country, countries);
            const kind = stopKind(s);
            return (
              <li key={i} className={`rm-${kind}`}>
                <div className="rm-stop">
                  <span className="rm-num">{nums[i] ?? ''}</span>
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
                      {kind === 'overnight' && ((arrivals[i] || s.nights ? ' · ' : '') + ((s.nights ?? 0) > 1 ? 'short stay' : 'overnight stop'))}
                    </div>
                  </div>
                </div>
                {next && <LegInfo a={s} b={next} routeErrors={routeErrors} />}
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
