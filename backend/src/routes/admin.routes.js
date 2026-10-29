import { Router } from 'express';
import { z } from 'zod';
import { Ticket } from '../models/Ticket.js';
import { Book } from '../models/Book.js';
import { AppError } from '../utils/AppError.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { CATEGORIES, PRIORITIES, STATUSES, ACTIVE_STATUSES } from '../constants.js';
import { runTriage, generateDraft } from '../services/ticketAI.js';
import { health } from '../services/ai/groqClient.js';
import { publish } from '../services/events.js';

const router = Router();
router.use(authenticate, authorize('admin'));

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const populateFull = (q) =>
  q
    .populate('author', 'authorId name email phone city')
    .populate('book', 'title isbn status')
    .populate('assignedTo', 'name email');

// ---------- schemas ----------
const listSchema = z.object({
  status: z.string().optional(), // "active" | single status | comma list
  category: z.enum(CATEGORIES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignee: z.enum(['me', 'unassigned']).optional(),
  q: z.string().trim().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['urgency', 'newest', 'oldest']).default('urgency'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const patchSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    category: z.enum(CATEGORIES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assignedTo: z.enum(['me']).nullable().optional(), // "me" = assign to self, null = unassign
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

const noteSchema = z.object({ text: z.string().trim().min(1, 'Note cannot be empty').max(2000) });
const replySchema = z.object({
  message: z.string().trim().min(10, 'Reply is too short').max(5000),
  status: z.enum(STATUSES).optional(),
  aiAssisted: z.boolean().default(false),
});

async function loadTicket(id) {
  const t = await Ticket.findById(id);
  if (!t) throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
  return t;
}

// ---------- AI health ----------
// GET /api/admin/ai/status
router.get('/ai/status', (req, res) => res.json({ data: health() }));

// ---------- queue ----------
// GET /api/admin/tickets
router.get('/tickets', validate(listSchema, 'query'), async (req, res) => {
  const f = req.valid.query;
  const filter = {};
  if (f.status === 'active') filter.status = { $in: ACTIVE_STATUSES };
  else if (f.status) {
    const list = f.status.split(',').map((s) => s.trim());
    if (!list.every((s) => STATUSES.includes(s))) throw new AppError(400, 'Invalid status filter', 'VALIDATION_ERROR');
    filter.status = { $in: list };
  }
  if (f.category) filter.category = f.category;
  if (f.priority) filter.priority = f.priority;
  if (f.assignee === 'me') filter.assignedTo = req.user._id;
  if (f.assignee === 'unassigned') filter.assignedTo = null;
  if (f.q) filter.subject = { $regex: escapeRegex(f.q), $options: 'i' };
  if (f.from || f.to) filter.createdAt = { ...(f.from && { $gte: f.from }), ...(f.to && { $lte: new Date(f.to.getTime() + 86399999) }) };

  // urgency = active first, highest priority first, then OLDEST first
  const sort = { urgency: { isActive: -1, priorityRank: -1, createdAt: 1 }, newest: { createdAt: -1 }, oldest: { createdAt: 1 } }[f.sort];

  const [tickets, total] = await Promise.all([
    populateFull(Ticket.find(filter).select('-internalNotes -aiDraft').sort(sort).skip((f.page - 1) * f.limit).limit(f.limit)).lean(),
    Ticket.countDocuments(filter),
  ]);
  res.json({ data: tickets, meta: { total, page: f.page, limit: f.limit } });
});

// GET /api/admin/tickets/stats
router.get('/tickets/stats', async (req, res) => {
  const [byStatus, byPriority, oldest, unassigned] = await Promise.all([
    Ticket.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Ticket.aggregate([{ $match: { isActive: true } }, { $group: { _id: '$priority', n: { $sum: 1 } } }]),
    Ticket.findOne({ isActive: true }).sort({ createdAt: 1 }).select('createdAt subject').lean(),
    Ticket.countDocuments({ isActive: true, assignedTo: null }),
  ]);
  res.json({
    data: {
      byStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.n])),
      activeByPriority: Object.fromEntries(byPriority.map((r) => [r._id || 'Unclassified', r.n])),
      unassignedActive: unassigned,
      oldestActive: oldest,
    },
  });
});

// GET /api/admin/tickets/:id  (full ticket incl. internal notes and a snapshot of the book's royalty data)
router.get('/tickets/:id', async (req, res) => {
  const ticket = await populateFull(Ticket.findById(req.params.id)).lean();
  if (!ticket) throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
  if (ticket.book) {
    ticket.bookDetails = await Book.findById(ticket.book._id).lean();
  }
  res.json({ data: ticket });
});

// PATCH /api/admin/tickets/:id  (status, category/priority override, assign)
router.patch('/tickets/:id', validate(patchSchema), async (req, res) => {
  const ticket = await loadTicket(req.params.id);
  const { status, category, priority, assignedTo } = req.valid.body;

  if (status) ticket.status = status;
  if (category) { ticket.category = category; ticket.categorySource = 'admin'; }
  if (priority) { ticket.priority = priority; ticket.prioritySource = 'admin'; }
  if (assignedTo !== undefined) ticket.assignedTo = assignedTo === 'me' ? req.user._id : null;
  await ticket.save();

  publish({ type: 'ticket.updated' }, ticket);
  res.json({ data: await populateFull(Ticket.findById(ticket._id)).select('-internalNotes -aiDraft').lean() });
});

// POST /api/admin/tickets/:id/notes  (internal, never shown to authors)
router.post('/tickets/:id/notes', validate(noteSchema), async (req, res) => {
  const ticket = await loadTicket(req.params.id);
  ticket.internalNotes.push({ text: req.valid.body.text, by: req.user._id, byName: req.user.name });
  await ticket.save();
  publish({ type: 'ticket.note' }, ticket); // admins only see content; authors get a no-op refetch
  res.status(201).json({ data: ticket.internalNotes.at(-1) });
});

// POST /api/admin/tickets/:id/responses  (visible to the author)
router.post('/tickets/:id/responses', validate(replySchema), async (req, res) => {
  const ticket = await loadTicket(req.params.id);
  const { message, status, aiAssisted } = req.valid.body;

  ticket.responses.push({ message, sentBy: req.user._id, sentByName: req.user.name, aiAssisted });
  ticket.status = status || (ticket.status === 'Open' ? 'In Progress' : ticket.status);
  if (!ticket.assignedTo) ticket.assignedTo = req.user._id; // replying = taking ownership
  await ticket.save();

  publish({ type: 'ticket.replied' }, ticket);
  res.status(201).json({ data: ticket.responses.at(-1) });
});

// ---------- AI actions ----------
// POST /api/admin/tickets/:id/ai/draft?regenerate=true
router.post('/tickets/:id/ai/draft', async (req, res) => {
  const draft = await generateDraft(req.params.id, { regenerate: req.query.regenerate === 'true' });
  res.json({ data: { draft } });
});

// POST /api/admin/tickets/:id/ai/triage  (retry classification after an AI failure)
router.post('/tickets/:id/ai/triage', async (req, res) => {
  await loadTicket(req.params.id);
  await runTriage(req.params.id);
  res.json({ data: await populateFull(Ticket.findById(req.params.id)).select('-internalNotes -aiDraft').lean() });
});

export default router;
