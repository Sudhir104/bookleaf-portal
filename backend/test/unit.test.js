process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/bookleaf';
process.env.JWT_SECRET ||= 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextPayout, fmtDate } from '../src/utils/dates.js';
import { fallbackClassify } from '../src/services/ai/fallbackClassifier.js';
import { applyPolicyFloor } from '../src/services/ticketAI.js';
import { royaltyFacts } from '../src/services/ai/context.js';
import { triageMessages, draftMessages } from '../src/services/ai/prompts.js';

const d = (s) => new Date(`${s}T00:00:00Z`);

test('nextPayout: inside 45-day window of previous quarter', () => {
  const r = nextPayout(d('2026-10-27')); // Q3 ended 30 Sep -> deadline 14 Nov
  assert.equal(fmtDate(r.deadline), '14 Nov 2026');
});
test('nextPayout: after window moves to current quarter', () => {
  const r = nextPayout(d('2026-12-01')); // Q4 ends 31 Dec -> deadline 14 Feb
  assert.equal(fmtDate(r.deadline), '14 Feb 2027');
});
test('fallback classifier: ISBN and royalty', () => {
  assert.equal(fallbackClassify('ISBN mismatch', 'wrong isbn on amazon').category, 'ISBN & Metadata Issues');
  const r = fallbackClassify('No royalty', 'I have never received any royalty for months');
  assert.equal(r.category, 'Royalty & Payments');
  assert.equal(r.priority, 'Critical');
  assert.equal(fallbackClassify('Bio', 'Can I change my author bio please').priority, 'Low');
});
test('policy floor: ISBN is never below High', () => {
  assert.equal(applyPolicyFloor({ category: 'ISBN & Metadata Issues', priority: 'Low' }).priority, 'High');
  assert.equal(applyPolicyFloor({ category: 'ISBN & Metadata Issues', priority: 'Critical' }).priority, 'Critical');
  assert.equal(applyPolicyFloor({ category: 'General Inquiry', priority: 'Low' }).priority, 'Low');
});
test('royaltyFacts: never paid above threshold is flagged overdue; below threshold is a roll-over', () => {
  const published = { status: 'Published & Live', royaltyPending: 2546, lastRoyaltyPayoutDate: null };
  assert.match(royaltyFacts(published, [published], d('2026-10-27')).join('\n'), /OVERDUE/);
  const small = { status: 'Published & Live', royaltyPending: 850, lastRoyaltyPayoutDate: null };
  const out = royaltyFacts(small, [small], d('2026-10-27')).join('\n');
  assert.match(out, /rolls over/);
  assert.doesNotMatch(out, /OVERDUE/);
});
test('prompts: draft prompt only carries the matching category policy (token control)', () => {
  const msgs = draftMessages({ category: 'Printing & Quality', subject: 's', description: 'x', facts: 'f', firstName: 'Diya' });
  const sys = msgs[0].content;
  assert.match(sys, /FREE reprint/);
  assert.doesNotMatch(sys, /80\/20 split/); // royalty policy not included
  assert.ok(sys.length < 4500);
});
test('prompts: triage prompt clips long input', () => {
  const msgs = triageMessages({ subject: 'a'.repeat(1000), description: 'b'.repeat(10000), book: null });
  assert.ok(msgs[1].content.length < 2000);
});
