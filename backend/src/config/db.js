import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';

// Some networks block SRV lookups; use public DNS for Atlas (mongodb+srv) addresses
dns.setServers(['8.8.8.8', '1.1.1.1']);

export async function connectDB() {
  await mongoose.connect(env.mongoUri);
  console.log('MongoDB connected');
}