// Integration tests: need MongoDB (MONGODB_URI) with the seed data (`npm run seed`).
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:27017/bookleaf';
process.env.JWT_SECRET ||= 'test';
process.env.GROQ_API_KEY = ''; // manual mode
import "./setup-env.js";
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { app } from '../src/app.js';
import { connectDB } from '../src/config/db.js';

let server, base;
before(async () => {
  await connectDB();
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  server.close();
  await mongoose.disconnect();
});

const call = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};
const login = async (email, password = 'Author@123') => (await call('/auth/login', { method: 'POST', body: { email, password } })).json.data.token;

test('auth: rejects bad credentials, missing token and bad input', async () => {
  assert.equal((await call('/auth/login', { method: 'POST', body: { email: 'priya.sharma@email.com', password: 'nope' } })).status, 401);
  assert.equal((await call('/books')).status, 401);
  const bad = await call('/auth/login', { method: 'POST', body: { email: 'not-an-email' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'VALIDATION_ERROR');
});

test('rbac: author sees only own books, other books 404, admin routes 403', async () => {
  const priya = await login('priya.sharma@email.com');
  const mine = await call('/books', { token: priya });
  assert.equal(mine.json.data.length, 2);
  const rohit = await login('rohit.kapoor@email.com');
  const rohitBook = (await call('/books', { token: rohit })).json.data[0]._id;
  assert.equal((await call(`/books/${rohitBook}`, { token: priya })).status, 404);
  assert.equal((await call('/admin/tickets', { token: priya })).status, 403);
  const admin = await login('admin@bookleaf.com', 'Admin@123');
  assert.equal((await call('/books', { token: admin })).json.data.length, 18);
  assert.equal((await call('/tickets', { token: admin })).status, 403);
});

test('books in production return null fields without crashing', async () => {
  const sneha = await login('sneha.kulkarni@email.com');
  const book = (await call('/books', { token: sneha })).json.data.find((b) => b.bookId === 'BK013');
  assert.equal(book.mrp, null);
  assert.equal(book.totalRoyaltyEarned, 0);
});

test('ticket lifecycle: create (AI off) -> admin triage fields -> draft 503 -> reply -> author sees reply only', async () => {
  const author = await login('ananya.reddy@email.com');
  const admin = await login('admin@bookleaf.com', 'Admin@123');
  const books = (await call('/books', { token: author })).json.data;

  // validation + foreign book
  assert.equal((await call('/tickets', { method: 'POST', token: author, body: { subject: 'x', description: 'short' } })).status, 400);
  const foreign = (await call('/books', { token: admin })).json.data.find((b) => b.bookId === 'BK001')._id;
  assert.equal((await call('/tickets', { method: 'POST', token: author, body: { bookId: foreign, subject: 'Royalty question', description: 'This is about someone else book entirely.' } })).status, 404);

  const created = await call('/tickets', { method: 'POST', token: author, body: { bookId: books[0]._id, subject: 'Royalty not received', description: 'I have not received any royalty for months, please check.' } });
  assert.equal(created.status, 201);
  assert.equal(created.json.data.status, 'Open');
  assert.equal(created.json.data.internalNotes, undefined);
  const id = created.json.data._id;

  await new Promise((r) => setTimeout(r, 3000)); // let background triage (rules fallback) finish
  const adminView = (await call(`/admin/tickets/${id}`, { token: admin })).json.data;
  assert.equal(adminView.category, 'Royalty & Payments');
  assert.equal(adminView.categorySource, 'rules');
  assert.equal(adminView.aiStatus, 'skipped');

  const draft = await call(`/admin/tickets/${id}/ai/draft`, { method: 'POST', token: admin });
  assert.equal(draft.status, 503);
  assert.equal(draft.json.error.code, 'AI_NOT_CONFIGURED');

  // override + note + assign
  const patched = await call(`/admin/tickets/${id}`, { method: 'PATCH', token: admin, body: { priority: 'Low', assignedTo: 'me' } });
  assert.equal(patched.json.data.prioritySource, 'admin');
  assert.equal((await call(`/admin/tickets/${id}/notes`, { method: 'POST', token: admin, body: { text: 'Checking bank details with finance' } })).status, 201);
  assert.equal((await call(`/admin/tickets/${id}`, { method: 'PATCH', token: admin, body: {} })).status, 400);

  // reply
  const reply = await call(`/admin/tickets/${id}/responses`, { method: 'POST', token: admin, body: { message: 'Dear Ananya, we are escalating this now.', status: 'In Progress' } });
  assert.equal(reply.status, 201);
  const authorView = (await call(`/tickets/${id}`, { token: author })).json.data;
  assert.equal(authorView.status, 'In Progress');
  assert.equal(authorView.responses.length, 1);
  assert.equal(authorView.internalNotes, undefined); // internal notes never leak
  assert.equal(authorView.category, undefined);

  // another author cannot read it
  const other = await login('priya.sharma@email.com');
  assert.equal((await call(`/tickets/${id}`, { token: other })).status, 404);
});

test('admin queue: filters + urgency sort (active first, high priority first, oldest first)', async () => {
  const admin = await login('admin@bookleaf.com', 'Admin@123');
  const all = (await call('/admin/tickets?status=active', { token: admin })).json;
  assert.ok(all.data.length >= 5);
  const ranks = all.data.map((t) => t.priorityRank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a));
  const only = await call('/admin/tickets?category=Printing%20%26%20Quality', { token: admin });
  assert.ok(only.json.data.every((t) => t.category === 'Printing & Quality'));
  assert.equal((await call('/admin/tickets?priority=Urgent', { token: admin })).status, 400);
  assert.equal((await call('/admin/tickets/stats', { token: admin })).status, 200);
});

test('sse: author receives an event when admin replies, other authors do not', async () => {
  const author = await login('arjun.malhotra@email.com');
  const stranger = await login('meera.nair@email.com');
  const admin = await login('admin@bookleaf.com', 'Admin@123');
  const t = await call('/tickets', { method: 'POST', token: author, body: { subject: 'Royalty too low', description: 'I sold 88 copies but royalty looks too low to me.' } });
  const id = t.json.data._id;

  const listen = async (token, ms) => {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/stream?token=${token}`, { signal: ctrl.signal });
    const chunks = [];
    const reader = res.body.getReader();
    (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; chunks.push(Buffer.from(value).toString()); } } catch {} })();
    setTimeout(() => ctrl.abort(), ms);
    return () => chunks.join('');
  };
  const authorSeen = await listen(author, 1200);
  const strangerSeen = await listen(stranger, 1200);
  await new Promise((r) => setTimeout(r, 300));
  await call(`/admin/tickets/${id}/responses`, { method: 'POST', token: admin, body: { message: 'Here is your royalty breakdown, thanks for waiting.' } });
  await new Promise((r) => setTimeout(r, 1000));
  assert.match(authorSeen(), new RegExp(`ticket.replied.*${id}`));
  assert.doesNotMatch(strangerSeen(), new RegExp(id));
  assert.equal((await fetch(`${base}/stream?token=bad`)).status, 401);
});
