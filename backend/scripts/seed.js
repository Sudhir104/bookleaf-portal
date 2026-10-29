import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Author } from '../src/models/Author.js';
import { Book } from '../src/models/Book.js';
import { Ticket } from '../src/models/Ticket.js';
import { fallbackClassify } from '../src/services/ai/fallbackClassifier.js';

const AUTHOR_PASSWORD = 'Author@123';
const ADMIN = { email: 'admin@bookleaf.com', password: 'Admin@123', name: 'BookLeaf Admin' };

const data = JSON.parse(fs.readFileSync(new URL('../data/bookleaf_sample_data.json', import.meta.url), 'utf8'));
const toDate = (s) => (s ? new Date(s) : null);
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

await connectDB();
await Promise.all([User.deleteMany(), Author.deleteMany(), Book.deleteMany(), Ticket.deleteMany()]);

const authorHash = await bcrypt.hash(AUTHOR_PASSWORD, 10);
const byBookId = {};
const byAuthorId = {};

for (const a of data.authors) {
  const author = await Author.create({
    authorId: a.author_id, name: a.name, email: a.email, phone: a.phone, city: a.city, joinedDate: toDate(a.joined_date),
  });
  byAuthorId[a.author_id] = author;
  await User.create({ email: a.email, name: a.name, passwordHash: authorHash, role: 'author', author: author._id });

  const books = await Book.insertMany(
    a.books.map((b) => ({
      bookId: b.book_id, author: author._id, title: b.title, isbn: b.isbn, genre: b.genre,
      publicationDate: toDate(b.publication_date), status: b.status, mrp: b.mrp,
      authorRoyaltyPerCopy: b.author_royalty_per_copy, totalCopiesSold: b.total_copies_sold,
      totalRoyaltyEarned: b.total_royalty_earned, royaltyPaid: b.royalty_paid, royaltyPending: b.royalty_pending,
      lastRoyaltyPayoutDate: toDate(b.last_royalty_payout_date), printPartner: b.print_partner, availableOn: b.available_on,
    }))
  );
  books.forEach((b) => (byBookId[b.bookId] = b));
}

const admin = await User.create({
  email: ADMIN.email, name: ADMIN.name, role: 'admin', passwordHash: await bcrypt.hash(ADMIN.password, 10),
});

// Demo tickets so the admin queue is not empty on first login. Classified with the
// keyword rules (source "rules"), exactly like the AI-down fallback path.
const demo = [
  { a: 'AUTH003', b: 'BK005', age: 9, subject: 'No royalty received since publication', description: 'My book Between Two Temples was published in July 2024 and I have still not received any royalty payment. It has been months. Please tell me what is going on.' },
  { a: 'AUTH001', b: 'BK001', age: 5, subject: 'Different ISBN on Amazon and my physical copy', description: 'The ISBN printed on my physical copy of Whispers of the Ganges does not match the ISBN shown on the Amazon India listing. Please check urgently.', status: 'In Progress', assign: true, note: 'Escalated to production team on call. Waiting on ISBN registry check.' },
  { a: 'AUTH010', b: 'BK017', age: 3, subject: 'Terrible print quality on author copies', description: 'I received my author copies of Durga\u2019s Daughters and the print quality is terrible. Images are blurry and pages are misaligned.' },
  { a: 'AUTH002', b: 'BK004', age: 2, subject: 'Startup Sutra shows Currently Unavailable on Amazon US', description: 'My book is published but it is showing as Currently Unavailable on Amazon US since yesterday. Sales are being lost.' },
  { a: 'AUTH009', b: 'BK015', age: 1, subject: 'When will Raising Roots be done?', description: 'It has been three weeks and my book Raising Roots is still in typesetting. Can you tell me the status and when it will be done?' },
  { a: 'AUTH005', b: 'BK009', age: 12, subject: 'Can I update my book description on Amazon?', description: 'My book is already live. Can I update the description on Amazon after publication, and how long will it take to reflect?', status: 'Resolved', reply: 'Dear Meera,\n\nYes, you can. Please submit the updated description through your dashboard or email it to our team. Changes usually reflect on the platforms within 3-5 business days.\n\nNext step: send us the new text and we will confirm once it is submitted.\n\nWarm regards,\nBookLeaf Author Support Team' },
];

for (const d of demo) {
  const cls = fallbackClassify(d.subject, d.description);
  const t = await Ticket.create({
    author: byAuthorId[d.a]._id, book: byBookId[d.b]._id, subject: d.subject, description: d.description,
    status: d.status || 'Open', category: cls.category, categorySource: 'rules', priority: cls.priority, prioritySource: 'rules',
    aiReason: cls.reason, aiStatus: 'skipped', assignedTo: d.assign || d.reply ? admin._id : null,
    internalNotes: d.note ? [{ text: d.note, by: admin._id, byName: admin.name }] : [],
    responses: d.reply ? [{ message: d.reply, sentBy: admin._id, sentByName: admin.name, aiAssisted: false }] : [],
  });
  await Ticket.updateOne({ _id: t._id }, { $set: { createdAt: daysAgo(d.age) } }, { timestamps: false });
}

console.log(`Seeded ${data.authors.length} authors, ${Object.keys(byBookId).length} books, ${demo.length} demo tickets.`);
console.log(`Author login: <author email> / ${AUTHOR_PASSWORD}   Admin login: ${ADMIN.email} / ${ADMIN.password}`);
await mongoose.disconnect();
