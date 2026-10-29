import { env } from '../config/env.js';

/** "Today" (UTC midnight). REFERENCE_DATE lets demos/tests pin the date. */
export function today() {
  const d = env.referenceDate ? new Date(env.referenceDate) : new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
export const daysBetween = (a, b) => Math.floor((b.getTime() - a.getTime()) / 86400000);

export const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : null;

/**
 * Royalty policy: calculated quarterly, paid within 45 days of quarter end.
 * Returns the next payout deadline and which quarter it covers.
 */
export function nextPayout(now = today()) {
  const y = now.getUTCFullYear();
  const q = Math.floor(now.getUTCMonth() / 3); // 0..3 = current quarter
  const currentQuarterEnd = new Date(Date.UTC(y, q * 3 + 3, 0)); // last day of current quarter
  const prevQuarterEnd = new Date(Date.UTC(y, q * 3, 0)); // last day of previous quarter
  const prevDeadline = addDays(prevQuarterEnd, 45);

  // Still inside the 45-day window of the previous quarter -> that payout is the next one
  if (now <= prevDeadline) return { deadline: prevDeadline, quarterEnd: prevQuarterEnd };
  return { deadline: addDays(currentQuarterEnd, 45), quarterEnd: currentQuarterEnd };
}
