# Holiday Planner

A local web page for my trips. It started from `holiday_planner.xlsx` and covers the same ground: leave shifts counted from the 4-on-4-off rota, costs, book-by dates and work travel clearance. It adds a map that draws every trip's route, stop by stop.

## Run

Double-click `start.cmd`, or:

```bash
npm install
npm run dev      # opens http://localhost:5191
npm test         # rota/shift maths checked against the spreadsheet's numbers
npm run routes   # look up road routes for the seed's driving legs and save them in data/seed.json
```

## Published copy
Every push to `master` builds a server-less copy and deploys it to GitHub Pages: https://harrybbq.github.io/holidayPlanner/

It shows the trips in `data/seed.json`. Changes made there are kept in that browser only and are replaced by the next deploy. The clearance lists are never published, so that copy has no Clearance tab. The deploy runs `npm run routes` first, so the published map has its roads straight away; any it couldn't get are looked up by the browser and kept there across deploys.

## What's where
- **Map:** every trip with a destination. Numbered pins mark the bases (where you stay put) in order and small dots mark overnight stops, and arrows show the direction of travel. Driving legs follow the roads; flights are the curved lines between stops. Solid lines are in the plan, dashed lines are parked. A dotted straight line is a driving leg whose route is still being looked up, or that no road joins. Click a trip for its route: each leg's distance (and drive time and main roads when driving), nights per stop and arrival dates (once each stop has nights), plus leave and notes.
- **Calendar:** a year grid of the rota (grey = on shift). Click a start date and an end date to plan a trip, and it shows how many shifts of leave that window costs before you commit.
- **Leave:** the Leave Tracker table with allowance, used and remaining shifts.
- **Clearance:** the pre-cleared, request-needed and likely-refused lists, with the countries your trips visit in bold. Any country on no list is flagged. Only shown when `data/countries.json` exists (local only).
- **+ Plan a trip:** stops come from an OpenStreetMap place search. Add as many as you like, reorder them, set nights per stop and mark each one a **Base** (staying put for a while) or **Overnight** (a night or two on the move, like towns down a coast road). Only bases are numbered. Stops with no type count as bases, so older trips look the same. Places you only drive through go in that leg's via points, not in the stops.
- **Getting between stops:** each leg is **Drive** or **✈ Fly**. Driving takes the fastest route unless you pick its roads: **Choose roads** lets you add towns or roads it must go through (search "US-101", "A82" or "Port Townsend"; results near the leg come first) and avoid motorways, toll roads or ferries. Via points stay in travel order and show as small rings on the selected trip. A leg's settings stay with its pair of stops when you reorder.

## Data
- `data/seed.json` is the spreadsheet import (committed). Rebuild it with `npm run import-xlsx`, which reads `scripts/holiday_planner.xlsx`.
- `data/countries.json` holds the work travel clearance lists, written by the same import. It and the xlsx are gitignored: they stay on this PC and are not in the repo.
- `data/trips.json` holds your live edits (gitignored). It's created from the seed on first run. **The import is one-way:** changes here aren't written back to the xlsx.
- Road routes are saved on each driving leg with the stops, via points and avoid setting they were found for. Change any of those and the route is looked up again in the background (one request a second). Re-running the xlsx import drops leg settings, like any other edit made outside the sheet.
- Settings → "Start again from the spreadsheet" throws away your edits and copies the seed back in.
- Nothing is sent anywhere except OpenStreetMap map tiles, the place searches you type, and the stops and via points of driving legs, sent to the public [OSRM](https://project-osrm.org) server (router.project-osrm.org) to find their road routes.

## The maths (same as the sheet)
- Nights = end − start. Calendar days = nights + 1.
- Shifts = rota on-days from start to end inclusive. A day is on-shift when `(day − anchor) mod 8 < 4`. The anchor (31 Dec 2026) can be changed in Settings.
- Clearance is worked out from each stop's country against the Countries list, using the strictest status among the stops. The sheet's free-text "Cleared" column is imported but not shown, because this replaces it.
- Totals count only trips that are in the plan and not cancelled. Parked trips have no dates, so they cost 0 shifts.
