import { decode, encode, freshRoute, insertVia, legKey, legOf, legsByPair, parseOsrm, pendingJobs, relink, simplify, withRoute } from './route';
import { halfway, type LatLng } from './geo';
import type { Stop, Trip } from '../types';

const stop = (name: string, lat: number, lng: number, extra: Partial<Stop> = {}): Stop => ({ name, country: '', lat, lng, ...extra });

const seattle = stop('Seattle', 47.6062, -122.3321);
const forks = stop('Forks', 47.9504, -124.3855);
const astoria = stop('Astoria', 46.1879, -123.8313);

function trip(id: string, stops: Stop[]): Trip {
  return {
    id,
    name: id,
    destination: '',
    stops,
    start: null,
    end: null,
    whoWith: '',
    inPlan: 'Yes',
    cost: 0,
    status: 'Idea',
    bookBy: null,
    clearance: '',
    notifiedOn: null,
    notes: '',
    leave: { status: 'Not requested', requestedOn: null, notes: '' },
  };
}

describe('polylines', () => {
  // The worked example from Google's format docs.
  const google = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
  const pts: LatLng[] = [
    [38.5, -120.2],
    [40.7, -120.95],
    [43.252, -126.453],
  ];

  it('decodes the documented example', () => {
    expect(decode(google)).toEqual(pts);
  });
  it('encodes it back', () => {
    expect(encode(pts)).toBe(google);
  });
  it('round-trips points either side of the date line', () => {
    const p: LatLng[] = [[-33.8688, 151.2093], [21.3069, -157.8583], [-89.99999, 179.99999]];
    expect(decode(encode(p))).toEqual(p);
  });
});

describe('simplify', () => {
  it('drops points on a straight line and keeps corners', () => {
    const line: LatLng[] = [[0, 0], [0, 0.5], [0, 1], [0.5, 1], [1, 1]];
    expect(simplify(line, 0.001)).toEqual([[0, 0], [0, 1], [1, 1]]);
  });
  it('keeps short lines as they are', () => {
    expect(simplify([[1, 1], [2, 2]], 0.1)).toEqual([[1, 1], [2, 2]]);
  });
});

describe('legs', () => {
  it('default to driving', () => {
    expect(legOf(seattle)).toEqual({ by: 'road' });
  });

  it('a route goes stale when the via points or avoid change', () => {
    const leg = { by: 'road' as const, route: { key: legKey(seattle, forks, { by: 'road' }), line: 'x', km: 1, mins: 1, roads: '' } };
    expect(freshRoute(seattle, forks, leg)).not.toBeNull();
    expect(freshRoute(seattle, forks, { ...leg, avoid: 'ferry' })).toBeNull();
    expect(freshRoute(seattle, forks, { ...leg, via: [{ name: 'Port Townsend', lat: 48.117, lng: -122.7604 }] })).toBeNull();
    expect(freshRoute(seattle, astoria, leg)).toBeNull();
  });

  it('a new via point goes where it fits along the leg', () => {
    const kingston = { name: 'Kingston', lat: 47.7987, lng: -122.4982 };
    const portTownsend = { name: 'Port Townsend', lat: 48.117, lng: -122.7604 };
    const via = insertVia(seattle, forks, [portTownsend], kingston);
    expect(via.map((v) => v.name)).toEqual(['Kingston', 'Port Townsend']);
  });
});

describe('relink', () => {
  const fly = { by: 'flight' as const };
  const before = [seattle, { ...forks, leg: fly }, astoria];
  const portland = stop('Portland', 45.5152, -122.6784);

  it('keeps a leg with its pair of stops when they stay neighbours', () => {
    const after = relink([...before, portland], legsByPair(before));
    expect(after.map((s) => s.leg)).toEqual([undefined, fly, undefined, undefined]);
  });

  it('drops a leg whose pair is split up', () => {
    const after = relink([before[0], before[2], before[1]], legsByPair(before));
    expect(after.every((s) => s.leg === undefined)).toBe(true);
  });

  it('gives it back when the pair is put back together', () => {
    const seen = legsByPair(before);
    const moved = relink([before[0], before[2], before[1]], seen);
    const back = relink([moved[0], moved[2], moved[1]], legsByPair(moved, seen));
    expect(back[1].leg).toEqual(fly);
  });

  it('drops the leg left on the last stop', () => {
    const after = relink(before.slice(0, 2), legsByPair(before));
    expect(after[1].leg).toBeUndefined();
  });
});

describe('route jobs', () => {
  const t = trip('pnw', [seattle, { ...forks, leg: { by: 'flight' } }, astoria]);

  it('asks only for driving legs without a route', () => {
    const jobs = pendingJobs([t]);
    expect(jobs.map((j) => j.index)).toEqual([0]);
    expect(jobs[0].points).toEqual([[seattle.lat, seattle.lng], [forks.lat, forks.lng]]);
    expect(pendingJobs([t], (k) => k === jobs[0].key)).toEqual([]);
  });

  it('stores the found route, after which nothing is pending', () => {
    const [job] = pendingJobs([t]);
    const next = withRoute([t], job, { line: 'abc', km: 250, mins: 220, roads: 'US 101' });
    expect(next[0].stops[0].leg?.route).toEqual({ key: job.key, line: 'abc', km: 250, mins: 220, roads: 'US 101' });
    expect(pendingJobs(next)).toEqual([]);
  });

  it('throws away a route for a leg that changed meanwhile', () => {
    const [job] = pendingJobs([t]);
    const edited = [{ ...t, stops: [seattle, astoria] }];
    expect(withRoute(edited, job, { line: 'abc', km: 1, mins: 1, roads: '' })).toBe(edited);
  });
});

describe('OSRM responses', () => {
  it('reads the route, rounding and naming the main roads', () => {
    const found = parseOsrm({
      code: 'Ok',
      routes: [
        {
          geometry: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
          distance: 250_400,
          duration: 13_230,
          legs: [{ summary: 'I 5, WA 104' }, { summary: 'WA 104, US 101' }],
        },
      ],
    });
    expect(found).toEqual({ line: '_p~iF~ps|U_ulLnnqC_mqNvxq`@', km: 250, mins: 221, roads: 'I 5, WA 104, US 101' });
  });

  it('treats no road as a result, not an error', () => {
    expect(parseOsrm({ code: 'NoRoute' }).line).toBeNull();
    expect(parseOsrm({ code: 'NoSegment' }).line).toBeNull();
  });

  it('throws on anything else', () => {
    expect(() => parseOsrm({ code: 'InvalidValue', message: 'Exclude flag combination is not supported.' })).toThrow(
      'Exclude flag combination is not supported.',
    );
  });
});

describe('halfway', () => {
  it('finds the middle by distance, not by point count', () => {
    const { at, deg } = halfway([[0, 0], [0, 0.1], [0, 0.2], [0, 10]]);
    expect(at[0]).toBeCloseTo(0);
    expect(at[1]).toBeCloseTo(5);
    expect(deg).toBeCloseTo(90); // heading east
  });
});
