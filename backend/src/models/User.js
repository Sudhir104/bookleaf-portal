import mongoose from 'mongoose';
import { ROLES } from '../constants.js';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'Author', default: null },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
