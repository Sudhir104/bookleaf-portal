import { Router } from 'express';
import { Book } from '../models/Book.js';
import { AppError } from '../utils/AppError.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Authors only ever get their own books; admins get all
const scope = (user) => (user.role === 'admin' ? {} : { author: user.author });

// GET /api/books
router.get('/', async (req, res) => {
  const books = await Book.find(scope(req.user)).sort({ createdAt: 1 }).lean();
  res.json({ data: books });
});

// GET /api/books/:id
router.get('/:id', async (req, res) => {
  const book = await Book.findOne({ _id: req.params.id, ...scope(req.user) }).lean();
  if (!book) throw new AppError(404, 'Book not found', 'BOOK_NOT_FOUND'); // 404 not 403: do not leak existence
  res.json({ data: book });
});

export default router;
