import { useRef, useState } from 'react';
import type { Avoid, InPlan, Leg, LeaveStatus, Stop, StopKind, Travel, Trip, TripStatus } from '../types';
import { baseNumbers, nights, stopKind } from '../lib/calc';
import { km } from '../lib/geo';
import { geocode, type Place } from '../lib/api';
import { shrinkImage, validImage } from '../lib/image';
import { AVOID_LABEL, freshRoute, insertVia, legOf, legsByPair, relink } from '../lib/route';
interface Props {
  trip: Trip;
  isNew: boolean;
  onSave: (t: Trip) => void;
  onDelete: () => void;
  onCancel: () => void;
}


const STATUSES: TripStatus[] = ['Idea', 'Planning', 'Booked', 'Done', 'Cancelled'];
const MODES: Array<[Travel, string]> = [
  ['road', 'Drive'],
  ['train', 'Train'],
  ['flight', '✈ Fly'],
];
const LEAVE: LeaveStatus[] = ['Not requested', 'Requested', 'Approved', 'Declined', 'Cancelled'];

export default function TripEditor({ trip, isNew, onSave, onDelete, onCancel }: Props) {
  const [t, setT] = useState<Trip>(trip);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState('');
  const [planTouched, setPlanTouched] = useState(!isNew);

  const set = <K extends keyof Trip>(k: K, v: Trip[K]) => setT((x) => ({ ...x, [k]: v }));
  // Leg settings for every pair of neighbouring stops seen while editing, so a pair split up
  // by moving a stop gets its settings back when it's put back together.
  const pairs = useRef(new Map<string, Leg>());
  const setStops = (stops: Stop[]) => {
    legsByPair(t.stops, pairs.current);
    setT((x) => ({ ...x, stops: relink(stops, pairs.current) }));
  };
  const setStop = (i: number, patch: Partial<Stop>) =>
    setT((x) => ({ ...x, stops: x.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
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
    if (t.image && !validImage(t.image)) return setErr('The feature image needs to be a web link (https://…) or an upload.');
    const destination = t.destination.trim() || t.stops.map((s) => s.name).join(' - ');
    onSave({ ...t, name: t.name.trim(), destination });
  }

  const n = nights(t);
  const stopNights = t.stops.reduce((s, x) => s + (x.nights ?? 0), 0);
  const nums = baseNumbers(t.stops);

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
                  <span className={`rm-num ${stopKind(s) === 'base' ? '' : 'rm-num-minor'}`}>{nums[i] ?? '·'}</span>
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
                  <select
                    className="kind"
                    value={stopKind(s)}
                    onChange={(e) => {
                      const kind = e.target.value as StopKind;
                      setStop(i, kind === 'overnight' && !s.nights ? { kind, nights: 1 } : { kind });
                    }}
                    aria-label="Stop type"
                    title="Base: staying put for a while · Overnight: a night or two on the move. Places you only pass through go in a leg's Choose roads."
                  >
                    <option value="base">Base</option>
                    <option value="overnight">Overnight</option>
                  </select>
                  <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                  <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === t.stops.length - 1} aria-label="Move down">↓</button>
                  <button className="icon-btn" onClick={() => setStops(t.stops.filter((_, j) => j !== i))} aria-label="Remove stop">×</button>
                  {i + 1 < t.stops.length && (
                    <LegEdit
                      key={`${s.lat},${s.lng};${t.stops[i + 1].lat},${t.stops[i + 1].lng}`}
                      from={s}
                      to={t.stops[i + 1]}
                      leg={legOf(s)}
                      onChange={(leg) => setStop(i, { leg })}
                    />
                  )}
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
          <ImageField image={t.image} onChange={(image) => set('image', image)} />
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

/** How to get from one stop to the next: fly, or drive or take the train by the best route or a chosen one. */
function LegEdit({ from, to, leg, onChange }: { from: Stop; to: Stop; leg: Leg; onChange: (leg: Leg) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState('');
  const via = leg.via ?? [];
  const route = freshRoute(from, to, leg);
  const train = leg.by === 'train';

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    // Rank roads and places around this leg first, so "A82" or "US-101" finds the right stretch.
    const pts = [from, to, ...via, ...(leg.board ? [leg.board] : []), ...(leg.alight ? [leg.alight] : [])];
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const pad = 0.5;
    const near = [Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad];
    setSearching(true);
    setErr('');
    try {
      const data = await geocode(q.trim(), near);
      setResults(data);
      if (data.length === 0)
        setErr(train ? 'Nothing found. Try a town or station on the line.' : 'Nothing found. Try a town on the road, or the road with its area.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  /** Uses a search result as a via point, or for trains as the station to board or get off at. */
  function pick(p: Place, as: 'via' | 'board' | 'alight') {
    const place = { name: p.name, lat: p.lat, lng: p.lng };
    onChange(as === 'via' ? { ...leg, via: insertVia(from, to, via, place) } : { ...leg, [as]: place });
    setResults([]);
    setQ('');
  }

  // What's been chosen for the leg, in travel order, each removable.
  const chips = [
    ...(train && leg.board ? [{ text: `Board at ${leg.board.name}`, remove: () => onChange({ ...leg, board: undefined }) }] : []),
    ...via.map((v, i) => ({ text: `via ${v.name}`, remove: () => onChange({ ...leg, via: via.filter((_, j) => j !== i) }) })),
    ...(train && leg.alight ? [{ text: `Get off at ${leg.alight.name}`, remove: () => onChange({ ...leg, alight: undefined }) }] : []),
  ];

  const summary =
    leg.by === 'flight'
      ? `~${Math.round(km(from, to)).toLocaleString('en-GB')} km to ${to.name}`
      : [
          train && leg.board && 'from ' + leg.board.name,
          via.length ? 'via ' + via.map((v) => v.name).join(', ') : !train && 'best route',
          train && leg.alight && 'to ' + leg.alight.name,
          train && !leg.board && !leg.alight && !via.length && 'shortest rail route',
          !train && leg.avoid && 'no ' + AVOID_LABEL[leg.avoid],
          route?.line
            ? `${route.km.toLocaleString('en-GB')} km${route.roads ? ' on ' + route.roads : ''}`
            : route && (train ? 'no railway found' : 'no road found'),
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <div className="leg-edit">
      <div className="leg-line">
        <div className="seg" role="group" aria-label={`${from.name} to ${to.name}`}>
          {MODES.map(([by, label]) => (
            <button
              key={by}
              type="button"
              className={leg.by === by ? 'on' : ''}
              aria-pressed={leg.by === by}
              onClick={() => onChange({ ...leg, by })}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="leg-sum muted small">{summary}</span>
        {leg.by !== 'flight' && (
          <button type="button" className="link small" onClick={() => setOpen(!open)}>
            {open ? 'Done' : train ? 'Choose route' : 'Choose roads'}
          </button>
        )}
      </div>
      {leg.by !== 'flight' && open && (
        <div className="leg-roads">
          {chips.length > 0 && (
            <ul className="via-list">
              {chips.map((c) => (
                <li key={c.text}>
                  {c.text}
                  <button type="button" className="icon-btn" onClick={c.remove} aria-label={`Remove ${c.text}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="search" onSubmit={search}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={train ? 'Search for a station, or a town on the line you want' : 'Go via a road or place, e.g. US-101 or Port Townsend'}
            />
            <button className="btn" disabled={searching}>{searching ? 'Searching…' : 'Find'}</button>
          </form>
          {err && <p className="warn-text small">{err}</p>}
          {results.length > 0 && (
            <ul className="results">
              {results.map((p, i) =>
                train ? (
                  <li key={i} className="station-result">
                    <span className="grow">
                      <strong>{p.name}</strong> <span className="muted small">{p.label}</span>
                    </span>
                    <span className="station-actions">
                      <button type="button" className="btn sm" onClick={() => pick(p, 'board')}>Board here</button>
                      <button type="button" className="btn sm" onClick={() => pick(p, 'via')}>Via</button>
                      <button type="button" className="btn sm" onClick={() => pick(p, 'alight')}>Get off here</button>
                    </span>
                  </li>
                ) : (
                  <li key={i}>
                    <button type="button" onClick={() => pick(p, 'via')}>
                      <strong>{p.name}</strong> <span className="muted small">{p.label}</span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
          {!train && (
            <div className="avoid">
              <span>Avoid</span>
              <select value={leg.avoid ?? ''} onChange={(e) => onChange({ ...leg, avoid: (e.target.value || undefined) as Avoid | undefined })}>
                <option value="">nothing</option>
                {(Object.keys(AVOID_LABEL) as Avoid[]).map((a) => (
                  <option key={a} value={a}>{AVOID_LABEL[a]}</option>
                ))}
              </select>
            </div>
          )}
          <p className="muted small">
            {train
              ? "With nothing chosen it takes the shortest way along the tracks from the stops' pins. If no railway is found, or it starts on the wrong line, search for the stations and use Board here and Get off here; add towns to go through to pick the line."
              : 'With nothing chosen it takes the fastest route. Add the towns or roads you want it to go through.'}{' '}
            The route is worked out again when you save.
          </p>
        </div>
      )}
    </div>
  );
}

/** The trip's feature image: paste a link or upload a photo, with a preview. */
function ImageField({ image, onChange }: { image?: string; onChange: (image: string | undefined) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [broken, setBroken] = useState(false);
  const uploaded = image?.startsWith('data:');

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ''; // so picking the same file again still fires
    if (!f) return;
    setBusy(true);
    setMsg('');
    try {
      setBroken(false);
      onChange(await shrinkImage(f));
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="image-field">
      <span className="field-label">
        Feature image <span className="muted">· shown at the top of the trip when you open it</span>
      </span>
      {image && !broken && <img className="image-preview" src={image} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />}
      {image && broken && <p className="warn-text small">That link doesn't load as an image. Use a direct link to the picture itself.</p>}
      <div className="image-row">
        <input
          value={uploaded ? '' : (image ?? '')}
          onChange={(e) => {
            setBroken(false);
            onChange(e.target.value.trim() || undefined);
          }}
          placeholder={uploaded ? 'Uploaded from this computer' : 'Paste an image link: https://…'}
          aria-label="Feature image link"
        />
        <button type="button" className="btn" onClick={() => file.current?.click()} disabled={busy}>
          {busy ? 'Reading…' : 'Upload…'}
        </button>
        {image && (
          <button type="button" className="btn ghost" onClick={() => onChange(undefined)} aria-label="Remove feature image">
            Remove
          </button>
        )}
        <input ref={file} type="file" accept="image/*" hidden onChange={upload} />
      </div>
      {msg && <p className="warn-text small">{msg}</p>}
    </div>
  );
}
