import { Router } from 'express';
import { z } from 'zod';
import { Ticket } from '../models/Ticket.js';
import { Book } from '../models/Book.js';
import { AppError } from '../utils/AppError.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { runTriage } from '../services/ticketAI.js';
import { publish } from '../services/events.js';

const router = Router();
router.use(authenticate, authorize('author'));

const createSchema = z.object({
  bookId: z.string().nullish(), // null/omitted = General / Account Level
  subject: z.string().trim().min(5, 'Subject must be at least 5 characters').max(150, 'Subject is too long'),
  description: z.string().trim().min(20, 'Please describe the issue in at least 20 characters').max(5000),
  attachmentName: z.string().max(255).nullish(),
});

// Authors must never see internal notes, AI output, assignee or classification internals
const AUTHOR_VISIBLE = '-internalNotes -aiDraft -aiReason -aiStatus -aiError -assignedTo -category -categorySource -prioritySource -priorityRank -isActive';
const authorView = (q) => q.select(AUTHOR_VISIBLE).populate('book', 'title isbn');

// POST /api/tickets
router.post('/', validate(createSchema), async (req, res) => {
  const { bookId, subject, description, attachmentName } = req.valid.body;

  if (bookId) {
    const owned = await Book.exists({ _id: bookId, author: req.user.author });
    if (!owned) throw new AppError(404, 'Book not found', 'BOOK_NOT_FOUND');
  }

  const ticket = await Ticket.create({
    author: req.user.author,
    book: bookId || null,
    subject,
    description,
    attachmentName: attachmentName || null,
  });

  // Fire-and-forget: ticket creation never waits on (or depends on) the AI
  runTriage(ticket._id).catch((err) => console.error('triage crashed', err));
  publish({ type: 'ticket.created' }, ticket);

  res.status(201).json({ data: await authorView(Ticket.findById(ticket._id)).lean() });
});

// GET /api/tickets
router.get('/', async (req, res) => {
  const tickets = await authorView(Ticket.find({ author: req.user.author }).sort({ createdAt: -1 })).lean();
  res.json({ data: tickets });
});

// GET /api/tickets/:id
router.get('/:id', async (req, res) => {
  const ticket = await authorView(Ticket.findOne({ _id: req.params.id, author: req.user.author })).lean();
  if (!ticket) throw new AppError(404, 'Ticket not found', 'TICKET_NOT_FOUND');
  res.json({ data: ticket });
});

export default router;
