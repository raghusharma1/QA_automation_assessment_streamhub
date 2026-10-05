import { expect, test } from '@playwright/test';
import { amortizeByYear, calculateEmi, yearsToMonths } from '../../src/support/emi-math';
import { formatInr, parseAmountShorthand, parseInr, parsePercent } from '../../src/support/inr';

/**
 * Reference values come from the formula, computed separately during research
 * (docs/research/02-emicalculator-recon.md). The personal-loan case also matches the live site
 * (docs/research/06-live-recon-verified.md). Pinning them means a regression in emi-math can't
 * silently "agree" with a wrong UI.
 */
const cases = [
  {
    name: 'Scenario A: 25L, 10%, 10y',
    input: { principal: 2_500_000, annualRatePct: 10, months: 120 },
    expected: { emi: 33_038, totalInterest: 1_464_522, totalPayment: 3_964_522 },
  },
  {
    name: 'Scenario B: 50L, 7.5%, 15y',
    input: { principal: 5_000_000, annualRatePct: 7.5, months: 180 },
    expected: { emi: 46_351, totalInterest: 3_343_111, totalPayment: 8_343_111 },
  },
  {
    name: 'Personal loan: 10L, 12%, 5y (verified live)',
    input: { principal: 1_000_000, annualRatePct: 12, months: 60 },
    expected: { emi: 22_244, totalInterest: 334_667, totalPayment: 1_334_667 },
  },
];

test.describe('emi-math oracle', () => {
  for (const c of cases) {
    test(c.name, () => {
      expect(calculateEmi(c.input)).toMatchObject(c.expected);
    });
  }

  test('totals use the unrounded EMI (site convention), not round(emi) * n', () => {
    const r = calculateEmi({ principal: 1_000_000, annualRatePct: 12, months: 60 });
    expect(r.totalPayment).toBe(1_334_667);
    expect(r.emi * 60).toBe(1_334_640); // the naive figure would be wrong by 27 rupees
  });

  test('pie percentages sum to 100 and match the live labels (74.9% / 25.1%)', () => {
    const r = calculateEmi({ principal: 1_000_000, annualRatePct: 12, months: 60 });
    expect(r.principalPct + r.interestPct).toBeCloseTo(100, 10);
    expect(r.principalPct.toFixed(1)).toBe('74.9');
    expect(r.interestPct.toFixed(1)).toBe('25.1');
  });

  test('zero interest degenerates to principal / n', () => {
    expect(calculateEmi({ principal: 120_000, annualRatePct: 0, months: 12 }).emi).toBe(10_000);
  });

  test('rejects invalid input', () => {
    expect(() => calculateEmi({ principal: 0, annualRatePct: 10, months: 12 })).toThrow(RangeError);
    expect(() => calculateEmi({ principal: 1, annualRatePct: -1, months: 12 })).toThrow(RangeError);
    expect(() => calculateEmi({ principal: 1, annualRatePct: 10, months: 1.5 })).toThrow(
      RangeError,
    );
  });

  test('years to months rounds to the nearest month', () => {
    expect(yearsToMonths(15)).toBe(180);
    expect(yearsToMonths(2.25)).toBe(27);
  });
});

test.describe('inr helpers', () => {
  test('Indian digit grouping round-trips', () => {
    expect(formatInr(1_464_522)).toBe('14,64,522');
    expect(formatInr(5_000_000)).toBe('50,00,000');
    expect(parseInr('₹ 14,64,522')).toBe(1_464_522);
    expect(parseInr('₹2,66,933')).toBe(266_933);
  });

  test('lakh / crore shorthand from feature files', () => {
    expect(parseAmountShorthand('25L')).toBe(2_500_000);
    expect(parseAmountShorthand('7.5L')).toBe(750_000);
    expect(parseAmountShorthand('1Cr')).toBe(10_000_000);
    expect(parseAmountShorthand('2500000')).toBe(2_500_000);
    expect(() => parseAmountShorthand('25 lakhs')).toThrow();
  });

  test('percent labels', () => {
    expect(parsePercent('74.9%')).toBe(74.9);
    expect(() => parsePercent('74.9')).toThrow();
  });
});

test.describe('amortizeByYear oracle', () => {
  const personal = { principal: 1_000_000, annualRatePct: 12, months: 60 };

  test('January start: 5 calendar years of 12 payments each', () => {
    const rows = amortizeByYear(personal, { year: 2027, month: 1 });
    expect(rows.map((r) => r.year)).toEqual([2027, 2028, 2029, 2030, 2031]);
    expect(rows.every((r) => r.payments === 12)).toBe(true);
  });

  test('mid-year start spans one extra calendar year (June: 7 + 12*4 + 5)', () => {
    const rows = amortizeByYear(personal, { year: 2027, month: 6 });
    expect(rows.map((r) => r.year)).toEqual([2027, 2028, 2029, 2030, 2031, 2032]);
    expect(rows.map((r) => r.payments)).toEqual([7, 12, 12, 12, 12, 5]);
  });

  test('matches the tooltip seen live: Jan 2027 start, year 2028', () => {
    // Live recon tooltip: "Year : 2028 Interest : ₹ 91,948 Total Payment : ₹ 2,66,933"
    const y2028 = amortizeByYear(personal, { year: 2027, month: 1 }).find((r) => r.year === 2028);
    expect(Math.round(y2028!.interest)).toBe(91_948);
    expect(Math.round(y2028!.totalPayment)).toBe(266_933);
  });

  test('matches tooltips seen live: 10L, 11%, 3y starting Oct 2026 (partial first year)', () => {
    // Live probe: "Year : 2026 Interest : ₹ 26,850 Total Payment : ₹ 98,216" and
    //             "Year : 2027 Principal : ₹ 3,05,829 Total Payment : ₹ 3,92,865"
    const rows = amortizeByYear(
      { principal: 1_000_000, annualRatePct: 11, months: 36 },
      { year: 2026, month: 10 },
    );
    expect(rows.map((r) => r.year)).toEqual([2026, 2027, 2028, 2029]);
    expect(Math.round(rows[0]!.interest)).toBe(26_850);
    expect(Math.round(rows[0]!.totalPayment)).toBe(98_216);
    expect(Math.round(rows[1]!.principal)).toBe(305_829);
    expect(Math.round(rows[1]!.totalPayment)).toBe(392_865);
  });

  test('yearly sums reconcile with the loan totals and the balance reaches zero', () => {
    const rows = amortizeByYear(personal, { year: 2027, month: 6 });
    const totals = calculateEmi(personal);
    const sum = (k: 'principal' | 'interest') => rows.reduce((a, r) => a + r[k], 0);
    expect(sum('principal')).toBeCloseTo(personal.principal, 6);
    expect(sum('interest')).toBeCloseTo(totals.rawTotalInterest, 6);
    expect(rows.at(-1)!.balance).toBe(0);
  });

  test('rejects an invalid start month', () => {
    expect(() => amortizeByYear(personal, { year: 2027, month: 13 })).toThrow(RangeError);
  });
});
