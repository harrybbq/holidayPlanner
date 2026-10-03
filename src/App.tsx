import { useEffect, useMemo, useState } from 'react';
import type { Country, Settings, Trip } from './types';
import { daysUntil, fmtDate, fmtMoney, nights, shiftsUsed, slug, sortTrips, summarise, tripClearance } from './lib/calc';
import { colourFor } from './lib/geo';
import * as api from './lib/api';
import TripMap from './ui/TripMap';
import TripDetail from './ui/TripDetail';
import TripEditor from './ui/TripEditor';
import Calendar from './ui/Calendar';
import { CountriesView, LeaveView } from './ui/Tables';

type View = 'map' | 'calendar' | 'leave' | 'clearance';

function blankTrip(start: string | null = null, end: string | null = null): Trip {
  return {
    id: '',
    name: '',
    destination: '',
    stops: [],
    start,
    end,
    whoWith: 'Solo',
    inPlan: start ? 'Yes' : 'Parked',
    cost: 0,
    status: 'Idea',
    bookBy: null,
    clearance: '',
    notifiedOn: null,
    notes: '',
    leave: { status: 'Not requested', requestedOn: null, notes: '' },
  };
}

export default function App() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [view, setView] = useState<View>('map');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ trip: Trip; isNew: boolean } | null>(null);
  const [showParked, setShowParked] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .loadData()
      .then((d) => {
        setTrips(d.trips);
        setSettings(d.settings);
        setCountries(d.countries);
      })
      .catch((e) => setError('Could not load trips: ' + e.message));
  }, []);

  async function persist(next: Trip[]) {
    setTrips(next);
    try {
      await api.saveTrips(next);
    } catch {
      setError('Save failed. Your last change is not saved.');
    }
  }

  async function saveSettings(s: Settings) {
    setSettings(s);
    try {
      await api.saveSettings(s);
    } catch {
      setError('Save failed. Your settings change is not saved.');
    }
  }

  // The clearance lists are local only, so the published site has none to show.
  const hasClearance = countries.length > 0;
  const views: View[] = hasClearance ? ['map', 'calendar', 'leave', 'clearance'] : ['map', 'calendar', 'leave'];

  // Colour is tied to the trip's position in the stored list, so it stays put as you edit.
  const colours = useMemo(() => Object.fromEntries(trips.map((t, i) => [t.id, colourFor(i)])), [trips]);
  const sorted = useMemo(() => sortTrips(trips), [trips]);
  const visible = showParked ? sorted : sorted.filter((t) => t.inPlan === 'Yes');
  const selected = trips.find((t) => t.id === selectedId) ?? null;

  if (!settings) return <div className="loading">{error || 'Loading…'}</div>;

  const s = summarise(trips, settings, countries);
  const dueSoon = trips
    .filter((t) => t.inPlan === 'Yes' && t.bookBy && t.status !== 'Booked' && t.status !== 'Done' && t.status !== 'Cancelled')
    .map((t) => ({ t, d: daysUntil(t.bookBy!) }))
    .filter((x) => x.d <= 90)
    .sort((a, b) => a.d - b.d);

  function saveTrip(t: Trip) {
    if (editing?.isNew) {
      let id = slug(t.name);
      while (trips.some((x) => x.id === id)) id += '-2';
      persist([...trips, { ...t, id }]);
      setSelectedId(id);
    } else {
      persist(trips.map((x) => (x.id === t.id ? t : x)));
    }
    setEditing(null);
    setView('map');
  }

  function select(id: string | null) {
    setSelectedId(id);
    if (id) setView('map');
  }

  const inPlan = visible.filter((t) => t.inPlan === 'Yes');
  const parked = visible.filter((t) => t.inPlan === 'Parked');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">✈</span> Holiday Planner
        </div>
        <nav className="tabs">
          {views.map((v) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
              {v === 'map' ? 'Map' : v === 'calendar' ? 'Calendar' : v === 'leave' ? 'Leave' : 'Clearance'}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button className="btn ghost" onClick={() => setShowSettings(true)}>Settings</button>
          <button className="btn primary" onClick={() => setEditing({ trip: blankTrip(), isNew: true })}>+ Plan a trip</button>
        </div>
      </header>

      {error && <div className="banner" onClick={() => setError('')}>{error}</div>}
      {api.STATIC && (
        <div className="banner note">
          Published copy. Changes you make here stay in this browser and are replaced by the next deploy.
        </div>
      )}

      <div className="body">
        <aside className="sidebar">
          <div className="tiles">
            <div className={`tile ${s.remaining < 0 ? 'bad' : ''}`}>
              <div className="tile-v">{s.remaining}<span className="tile-of">/{s.allowance}</span></div>
              <div className="tile-l">shifts left</div>
              <div className="bar"><i style={{ width: `${Math.min(100, (s.used / s.allowance) * 100)}%` }} /></div>
            </div>
            <div className="tile">
              <div className="tile-v">{fmtMoney(s.inPlanCost)}</div>
              <div className="tile-l">trips in the plan</div>
              <div className="tile-sub">{fmtMoney(s.monthlySaving)}/month over {settings.monthsUntilLastTrip} months</div>
            </div>
            <div className="tile muted-tile">
              <div className="tile-v">{fmtMoney(s.parkedCost)}</div>
              <div className="tile-l">parked, not counted</div>
            </div>
            {hasClearance && (
              <div className={`tile ${s.needsClearance ? 'warn' : ''}`}>
                <div className="tile-v">{s.needsClearance}</div>
                <div className="tile-l">need a clearance request</div>
              </div>
            )}
          </div>

          {dueSoon.length > 0 && (
            <div className="due-box">
              {dueSoon.map(({ t, d }) => (
                <button key={t.id} onClick={() => select(t.id)}>
                  <strong>{t.name}</strong>: book by {fmtDate(t.bookBy, { day: 'numeric', month: 'short' })}
                  <span className={d < 0 ? 'bad-text' : ''}> {d < 0 ? '(passed)' : `(${d} days)`}</span>
                </button>
              ))}
            </div>
          )}

          <div className="list-head">
            <h3>In the plan</h3>
            <label className="toggle small">
              <input type="checkbox" checked={showParked} onChange={(e) => setShowParked(e.target.checked)} /> Show parked
            </label>
          </div>
          <TripList trips={inPlan} colours={colours} settings={settings} countries={countries} selectedId={selectedId} onSelect={select} />
          {parked.length > 0 && (
            <>
              <div className="list-head"><h3>Parked · future</h3></div>
              <TripList trips={parked} colours={colours} settings={settings} countries={countries} selectedId={selectedId} onSelect={select} />
            </>
          )}
        </aside>

        <main className="main">
          {view === 'map' && (
            <div className="map-wrap">
              <TripMap trips={visible} colours={colours} selectedId={selectedId} onSelect={select} />
              {selected && (
                <TripDetail
                  trip={selected}
                  colour={colours[selected.id]}
                  settings={settings}
                  countries={countries}
                  onEdit={() => setEditing({ trip: selected, isNew: false })}
                  onClose={() => setSelectedId(null)}
                />
              )}
              {!selected && (
                <div className="map-hint small">Solid lines are trips in the plan, dashed lines are parked. Click a trip for its route.</div>
              )}
            </div>
          )}
          {view === 'calendar' && (
            <Calendar
              trips={trips}
              colours={colours}
              settings={settings}
              onSelect={select}
              onPlan={(a, b) => setEditing({ trip: blankTrip(a, b), isNew: true })}
            />
          )}
          {view === 'leave' && <LeaveView trips={sorted} settings={settings} countries={countries} onSelect={select} />}
          {view === 'clearance' && hasClearance && <CountriesView countries={countries} trips={trips} />}
        </main>
      </div>

      {editing && (
        <TripEditor
          trip={editing.trip}
          isNew={editing.isNew}
          onSave={saveTrip}
          onCancel={() => setEditing(null)}
          onDelete={() => {
            persist(trips.filter((t) => t.id !== editing.trip.id));
            setSelectedId(null);
            setEditing(null);
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(x) => {
            saveSettings(x);
            setShowSettings(false);
          }}
          onReset={async () => {
            await api.reset();
            location.reload();
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function TripList({
  trips,
  colours,
  settings,
  countries,
  selectedId,
  onSelect,
}: {
  trips: Trip[];
  colours: Record<string, string>;
  settings: Settings;
  countries: Country[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <ul className="trip-list">
      {trips.map((t) => {
        const n = nights(t);
        const sh = shiftsUsed(t, settings.rotaAnchor);
        const cl = tripClearance(t, countries);
        return (
          <li key={t.id}>
            <button
              className={`trip-card ${t.id === selectedId ? 'on' : ''} ${t.status === 'Cancelled' ? 'struck' : ''}`}
              style={{ ['--c' as string]: colours[t.id] } as React.CSSProperties}
              onClick={() => onSelect(t.id === selectedId ? null : t.id)}
            >
              <div className="tc-top">
                <span className="tc-name">{t.name}</span>
                <span className="tc-cost">{fmtMoney(t.cost)}</span>
              </div>
              <div className="tc-route">
                {t.stops.length ? t.stops.map((s) => s.name).join(' → ') : <em>{t.destination || 'Destination TBC'}</em>}
              </div>
              <div className="tc-meta">
                {t.start ? (
                  <span>{fmtDate(t.start, { day: 'numeric', month: 'short' })} – {fmtDate(t.end, { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                ) : (
                  <span>No dates</span>
                )}
                {n !== null && <span>{n} nights</span>}
                {sh !== null && <span>{sh} shift{sh === 1 ? '' : 's'}</span>}
                <span className="tc-status">{t.status}</span>
                {countries.length > 0 && t.stops.length > 0 && cl !== 'Pre-cleared' && <span className="chip sm warn">{cl}</span>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SettingsModal({ settings, onSave, onReset, onClose }: { settings: Settings; onSave: (s: Settings) => void; onReset: () => void; onClose: () => void }) {
  const [s, setS] = useState(settings);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal narrow" role="dialog" aria-label="Settings">
        <header className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="modal-body">
          <label>
            Annual leave (shifts)
            <input type="number" value={s.allowanceShifts} onChange={(e) => setS({ ...s, allowanceShifts: Number(e.target.value) || 0 })} />
          </label>
          <label>
            Rota anchor <span className="muted">· first day of a 4-on block</span>
            <input type="date" value={s.rotaAnchor} onChange={(e) => e.target.value && setS({ ...s, rotaAnchor: e.target.value })} />
          </label>
          <label>
            Months to save over
            <input type="number" min={1} value={s.monthsUntilLastTrip} onChange={(e) => setS({ ...s, monthsUntilLastTrip: Number(e.target.value) || 1 })} />
          </label>
          <hr />
          <p className="small muted">
            Your trips are saved in {api.STATIC ? 'this browser' : <code>data/trips.json</code>}. Starting again reloads everything from the spreadsheet import (<code>data/seed.json</code>) and loses any changes you've made here.
          </p>
          <button className="btn danger" onClick={() => confirm('Discard all changes and reload from the spreadsheet?') && onReset()}>
            Start again from the spreadsheet
          </button>
        </div>
        <footer className="modal-foot">
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave(s)}>Save</button>
        </footer>
      </div>
    </div>
  );
}
