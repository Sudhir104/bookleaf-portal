// AI path with a mocked Groq API: success, rate-limit -> fallback, bad JSON -> fallback, draft success.
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/bookleaf';
process.env.JWT_SECRET ||= 'test';
process.env.GROQ_API_KEY = 'gsk_test_key';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
// Dynamic imports: static ones are hoisted above the env assignment, so config would read an empty key.
const { connectDB } = await import('../src/config/db.js');
const { Ticket } = await import('../src/models/Ticket.js');
const { Author } = await import('../src/models/Author.js');
const { Book } = await import('../src/models/Book.js');
const { runTriage, generateDraft } = await import('../src/services/ticketAI.js');
const { stats } = await import('../src/services/ai/groqClient.js');

const realFetch = globalThis.fetch;
let mode = 'ok';
let lastBody;
before(async () => {
  await connectDB();
  globalThis.fetch = async (url, opts) => {
    if (!String(url).includes('api.groq.com')) return realFetch(url, opts);
    lastBody = JSON.parse(opts.body);
    if (mode === '429') return new Response('{}', { status: 429, headers: { 'retry-after': '0' } });
    if (mode === 'badjson') return Response.json({ choices: [{ message: { content: 'not json at all' } }], usage: {} });
    const content = lastBody.response_format
      ? JSON.stringify({ category: 'ISBN & Metadata Issues', priority: 'Low', reason: 'ISBN mismatch reported' })
      : 'Dear Priya,\n\nThank you for flagging this.\n\nWarm regards,\nBookLeaf Author Support Team';
    return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 40 } });
  };
});
after(async () => {
  globalThis.fetch = realFetch;
  await mongoose.disconnect();
});

const makeTicket = async (extra = {}) => {
  const author = await Author.findOne({ authorId: 'AUTH001' });
  const book = await Book.findOne({ bookId: 'BK001' });
  return Ticket.create({ author: author._id, book: book._id, subject: 'ISBN problem', description: 'The ISBN on my physical copy does not match Amazon.', ...extra });
};

test('triage: AI result applied, policy floor lifts ISBN priority to High', async () => {
  mode = 'ok';
  const t = await makeTicket();
  await runTriage(t._id);
  const u = await Ticket.findById(t._id);
  assert.equal(u.category, 'ISBN & Metadata Issues');
  assert.equal(u.categorySource, 'ai');
  assert.equal(u.priority, 'High'); // model said Low, KB rule says ISBN >= High
  assert.equal(u.aiStatus, 'done');
  assert.equal(lastBody.model, 'openai/gpt-oss-20b'); // cheap model for triage
});

test('triage: rate limit -> keyword fallback, ticket still fully usable', async () => {
  mode = '429';
  const t = await makeTicket();
  await runTriage(t._id);
  const u = await Ticket.findById(t._id);
  assert.equal(u.aiStatus, 'failed');
  assert.equal(u.aiError, 'RATE_LIMITED');
  assert.equal(u.categorySource, 'rules');
  assert.equal(u.category, 'ISBN & Metadata Issues');
});

test('triage: invalid JSON from model -> fallback, and admin override is never overwritten', async () => {
  mode = 'badjson';
  stats.consecutiveFailures = 0; stats.breakerOpenUntil = 0;
  const t = await makeTicket({ category: 'General Inquiry', categorySource: 'admin' });
  await runTriage(t._id);
  const u = await Ticket.findById(t._id);
  assert.equal(u.category, 'General Inquiry'); // admin's choice preserved
  assert.equal(u.categorySource, 'admin');
  assert.equal(u.aiStatus, 'failed');
});

test('draft: uses draft model, only matching policy, caches result', async () => {
  mode = 'ok';
  stats.consecutiveFailures = 0; stats.breakerOpenUntil = 0;
  const t = await makeTicket({ category: 'ISBN & Metadata Issues', categorySource: 'admin', aiStatus: 'done' });
  const draft = await generateDraft(t._id);
  assert.match(draft, /^Dear Priya/);
  assert.equal(lastBody.model, 'openai/gpt-oss-120b');
  assert.match(lastBody.messages[0].content, /ISBN errors/);
  assert.doesNotMatch(lastBody.messages[0].content, /80\/20/);
  lastBody = null;
  assert.equal(await generateDraft(t._id), draft);
  assert.equal(lastBody, null); // second call served from cache: zero tokens
});

test('draft: provider down -> AppError 503 (admin writes manually)', async () => {
  mode = '429';
  const t = await makeTicket({ aiStatus: 'done' });
  await assert.rejects(() => generateDraft(t._id), (e) => e.status === 503 && e.code === 'AI_RATE_LIMITED');
});
