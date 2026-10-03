# Holiday Planner

A local web page for my trips. It started from `holiday_planner.xlsx` and covers the same ground: leave shifts counted from the 4-on-4-off rota, costs, book-by dates and work travel clearance. It adds a map that draws every trip's route, stop by stop.

## Run

Double-click `start.cmd`, or:

```bash
npm install
npm run dev      # opens http://localhost:5191
npm test         # rota/shift maths checked against the spreadsheet's numbers
```

## Published copy
Every push to `master` builds a server-less copy and deploys it to GitHub Pages: https://harrybbq.github.io/holidayPlanner/

It shows the trips in `data/seed.json`. Changes made there are kept in that browser only and are replaced by the next deploy. The clearance lists are never published, so that copy has no Clearance tab.

## What's where
- **Map:** every trip with a destination. Numbered pins mark the stops in order, and arrows show the direction of travel. Solid lines are in the plan, dashed lines are parked. Click a trip for its route: each leg's distance, nights per stop and arrival dates (once each stop has nights), plus leave and notes.
- **Calendar:** a year grid of the rota (grey = on shift). Click a start date and an end date to plan a trip, and it shows how many shifts of leave that window costs before you commit.
- **Leave:** the Leave Tracker table with allowance, used and remaining shifts.
- **Clearance:** the pre-cleared, request-needed and likely-refused lists, with the countries your trips visit in bold. Any country on no list is flagged. Only shown when `data/countries.json` exists (local only).
- **+ Plan a trip:** stops come from an OpenStreetMap place search. Add as many as you like, reorder them and set nights per stop.

## Data
- `data/seed.json` is the spreadsheet import (committed). Rebuild it with `npm run import-xlsx`, which reads `scripts/holiday_planner.xlsx`.
- `data/countries.json` holds the work travel clearance lists, written by the same import. It and the xlsx are gitignored: they stay on this PC and are not in the repo.
- `data/trips.json` holds your live edits (gitignored). It's created from the seed on first run. **The import is one-way:** changes here aren't written back to the xlsx.
- Settings → "Start again from the spreadsheet" throws away your edits and copies the seed back in.
- Nothing is sent anywhere except OpenStreetMap map tiles and the place searches you type.

## The maths (same as the sheet)
- Nights = end − start. Calendar days = nights + 1.
- Shifts = rota on-days from start to end inclusive. A day is on-shift when `(day − anchor) mod 8 < 4`. The anchor (31 Dec 2026) can be changed in Settings.
- Clearance is worked out from each stop's country against the Countries list, using the strictest status among the stops. The sheet's free-text "Cleared" column is imported but not shown, because this replaces it.
- Totals count only trips that are in the plan and not cancelled. Parked trips have no dates, so they cost 0 shifts.
