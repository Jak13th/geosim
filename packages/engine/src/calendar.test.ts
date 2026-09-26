import { describe, expect, it } from 'vitest';
import { Calendar, civilFromDays, daysFromCivil, formatIsoDate, parseIsoDate } from './calendar.ts';

describe('horloge simulée', () => {
  it('convertit les dates civiles en jours et inversement', () => {
    expect(daysFromCivil(1970, 1, 1)).toBe(0);
    expect(daysFromCivil(2000, 3, 1) - daysFromCivil(2000, 2, 28)).toBe(2); // année bissextile
    expect(daysFromCivil(2100, 3, 1) - daysFromCivil(2100, 2, 28)).toBe(1); // séculaire non bissextile
    for (let d = -800_000; d < 800_000; d += 997) {
      const c = civilFromDays(d);
      expect(daysFromCivil(c.year, c.month, c.day)).toBe(d);
    }
  });

  it('lit et écrit les dates ISO, refuse les dates inexistantes', () => {
    expect(formatIsoDate(parseIsoDate('2026-09-26'))).toBe('2026-09-26');
    expect(parseIsoDate('2026-09')).toEqual({ year: 2026, month: 9, day: 1 });
    expect(() => parseIsoDate('2026-02-30')).toThrow(/inexistante/);
    expect(() => parseIsoDate('26/09/2026')).toThrow(/invalide/);
  });

  it('repère les débuts de mois et les ticks des dates', () => {
    const cal = new Calendar('2026-09-26');
    expect(cal.isoAt(0)).toBe('2026-09-26');
    expect(cal.isoAt(5)).toBe('2026-10-01');
    expect(cal.isMonthStart(5)).toBe(true);
    expect(cal.isMonthStart(6)).toBe(false);
    expect(cal.tickOf('2027-09-26')).toBe(365);
    expect(cal.yearsAt(365.25)).toBe(1);
  });
});
