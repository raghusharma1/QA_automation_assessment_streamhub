/**
 * Independent EMI oracle. It never reads from the application: expected values are derived from
 * the loan inputs alone and then compared with what the UI displays.
 *
 *   EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)     r = annual rate / 12 / 100, n = months
 *
 * Rounding follows the published convention of the calculator under test (EMI in arrears):
 * every displayed figure is rounded independently from the *unrounded* EMI, so
 * totalPayment = round(rawEmi * n), which differs from round(rawEmi) * n.
 */
export interface LoanInput {
  /** Principal in rupees. */
  principal: number;
  /** Annual interest rate in percent, e.g. 7.5 for 7.5%. */
  annualRatePct: number;
  /** Tenure in months. */
  months: number;
}

export interface LoanBreakdown {
  /** Unrounded monthly instalment. Use for further arithmetic. */
  rawEmi: number;
  /** Unrounded total interest over the loan. */
  rawTotalInterest: number;
  /** Displayed (rounded) values. */
  emi: number;
  totalInterest: number;
  totalPayment: number;
  /** Share of total payment, in percent (unrounded): what the pie chart slices represent. */
  principalPct: number;
  interestPct: number;
}

export function yearsToMonths(years: number): number {
  return Math.round(years * 12);
}

export function calculateEmi({ principal, annualRatePct, months }: LoanInput): LoanBreakdown {
  if (!(principal > 0)) throw new RangeError(`principal must be > 0, got ${principal}`);
  if (!(annualRatePct >= 0))
    throw new RangeError(`annualRatePct must be >= 0, got ${annualRatePct}`);
  if (!Number.isInteger(months) || months <= 0) {
    throw new RangeError(`months must be a positive integer, got ${months}`);
  }

  const r = annualRatePct / 12 / 100;
  const rawEmi =
    r === 0 ? principal / months : (principal * r * (1 + r) ** months) / ((1 + r) ** months - 1);
  const rawTotalPayment = rawEmi * months;
  const rawTotalInterest = rawTotalPayment - principal;

  return {
    rawEmi,
    rawTotalInterest,
    emi: Math.round(rawEmi),
    totalInterest: Math.round(rawTotalInterest),
    totalPayment: Math.round(rawTotalPayment),
    principalPct: (principal / rawTotalPayment) * 100,
    interestPct: (rawTotalInterest / rawTotalPayment) * 100,
  };
}
