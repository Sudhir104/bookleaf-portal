import { ROYALTY_MIN_PAYOUT } from '../../constants.js';
import { today, daysBetween, fmtDate, nextPayout } from '../../utils/dates.js';

const inr = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;
const isPublished = (b) => b.status === 'Published & Live';

/**
 * Deterministic business facts computed in CODE, not by the LLM.
 * The model only writes the words; numbers/dates/flags come from here,
 * so it cannot hallucinate a payout date or misread a balance.
 */
export function royaltyFacts(book, allBooks, now = today()) {
  const published = allBooks.filter(isPublished);
  const authorPending = published.reduce((s, b) => s + (b.royaltyPending || 0), 0);
  const { deadline, quarterEnd } = nextPayout(now);
  const lines = [
    `author_total_pending_all_books: ${inr(authorPending)} (min payout ${inr(ROYALTY_MIN_PAYOUT)}${authorPending < ROYALTY_MIN_PAYOUT ? '; BELOW threshold so it rolls over to next quarter' : ''})`,
    `next_regular_payout_deadline: ${fmtDate(deadline)} (upcoming quarter, NOT yet passed; never call this missed)`,
  ];

  if (book && isPublished(book)) {
    const last = book.lastRoyaltyPayoutDate ? new Date(book.lastRoyaltyPayoutDate) : null;
    const daysSince = last ? daysBetween(last, now) : null;
    const flags = [];
    if (authorPending >= ROYALTY_MIN_PAYOUT && !last) flags.push('NEVER PAID although pending is above threshold: payouts from EARLIER quarters were missed and are OVERDUE; own it and escalate with 48-hour timeline');
    else if (authorPending >= ROYALTY_MIN_PAYOUT && daysSince > 135) flags.push(`last payout was ${daysSince} days ago (more than quarter + 45-day window): payout may be OVERDUE, escalate`);
    if (authorPending > 0 && authorPending < ROYALTY_MIN_PAYOUT) flags.push('pending is below threshold: roll-over is expected, not a delay');
    if (flags.length) lines.push(`royalty_flags: ${flags.join(' | ')}`);
  }
  return lines;
}

export function bookLine(b) {
  const parts = [`"${b.title}"`, `status: ${b.status}`];
  if (isPublished(b)) {
    parts.push(`published ${fmtDate(b.publicationDate)}`, `MRP ${inr(b.mrp)}`, `copies sold ${b.totalCopiesSold}`,
      `royalty earned ${inr(b.totalRoyaltyEarned)}, paid ${inr(b.royaltyPaid)}, pending ${inr(b.royaltyPending)}`,
      `last payout ${b.lastRoyaltyPayoutDate ? fmtDate(b.lastRoyaltyPayoutDate) : 'none yet'}`,
      `print partner ${b.printPartner || 'n/a'}`, `listed on ${b.availableOn?.join(', ') || 'none'}`);
  } else {
    parts.push('not published yet: no sales or royalty exist');
  }
  parts.push(`ISBN ${b.isbn}`);
  return parts.join('; ');
}

/** Compact facts block for the draft prompt. Only the relevant book, or a 1-line-per-book summary. */
export function buildFacts({ author, book, allBooks, category, now = today() }) {
  const lines = [`author: ${author.name} (member since ${fmtDate(author.joinedDate)})`, `today: ${fmtDate(now)}`];
  if (book) lines.push(`ticket_book: ${bookLine(book)}`);
  else lines.push(...allBooks.map((b, i) => `book_${i + 1}: ${bookLine(b)}`));
  if (category === 'Royalty & Payments' || !book) lines.push(...royaltyFacts(book, allBooks, now));
  return lines.join('\n');
}
