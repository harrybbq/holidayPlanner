// Finds road routes for the seed's driving legs and saves them in data/seed.json, so the
// published copy shows roads straight away instead of each browser looking them up.
// Run with `npm run routes`. Legs it can't get a route for are left for the app to fill in.
import fs from 'node:fs';
import type { SeedFile } from '../src/types';
import { findRoute, pendingJobs, withRoute } from '../src/lib/route';

const FILE = new URL('../data/seed.json', import.meta.url);

async function main() {
  const seed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as SeedFile;
  const failed = new Set<string>();
  let trips = seed.trips;
  let saved = 0;
  for (let job = pendingJobs(trips)[0]; job; job = pendingJobs(trips, (k) => failed.has(k))[0]) {
    const t = trips.find((x) => x.id === job.tripId)!;
    const label = `${t.name}: ${t.stops[job.index].name} → ${t.stops[job.index + 1].name}`;
    try {
      const found = await findRoute(job.points, job.avoid, { 'User-Agent': 'HolidayPlanner/0.1 (route fill script)' });
      trips = withRoute(trips, job, found);
      saved++;
      console.log(`${label}: ${found.line ? `${found.km} km` : 'no road'}`);
    } catch (e) {
      failed.add(job.key);
      console.warn(`${label}: ${(e as Error).message}`);
    }
  }
  if (saved) fs.writeFileSync(FILE, JSON.stringify({ ...seed, trips }, null, 2) + '\n');
  console.log(`${saved} route${saved === 1 ? '' : 's'} saved${failed.size ? `, ${failed.size} failed` : ''}.`);
}

main();
