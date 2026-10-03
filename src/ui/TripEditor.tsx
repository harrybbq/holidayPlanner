import { useState } from 'react';
import type { InPlan, LeaveStatus, Stop, Trip, TripStatus } from '../types';
import { nights } from '../lib/calc';
import { geocode, type Place } from '../lib/api';
interface Props {
  trip: Trip;
  isNew: boolean;
  onSave: (t: Trip) => void;
  onDelete: () => void;
  onCancel: () => void;
}


const STATUSES: TripStatus[] = ['Idea', 'Planning', 'Booked', 'Done', 'Cancelled'];
const LEAVE: LeaveStatus[] = ['Not requested', 'Requested', 'Approved', 'Declined', 'Cancelled'];

export default function TripEditor({ trip, isNew, onSave, onDelete, onCancel }: Props) {
  const [t, setT] = useState<Trip>(trip);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState('');
  const [planTouched, setPlanTouched] = useState(!isNew);

  const set = <K extends keyof Trip>(k: K, v: Trip[K]) => setT((x) => ({ ...x, [k]: v }));
  const setStops = (stops: Stop[]) => setT((x) => ({ ...x, stops }));
  const setStop = (i: number, patch: Partial<Stop>) =>
    setStops(t.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= t.stops.length) return;
    const s = [...t.stops];
    [s[i], s[j]] = [s[j], s[i]];
    setStops(s);
  };

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setSearching(true);
    setErr('');
    try {
      const data = await geocode(q.trim());
      setResults(data);
      if (data.length === 0) setErr('No places found.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  function add(p: Place) {
    setStops([...t.stops, { name: p.name, country: p.country, lat: p.lat, lng: p.lng, nights: null }]);
    setResults([]);
    setQ('');
  }

  function save() {
    if (!t.name.trim()) return setErr('Give the trip a name.');
    if (t.start && t.end && t.end < t.start) return setErr('End date is before the start date.');
    const destination = t.destination.trim() || t.stops.map((s) => s.name).join(' - ');
    onSave({ ...t, name: t.name.trim(), destination });
  }

  const n = nights(t);
  const stopNights = t.stops.reduce((s, x) => s + (x.nights ?? 0), 0);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-label={isNew ? 'New trip' : `Edit ${trip.name}`}>
        <header className="modal-head">
          <h2>{isNew ? 'Plan a new trip' : `Edit ${trip.name}`}</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Close">×</button>
        </header>

        <div className="modal-body">
          <div className="grid2">
            <label>
              Trip name
              <input value={t.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Lisbon" autoFocus />
            </label>
            <label>
              Who with
              <input value={t.whoWith} onChange={(e) => set('whoWith', e.target.value)} placeholder="Solo, Suz, Friends…" />
            </label>
            <label>
              Start
              <input
                type="date"
                value={t.start ?? ''}
                onChange={(e) => {
                  const v = e.target.value || null;
                  setT((x) => ({ ...x, start: v, inPlan: planTouched ? x.inPlan : v ? 'Yes' : 'Parked' }));
                }}
              />
            </label>
            <label>
              End {n !== null && <span className="muted">· {n} nights</span>}
              <input type="date" value={t.end ?? ''} onChange={(e) => set('end', e.target.value || null)} />
            </label>
            <label>
              In the plan?
              <select
                value={t.inPlan}
                onChange={(e) => {
                  setPlanTouched(true);
                  set('inPlan', e.target.value as InPlan);
                }}
              >
                <option value="Yes">Yes – counts toward totals</option>
                <option value="Parked">Parked – future / not counted</option>
              </select>
            </label>
            <label>
              Status
              <select value={t.status} onChange={(e) => set('status', e.target.value as TripStatus)}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>
              Est. cost (£)
              <input type="number" min={0} step={50} value={t.cost} onChange={(e) => set('cost', Number(e.target.value) || 0)} />
            </label>
            <label>
              Book by
              <input type="date" value={t.bookBy ?? ''} onChange={(e) => set('bookBy', e.target.value || null)} />
            </label>
          </div>

          <fieldset>
            <legend>
              Route {t.stops.length > 0 && <span className="muted">· {t.stops.length} stop{t.stops.length === 1 ? '' : 's'}
              {stopNights > 0 && ` · ${stopNights} nights assigned`}{n !== null && stopNights > 0 && stopNights !== n && ` of ${n}`}</span>}
            </legend>
            {t.stops.length === 0 && <p className="muted small">No stops yet. Search for a place below. Add several for a multi-stop trip; they're visited in order.</p>}
            <ol className="stop-edit">
              {t.stops.map((s, i) => (
                <li key={i}>
                  <span className="rm-num">{i + 1}</span>
                  <input className="grow" value={s.name} onChange={(e) => setStop(i, { name: e.target.value })} aria-label="Stop name" />
                  <input className="country" value={s.country} onChange={(e) => setStop(i, { country: e.target.value })} aria-label="Country" />
                  <input
                    className="nights"
                    type="number"
                    min={0}
                    placeholder="nts"
                    value={s.nights ?? ''}
                    onChange={(e) => setStop(i, { nights: e.target.value === '' ? null : Number(e.target.value) })}
                    aria-label="Nights"
                  />
                  <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === t.stops.length - 1} aria-label="Move down">↓</button>
                  <button className="icon-btn" onClick={() => setStops(t.stops.filter((_, j) => j !== i))} aria-label="Remove stop">×</button>
                </li>
              ))}
            </ol>
            <form className="search" onSubmit={search}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a stop: city, town or landmark" />
              <button className="btn" disabled={searching}>{searching ? 'Searching…' : 'Find'}</button>
            </form>
            {results.length > 0 && (
              <ul className="results">
                {results.map((p, i) => (
                  <li key={i}>
                    <button onClick={() => add(p)}>
                      <strong>{p.name}</strong> <span className="muted small">{p.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <fieldset>
            <legend>Leave</legend>
            <div className="grid2">
              <label>
                Leave status
                <select value={t.leave.status} onChange={(e) => set('leave', { ...t.leave, status: e.target.value as LeaveStatus })}>
                  {LEAVE.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label>
                Requested on
                <input type="date" value={t.leave.requestedOn ?? ''} onChange={(e) => set('leave', { ...t.leave, requestedOn: e.target.value || null })} />
              </label>
            </div>
            <label>
              Notified on <span className="muted">· when you told work about the trip</span>
              <input type="date" value={t.notifiedOn ?? ''} onChange={(e) => set('notifiedOn', e.target.value || null)} />
            </label>
            <label>
              Leave notes
              <input value={t.leave.notes} onChange={(e) => set('leave', { ...t.leave, notes: e.target.value })} />
            </label>
          </fieldset>

          <label>
            Destination label <span className="muted">· optional, defaults to the stops</span>
            <input value={t.destination} onChange={(e) => set('destination', e.target.value)} />
          </label>
          <label>
            Notes
            <textarea rows={3} value={t.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>
          {err && <p className="warn-text">{err}</p>}
        </div>

        <footer className="modal-foot">
          {!isNew && (
            <button className="btn danger" onClick={() => confirm(`Delete ${trip.name}?`) && onDelete()}>
              Delete trip
            </button>
          )}
          <span className="spacer" />
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={save}>{isNew ? 'Add trip' : 'Save'}</button>
        </footer>
      </div>
    </div>
  );
}
