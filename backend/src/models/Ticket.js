import mongoose from 'mongoose';
import { STATUSES, PRIORITIES, PRIORITY_RANK, CATEGORIES, ACTIVE_STATUSES } from '../constants.js';

const { Schema } = mongoose;

const responseSchema = new Schema({
  message: { type: String, required: true },
  sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
  sentByName: String,
  aiAssisted: { type: Boolean, default: false }, // reply started from the AI draft
  createdAt: { type: Date, default: Date.now },
});

const noteSchema = new Schema({
  text: { type: String, required: true },
  by: { type: Schema.Types.ObjectId, ref: 'User' },
  byName: String,
  createdAt: { type: Date, default: Date.now },
});

const ticketSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'Author', required: true, index: true },
    book: { type: Schema.Types.ObjectId, ref: 'Book', default: null }, // null = General / Account Level
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    attachmentName: { type: String, default: null }, // UI-only attachment: name kept, file not uploaded

    status: { type: String, enum: STATUSES, default: 'Open', index: true },

    // Classification + priority. `*Source` records who set the value last
    // (ai | rules = keyword fallback when AI is down | admin = manual override).
    category: { type: String, enum: [...CATEGORIES, null], default: null },
    categorySource: { type: String, enum: ['ai', 'rules', 'admin', null], default: null },
    priority: { type: String, enum: [...PRIORITIES, null], default: null },
    prioritySource: { type: String, enum: ['ai', 'rules', 'admin', null], default: null },
    aiReason: { type: String, default: null }, // one-line justification from the model
    aiStatus: { type: String, enum: ['pending', 'done', 'failed', 'skipped'], default: 'pending' },
    aiError: { type: String, default: null },
    aiDraft: { type: String, default: null }, // cached draft, generated lazily when an admin opens the ticket
    aiDraftCategory: { type: String, default: null }, // category the draft was written for (stale if category changes)

    // Denormalised for fast, correct urgency sorting in the admin queue
    priorityRank: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },

    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    internalNotes: [noteSchema], // never exposed to authors
    responses: [responseSchema],
  },
  { timestamps: true }
);

ticketSchema.pre('validate', function () {
  this.priorityRank = PRIORITY_RANK[this.priority] || 0;
  this.isActive = ACTIVE_STATUSES.includes(this.status);
});

ticketSchema.index({ isActive: -1, priorityRank: -1, createdAt: 1 });

export const Ticket = mongoose.model('Ticket', ticketSchema);
