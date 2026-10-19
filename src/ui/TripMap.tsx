import { Fragment, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Stop, StopKind, Trip } from '../types';
import { arc, halfway, type LatLng } from '../lib/geo';
import { decode, freshRoute, legOf } from '../lib/route';
import { baseNumbers, fmtDate, stopKind } from '../lib/calc';

interface Props {
  trips: Trip[];
  colours: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function stopIcon(label: string, colour: string, active: boolean, kind: StopKind = 'base') {
  if (kind === 'overnight') {
    // Overnight stops are small solid dots; via points (selected trip only) are rings.
    const d = active ? 13 : 11;
    return L.divIcon({
      className: '',
      iconSize: [d, d],
      iconAnchor: [d / 2, d / 2],
      html: `<div class="pin" style="--c:${colour};width:${d}px;height:${d}px"></div>`,
    });
  }
  const h = active ? 26 : 20;
  const w = Math.max(h, label.length * 7 + 10);
  return L.divIcon({
    className: '',
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
    html: `<div class="pin${active ? ' pin-active' : ''}" style="--c:${colour};width:${w}px;height:${h}px">${label}</div>`,
  });
}

/**
 * One pin per place: a route that revisits a base (Dubrovnik on Croatia+) gets "2·4".
 * Only bases are numbered; overnight stops are drawn as dots, under the bases.
 */
function pins(t: Trip) {
  const numbers = baseNumbers(t.stops);
  const out: { stop: Trip['stops'][number]; nums: number[]; nights: number; kind: StopKind }[] = [];
  t.stops.forEach((s, i) => {
    const same = out.find((p) => Math.abs(p.stop.lat - s.lat) < 1e-3 && Math.abs(p.stop.lng - s.lng) < 1e-3);
    const n = numbers[i];
    if (same) {
      if (n !== null) {
        same.nums.push(n);
        same.kind = 'base';
      }
      same.nights += s.nights ?? 0;
    } else out.push({ stop: s, nums: n !== null ? [n] : [], nights: s.nights ?? 0, kind: stopKind(s) });
  });
  return out.sort((a, b) => Number(a.kind === 'base') - Number(b.kind === 'base'));
}

// Decoding a long route on every render adds up, so each stored line is decoded once.
const decoded = new Map<string, LatLng[]>();
function roadLine(line: string): LatLng[] {
  let pts = decoded.get(line);
  if (!pts) decoded.set(line, (pts = decode(line)));
  return pts;
}

/**
 * The line for the leg leaving stop a: flights arc between the stops, driving and
 * train legs follow their road or rail route. One with no route yet (or no road or
 * railway at all) is a straight dotted line through its via points.
 */
function legLine(a: Stop, b: Stop): { pts: LatLng[]; rough: boolean; train: boolean } {
  const leg = legOf(a);
  const train = leg.by === 'train';
  if (leg.by === 'flight') return { pts: arc([a.lat, a.lng], [b.lat, b.lng]), rough: false, train };
  const line = freshRoute(a, b, leg)?.line;
  if (line) return { pts: roadLine(line), rough: false, train };
  return { pts: [[a.lat, a.lng], ...(leg.via ?? []).map((v): LatLng => [v.lat, v.lng]), [b.lat, b.lng]], rough: true, train };
}

/** Via points of the trip's driving and train legs. */
function vias(t: Trip) {
  return t.stops.slice(0, -1).flatMap((s) => (legOf(s).by === 'flight' ? [] : (s.leg?.via ?? [])));
}

function arrowIcon(deg: number, colour: string) {
  return L.divIcon({
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    html: `<div class="leg-arrow" style="--c:${colour};transform:rotate(${deg}deg)"></div>`,
  });
}

function FitTo({ trips, selectedId }: { trips: Trip[]; selectedId: string | null }) {
  const map = useMap();
  // With nothing selected, frame the trips in the plan; parked ones are a pan away.
  const inPlan = trips.filter((t) => t.inPlan === 'Yes');
  const focus = selectedId ? trips.filter((t) => t.id === selectedId) : inPlan.length ? inPlan : trips;
  const pts = focus.flatMap((t) => [...t.stops, ...vias(t)].map((s): LatLng => [s.lat, s.lng]));
  // Only re-frame when the set of points actually changes, not on every edit.
  const sig = (selectedId ?? '') + pts.map((p) => p.join(',')).join(';');
  useEffect(() => {
    if (pts.length === 0) return;
    // Keep the route clear of the detail panel on the right.
    const panel = selectedId && map.getSize().x > 900 ? 400 : 40;
    map.flyToBounds(L.latLngBounds(pts), {
      paddingTopLeft: [50, 50],
      paddingBottomRight: [panel, 50],
      maxZoom: pts.length === 1 ? 7 : 8,
      duration: 0.8,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, sig]);
  return null;
}

export default function TripMap({ trips, colours, selectedId, onSelect }: Props) {
  const mapped = useMemo(() => trips.filter((t) => t.stops.length > 0), [trips]);
  // Draw the selected trip last so it sits on top.
  const ordered = useMemo(
    () => [...mapped].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId)),
    [mapped, selectedId],
  );

  return (
    <MapContainer center={[48, 10]} zoom={4} className="map" worldCopyJump zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitTo trips={mapped} selectedId={selectedId} />
      {ordered.map((t) => {
        const colour = colours[t.id];
        const active = t.id === selectedId;
        const dim = selectedId !== null && !active;
        const parked = t.inPlan === 'Parked';
        const multi = t.stops.filter((s) => stopKind(s) === 'base').length > 1;
        const legs = t.stops.slice(1).map((s, i) => legLine(t.stops[i], s));
        const click = { click: () => onSelect(t.id) };
        return (
          <Fragment key={t.id}>
            {legs.map(({ pts, rough, train }, i) => {
              const mid = halfway(pts);
              return (
                <Fragment key={i}>
                  <Polyline
                    positions={pts}
                    pathOptions={{
                      color: colour,
                      weight: active ? 4 : 2.5,
                      opacity: dim ? 0.25 : rough ? 0.6 : 0.9,
                      dashArray: rough ? '1 7' : parked ? '6 7' : undefined,
                    }}
                    eventHandlers={click}
                  />
                  {train && !rough && (
                    // Railway look: a white stripe down the middle of the line.
                    <Polyline
                      positions={pts}
                      interactive={false}
                      pathOptions={{ color: '#fff', weight: active ? 1.6 : 1.1, opacity: dim ? 0.25 : 0.95, dashArray: '4 4' }}
                    />
                  )}
                  {!dim && <Marker position={mid.at} icon={arrowIcon(mid.deg, colour)} interactive={false} />}
                </Fragment>
              );
            })}
            {active && vias(t).map((v, i) => (
              <CircleMarker
                key={'via' + i}
                center={[v.lat, v.lng]}
                radius={4}
                pathOptions={{ color: colour, weight: 2, fillColor: '#fff', fillOpacity: 1 }}
              >
                <Tooltip direction="top" offset={[0, -4]}>via {v.name}</Tooltip>
              </CircleMarker>
            ))}
            {pins(t).map(({ stop: s, nums, nights, kind }, i) => (
              <Marker
                key={i}
                position={[s.lat, s.lng]}
                icon={stopIcon(multi ? nums.join('·') : '', colour, active, kind)}
                opacity={dim ? 0.35 : 1}
                zIndexOffset={active ? 1000 : 0}
                eventHandlers={click}
              >
                <Tooltip direction="top" offset={[0, -10]}>
                  <strong>{s.name}</strong>
                  {kind === 'overnight' ? (nights > 1 ? ' · short stay' : ' · overnight stop') : multi && ` · stop ${nums.join(' & ')}`}
                  {nights ? ` · ${nights} night${nights === 1 ? '' : 's'}` : ''}
                  <br />
                  {t.name}
                  {t.start ? ` · ${fmtDate(t.start, { day: 'numeric', month: 'short' })}` : parked ? ' · parked' : ''}
                </Tooltip>
              </Marker>
            ))}
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
