import type { Country, Settings, Trip } from '../types';
import { calendarDays, fmtDate, shiftsUsed, summarise } from '../lib/calc';

export function LeaveView({ trips, settings, countries, onSelect }: { trips: Trip[]; settings: Settings; countries: Country[]; onSelect: (id: string) => void }) {
  const rows = trips.filter((t) => t.inPlan === 'Yes');
  const s = summarise(trips, settings, countries);
  return (
    <div className="table-view">
      <h2>Leave tracker</h2>
      <p className="muted">
        Shifts are counted from your rota: 4 on, 4 off, anchored on {fmtDate(settings.rotaAnchor)} (first day of an on-block).
        Every day from the start date to the end date, inclusive, is checked. Parked trips aren't counted.
      </p>
      <table>
        <thead>
          <tr><th>Trip</th><th>From</th><th>To</th><th className="num">Days</th><th className="num">Shifts</th><th>Status</th><th>Requested</th><th>Notes</th></tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} onClick={() => onSelect(t.id)} className={t.leave.status === 'Cancelled' ? 'struck' : ''}>
              <td><strong>{t.name}</strong></td>
              <td>{fmtDate(t.start)}</td>
              <td>{fmtDate(t.end)}</td>
              <td className="num">{calendarDays(t) ?? '–'}</td>
              <td className="num">{shiftsUsed(t, settings.rotaAnchor) ?? '–'}</td>
              <td>{t.leave.status}</td>
              <td>{fmtDate(t.leave.requestedOn)}</td>
              <td className="small">{t.leave.notes}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={4}>Allowance</td><td className="num">{s.allowance}</td><td colSpan={3} /></tr>
          <tr><td colSpan={4}>Used by planned trips</td><td className="num">{s.used}</td><td colSpan={3} /></tr>
          <tr className={s.remaining < 0 ? 'bad-row' : ''}><td colSpan={4}><strong>Remaining</strong></td><td className="num"><strong>{s.remaining}</strong></td><td colSpan={3} /></tr>
        </tfoot>
      </table>
    </div>
  );
}

const ORDER = ['Pre-cleared', 'Request needed', 'Likely refused'];

export function CountriesView({ countries, trips }: { countries: Country[]; trips: Trip[] }) {
  const visiting = new Map<string, string[]>();
  for (const t of trips) for (const s of t.stops) {
    const k = s.country.toLowerCase();
    const list = visiting.get(k) ?? [];
    if (!list.includes(t.name)) list.push(t.name);
    visiting.set(k, list);
  }
  const unknown = [...new Set(trips.flatMap((t) => t.stops.map((s) => s.country)))].filter(
    (c) => c && !countries.some((x) => x.name.toLowerCase() === c.toLowerCase()),
  );
  return (
    <div className="table-view">
      <h2>Work travel clearance</h2>
      <p className="muted">
        Green is the pre-approved list. Amber means you need to ask first, not that it'll be refused. The red list is
        the spreadsheet's own guess, not company policy. Check with Joe before relying on it.
      </p>
      {unknown.length > 0 && (
        <p className="warn-text">
          Not on any list: {unknown.map((c) => `${c} (${visiting.get(c.toLowerCase())?.join(', ')})`).join('; ')}. Check before booking.
        </p>
      )}
      <div className="country-cols">
        {ORDER.map((status) => (
          <section key={status}>
            <h3><span className={`chip ${status === 'Pre-cleared' ? 'ok' : status === 'Request needed' ? 'warn' : 'bad'}`}>{status}</span></h3>
            <ul className="country-list">
              {countries.filter((c) => c.status === status).map((c) => (
                <li key={c.name} className={visiting.has(c.name.toLowerCase()) ? 'visiting' : ''}>
                  {c.name}
                  {visiting.has(c.name.toLowerCase()) && <span className="small muted"> · {visiting.get(c.name.toLowerCase())!.join(', ')}</span>}
                  {c.note && <div className="small muted">{c.note}</div>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
