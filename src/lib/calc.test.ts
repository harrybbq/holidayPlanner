import { calendarDays, isShiftDay, nights, shiftsUsed, summarise } from './calc';
import type { Trip } from '../types';

const ANCHOR = '2026-12-31';

function trip(name: string, start: string | null, end: string | null, inPlan: 'Yes' | 'Parked', cost: number): Trip {
  return {
    id: name.toLowerCase(),
    name,
    destination: '',
    stops: [],
    start,
    end,
    whoWith: '',
    inPlan,
    cost,
    status: 'Idea',
    bookBy: null,
    clearance: 'Cleared',
    notifiedOn: null,
    notes: '',
    leave: { status: 'Not requested', requestedOn: null, notes: '' },
  };
}

// The five in-plan trips from holiday_planner.xlsx, plus the parked costs.
const sheet: Trip[] = [
  trip('Budapest', '2027-04-12', '2027-04-16', 'Yes', 1400),
  trip('Italy', '2027-05-12', '2027-05-24', 'Yes', 2100),
  trip('Prague', '2027-07-22', '2027-07-26', 'Yes', 600),
  trip('Group Holiday', '2027-08-13', '2027-08-20', 'Yes', 800),
  trip('Croatia+', '2027-09-04', '2027-09-12', 'Yes', 1150),
  ...[1550, 4300, 5200, 900, 1500, 3800, 4800].map((c, i) => trip('P' + i, null, null, 'Parked', c)),
];

describe('rota', () => {
  it('1 Jan 2027 is day 2 of a day block', () => {
    expect(isShiftDay('2026-12-31', ANCHOR)).toBe(true);
    expect(isShiftDay('2027-01-01', ANCHOR)).toBe(true);
    expect(isShiftDay('2027-01-03', ANCHOR)).toBe(true);
    expect(isShiftDay('2027-01-04', ANCHOR)).toBe(false);
  });

  it('works for dates before the anchor', () => {
    expect(isShiftDay('2026-12-30', ANCHOR)).toBe(false);
    expect(isShiftDay('2026-12-27', ANCHOR)).toBe(false);
    expect(isShiftDay('2026-12-26', ANCHOR)).toBe(true);
  });

  it('Prague is almost free on the rota', () => {
    expect(shiftsUsed(sheet[2], ANCHOR)).toBe(1);
  });

  it('crosses BST changes without drift', () => {
    // 28 Mar 2027 is the clocks-forward Sunday.
    expect(shiftsUsed({ start: '2027-03-20', end: '2027-04-04' }, ANCHOR)).toBe(8);
  });
});

describe('nights vs calendar days', () => {
  it('Italy is 12 nights, 13 calendar days', () => {
    expect(nights(sheet[1])).toBe(12);
    expect(calendarDays(sheet[1])).toBe(13);
  });
  it('undated trips have none', () => {
    expect(nights(sheet[5])).toBeNull();
    expect(shiftsUsed(sheet[5], ANCHOR)).toBeNull();
  });
});

describe('summary matches the Setup sheet', () => {
  const s = summarise(sheet, { allowanceShifts: 35, rotaAnchor: ANCHOR, monthsUntilLastTrip: 13 }, []);
  it('shifts', () => {
    expect(s.used).toBe(17);
    expect(s.remaining).toBe(18);
  });
  it('money', () => {
    expect(s.inPlanCost).toBe(6050);
    expect(s.parkedCost).toBe(22050);
    expect(s.monthlySaving).toBeCloseTo(6050 / 13);
  });
});
