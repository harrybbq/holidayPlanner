import { Fragment, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Trip } from '../types';
import { arc, bearing, type LatLng } from '../lib/geo';
import { fmtDate } from '../lib/calc';

interface Props {
  trips: Trip[];
  colours: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function stopIcon(label: string, colour: string, active: boolean) {
  const h = active ? 26 : 20;
  const w = Math.max(h, label.length * 7 + 10);
  return L.divIcon({
    className: '',
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
    html: `<div class="pin${active ? ' pin-active' : ''}" style="--c:${colour};width:${w}px;height:${h}px">${label}</div>`,
  });
}

/** One pin per place: a route that revisits a stop (Dubrovnik on Croatia+) gets "2·4". */
function pins(t: Trip) {
  const out: { stop: Trip['stops'][number]; nums: number[]; nights: number }[] = [];
  t.stops.forEach((s, i) => {
    const same = out.find((p) => Math.abs(p.stop.lat - s.lat) < 1e-3 && Math.abs(p.stop.lng - s.lng) < 1e-3);
    if (same) {
      same.nums.push(i + 1);
      same.nights += s.nights ?? 0;
    } else out.push({ stop: s, nums: [i + 1], nights: s.nights ?? 0 });
  });
  return out;
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
  const pts = focus.flatMap((t) => t.stops.map((s) => [s.lat, s.lng] as LatLng));
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
        const multi = t.stops.length > 1;
        const legs = t.stops.slice(1).map((s, i) => arc([t.stops[i].lat, t.stops[i].lng], [s.lat, s.lng]));
        const click = { click: () => onSelect(t.id) };
        return (
          <Fragment key={t.id}>
            {legs.map((pts, i) => {
              const mid = Math.floor(pts.length / 2);
              return (
                <Fragment key={i}>
                  <Polyline
                    positions={pts}
                    pathOptions={{
                      color: colour,
                      weight: active ? 4 : 2.5,
                      opacity: dim ? 0.25 : 0.9,
                      dashArray: parked ? '6 7' : undefined,
                    }}
                    eventHandlers={click}
                  />
                  {!dim && (
                    <Marker
                      position={pts[mid]}
                      icon={arrowIcon(bearing(pts[mid - 1], pts[mid + 1]), colour)}
                      interactive={false}
                    />
                  )}
                </Fragment>
              );
            })}
            {pins(t).map(({ stop: s, nums, nights }, i) => (
              <Marker
                key={i}
                position={[s.lat, s.lng]}
                icon={stopIcon(multi ? nums.join('·') : '', colour, active)}
                opacity={dim ? 0.35 : 1}
                zIndexOffset={active ? 1000 : 0}
                eventHandlers={click}
              >
                <Tooltip direction="top" offset={[0, -10]}>
                  <strong>{s.name}</strong>
                  {multi && ` · stop ${nums.join(' & ')}`}
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
