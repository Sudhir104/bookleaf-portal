import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

/** Verifies a JWT and returns the matching user (shared by REST + SSE). */
export async function userFromToken(token) {
  if (!token) throw new AppError(401, 'Authentication required', 'NO_TOKEN');
  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new AppError(401, 'Invalid or expired token', 'INVALID_TOKEN');
  }
  const user = await User.findById(payload.sub);
  if (!user) throw new AppError(401, 'User no longer exists', 'INVALID_TOKEN');
  return user;
}

export async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  req.user = await userFromToken(header.startsWith('Bearer ') ? header.slice(7) : null);
  next();
}

export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    throw new AppError(403, 'You do not have access to this resource', 'FORBIDDEN');
  }
  next();
};
