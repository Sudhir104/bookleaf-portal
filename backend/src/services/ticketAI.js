import { z } from 'zod';
import { Ticket } from '../models/Ticket.js';
import { Book } from '../models/Book.js';
import { Author } from '../models/Author.js';
import { CATEGORIES, PRIORITIES, PRIORITY_RANK } from '../constants.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { chat, AiError, isConfigured } from './ai/groqClient.js';
import { triageMessages, draftMessages } from './ai/prompts.js';
import { buildFacts } from './ai/context.js';
import { fallbackClassify } from './ai/fallbackClassifier.js';
import { publish } from './events.js';

const triageSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  reason: z.string().max(200).optional(),
});

/** Business rules beat the model: the KB says ISBN errors are always high priority. */
export function applyPolicyFloor({ category, priority }) {
  if (category === 'ISBN & Metadata Issues' && PRIORITY_RANK[priority] < PRIORITY_RANK.High) priority = 'High';
  return { category, priority };
}

function parseTriage(text) {
  try {
    return triageSchema.parse(JSON.parse(text));
  } catch {
    throw new AiError('BAD_RESPONSE', 'AI returned an invalid classification');
  }
}

/**
 * Classify + prioritise a ticket. NEVER throws: on any AI failure we fall back to
 * keyword rules, record why, and the ticket stays fully usable (admin can retry or override).
 */
export async function runTriage(ticketId) {
  const ticket = await Ticket.findById(ticketId).populate('book', 'title status');
  if (!ticket) return;

  let result;
  let source = 'ai';
  try {
    const { text, usage } = await chat({
      model: env.triageModel,
      messages: triageMessages({ subject: ticket.subject, description: ticket.description, book: ticket.book }),
      json: true,
      maxTokens: 800,
      temperature: 0,
    });
    result = parseTriage(text);
    ticket.aiStatus = 'done';
    ticket.aiError = null;
    console.info(`[ai] triage ${ticket._id} tokens in/out: ${usage.prompt_tokens}/${usage.completion_tokens}`);
  } catch (err) {
    result = fallbackClassify(ticket.subject, ticket.description);
    source = 'rules';
    ticket.aiStatus = err.code === 'NOT_CONFIGURED' ? 'skipped' : 'failed';
    ticket.aiError = err.code || 'UNKNOWN';
    console.warn(`[ai] triage failed for ${ticket._id}: ${err.code || err.message}`);
  }

  const floored = applyPolicyFloor(result);
  // Respect admin overrides that happened while the AI call was in flight
  if (ticket.categorySource !== 'admin') {
    ticket.category = floored.category;
    ticket.categorySource = source;
  }
  if (ticket.prioritySource !== 'admin') {
    ticket.priority = floored.priority;
    ticket.prioritySource = source;
  }
  ticket.aiReason = result.reason || null;
  await ticket.save();
  publish({ type: 'ticket.updated' }, ticket);
}

/**
 * Lazily generate (and cache) the draft reply when an admin opens a ticket.
 * Tickets nobody opens never cost a draft call. Throws AppError(503) if AI is down.
 */
export async function generateDraft(ticketId, { regenerate = false } = {}) {
  let ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');

  // Triage runs in the background right after creation. If an admin opens the ticket
  // within seconds, wait briefly so the draft is written for the right category.
  for (let i = 0; i < 12 && ticket.aiStatus === 'pending' && Date.now() - ticket.createdAt < 30000; i++) {
    await new Promise((r) => setTimeout(r, 500));
    ticket = await Ticket.findById(ticketId);
  }

  const category = ticket.category || 'General Inquiry';
  // Cached draft is reused only if it was written for the current category
  if (ticket.aiDraft && !regenerate && ticket.aiDraftCategory === category) return ticket.aiDraft;

  const [author, allBooks] = await Promise.all([Author.findById(ticket.author), Book.find({ author: ticket.author }).lean()]);
  const book = ticket.book ? allBooks.find((b) => String(b._id) === String(ticket.book)) : null;

  try {
    const { text, usage } = await chat({
      model: env.draftModel,
      messages: draftMessages({
        category,
        subject: ticket.subject,
        description: ticket.description,
        facts: buildFacts({ author, book, allBooks, category }),
        firstName: author.name.split(' ')[0],
      }),
      maxTokens: 1500,
      temperature: 0.4,
    });
    console.info(`[ai] draft ${ticket._id} tokens in/out: ${usage.prompt_tokens}/${usage.completion_tokens}`);
    ticket.aiDraft = text.trim();
    ticket.aiDraftCategory = category;
    await ticket.save();
    return ticket.aiDraft;
  } catch (err) {
        console.warn('[ai] draft failed:', err.code, err.message);
    const code = err.code || 'UNKNOWN';
    const msg = code === 'NOT_CONFIGURED'
      ? 'AI drafting is not configured. Write the reply manually.'
      : 'AI drafting is unavailable right now. Write the reply manually or retry in a minute.';
    throw new AppError(503, msg, `AI_${code}`);
  }
}

export { isConfigured };
