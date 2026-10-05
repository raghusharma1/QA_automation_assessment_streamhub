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

/** A calendar month, e.g. { year: 2027, month: 1 } for January 2027. */
export interface YearMonth {
  year: number;
  /** 1 = January ... 12 = December. */
  month: number;
}

export interface YearlyAmortization {
  year: number;
  /** Number of instalments that fall in this calendar year. */
  payments: number;
  /** Unrounded sums for the year; round only for display. */
  principal: number;
  interest: number;
  totalPayment: number;
  /** Outstanding balance after the year's last instalment. */
  balance: number;
}

/**
 * Month-by-month amortization (EMI in arrears), grouped by calendar year: one entry per bar in
 * the calculator's yearly chart. The first instalment falls in `start`. A schedule that does not
 * start in January therefore spans one more calendar year than its tenure in years.
 */
export function amortizeByYear(loan: LoanInput, start: YearMonth): YearlyAmortization[] {
  if (!Number.isInteger(start.month) || start.month < 1 || start.month > 12) {
    throw new RangeError(`start.month must be 1..12, got ${start.month}`);
  }
  const { rawEmi } = calculateEmi(loan);
  const r = loan.annualRatePct / 12 / 100;
  const years = new Map<number, YearlyAmortization>();
  let balance = loan.principal;

  for (let i = 0; i < loan.months; i++) {
    const monthIndex = start.month - 1 + i;
    const year = start.year + Math.floor(monthIndex / 12);
    const interest = balance * r;
    const principal = rawEmi - interest;
    balance -= principal;

    const row = years.get(year) ?? {
      year,
      payments: 0,
      principal: 0,
      interest: 0,
      totalPayment: 0,
      balance: 0,
    };
    row.payments += 1;
    row.principal += principal;
    row.interest += interest;
    row.totalPayment += rawEmi;
    row.balance = Math.max(balance, 0);
    years.set(year, row);
  }
  // Floating-point residue: the final balance is zero by definition.
  const rows = [...years.values()];
  const last = rows.at(-1);
  if (last) last.balance = 0;
  return rows;
}
