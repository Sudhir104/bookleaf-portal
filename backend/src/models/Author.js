import mongoose from 'mongoose';

const authorSchema = new mongoose.Schema(
  {
    authorId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: String,
    city: String,
    joinedDate: Date,
  },
  { timestamps: true }
);

export const Author = mongoose.model('Author', authorSchema);
