/**
 * Indian-rupee helpers. The calculator displays amounts with Indian digit grouping
 * (25,00,000 = 25 lakh) and feature files use the lakh shorthand from the assessment (25L).
 */
const LAKH = 100_000;
const CRORE = 100 * LAKH;

const inrFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** 1464522 -> "14,64,522" */
export function formatInr(value: number): string {
  return inrFormatter.format(Math.round(value));
}

/** "₹ 14,64,522" | "14,64,522" | "₹2,66,933" -> 1464522 */
export function parseInr(text: string): number {
  const digits = text.replace(/[₹,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(digits)) throw new Error(`Not an INR amount: "${text}"`);
  return Number(digits);
}

/** "25L" | "7.5L" | "1Cr" | "2500000" -> rupees */
export function parseAmountShorthand(text: string): number {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(L|Cr)?\s*$/i.exec(text);
  if (!match) throw new Error(`Unsupported amount "${text}". Use e.g. 25L, 1Cr or 2500000`);
  const value = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const rupees = unit === 'l' ? value * LAKH : unit === 'cr' ? value * CRORE : value;
  return Math.round(rupees);
}

/** "74.9%" -> 74.9 */
export function parsePercent(text: string): number {
  const match = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(text);
  if (!match) throw new Error(`Not a percentage: "${text}"`);
  return Number(match[1]);
}
