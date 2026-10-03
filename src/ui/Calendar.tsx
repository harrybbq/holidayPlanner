import { useMemo, useState } from 'react';
import type { Settings, Trip } from '../types';
import { fmtDate, isShiftDay, shiftsUsed, todayIso } from '../lib/calc';

interface Props {
  trips: Trip[];
  colours: Record<string, string>;
  settings: Settings;
  onSelect: (id: string) => void;
  onPlan: (start: string, end: string) => void;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

export default function Calendar({ trips, colours, settings, onSelect, onPlan }: Props) {
  const dated = trips.filter((t) => t.start && t.end && t.inPlan === 'Yes');
  const years = useMemo(() => {
    const ys = new Set<number>(dated.flatMap((t) => [Number(t.start!.slice(0, 4)), Number(t.end!.slice(0, 4))]));
    if (ys.size === 0) ys.add(new Date().getFullYear() + 1);
    return [...ys].sort();
  }, [dated]);
  const [year, setYear] = useState(years[0]);
  const [pick, setPick] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const today = todayIso();

  const tripOn = (iso: string) => dated.find((t) => t.start! <= iso && iso <= t.end!);

  const range = pick && hover ? (pick <= hover ? [pick, hover] : [hover, pick]) : null;
  const rangeShifts = range ? shiftsUsed({ start: range[0], end: range[1] }, settings.rotaAnchor) : null;

  function click(iso: string) {
    const t = tripOn(iso);
    if (!pick && t) return onSelect(t.id);
    if (!pick) return setPick(iso);
    const [a, b] = pick <= iso ? [pick, iso] : [iso, pick];
    setPick(null);
    onPlan(a, b);
  }

  return (
    <div className="calendar">
      <div className="cal-head">
        <div className="year-tabs">
          {[years[0] - 1, ...years, years[years.length - 1] + 1]
            .filter((y, i, a) => a.indexOf(y) === i)
            .map((y) => (
              <button key={y} className={y === year ? 'on' : ''} onClick={() => setYear(y)}>{y}</button>
            ))}
        </div>
        <div className="cal-legend small">
          <span><i className="lg shift" /> On shift</span>
          <span><i className="lg off" /> Off</span>
          <span><i className="lg trip" /> Trip day costing a shift</span>
          <span className="muted">
            {pick
              ? range
                ? `${fmtDate(range[0], { day: 'numeric', month: 'short' })} – ${fmtDate(range[1], { day: 'numeric', month: 'short' })}: ${rangeShifts} shift${rangeShifts === 1 ? '' : 's'} of leave. Click the end date.`
                : 'Click the end date.'
              : 'Click a start and end date to plan a trip. Click a trip to open it.'}
          </span>
          {pick && <button className="btn ghost sm" onClick={() => setPick(null)}>Cancel</button>}
        </div>
      </div>

      <div className="cal-grid" onMouseLeave={() => setHover(null)}>
        <div className="cal-row cal-days">
          <span className="cal-m" />
          {Array.from({ length: 31 }, (_, i) => <span key={i} className="cal-dnum">{i + 1}</span>)}
        </div>
        {MONTHS.map((m, mi) => {
          const len = new Date(Date.UTC(year, mi + 1, 0)).getUTCDate();
          return (
            <div key={m} className="cal-row">
              <span className="cal-m">{m}</span>
              {Array.from({ length: 31 }, (_, di) => {
                if (di >= len) return <span key={di} className="cal-cell none" />;
                const iso = `${year}-${pad(mi + 1)}-${pad(di + 1)}`;
                const shift = isShiftDay(iso, settings.rotaAnchor);
                const t = tripOn(iso);
                const inRange = range && range[0] <= iso && iso <= range[1];
                const dow = new Date(Date.UTC(year, mi, di + 1)).getUTCDay();
                const cls = [
                  'cal-cell',
                  shift ? 'shift' : 'off',
                  t ? 'has-trip' : '',
                  inRange ? 'in-range' : '',
                  iso === today ? 'today' : '',
                  dow === 0 || dow === 6 ? 'wkend' : '',
                ].join(' ');
                return (
                  <span
                    key={di}
                    className={cls}
                    style={t ? ({ ['--c' as string]: colours[t.id] } as React.CSSProperties) : undefined}
                    title={`${fmtDate(iso, { weekday: 'short', day: 'numeric', month: 'short' })} · ${shift ? 'on shift' : 'off'}${t ? ` · ${t.name}` : ''}`}
                    onClick={() => click(iso)}
                    onMouseEnter={() => setHover(iso)}
                  >
                    {t && t.start === iso && <em className="cal-label">{t.name}</em>}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
