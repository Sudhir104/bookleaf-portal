import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import bookRoutes from './routes/books.routes.js';
import ticketRoutes from './routes/tickets.routes.js';
import adminRoutes from './routes/admin.routes.js';
import streamRoutes from './routes/stream.routes.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

export const app = express();
app.set('trust proxy', 1); // behind Render/Vercel proxies, so rate limiting sees real client IPs

app.use(helmet());
app.use(cors({ origin: env.clientOrigin.split(',') }));
app.use(express.json({ limit: '100kb' }));

const limiter = (max, windowMs = 15 * 60 * 1000) =>
  rateLimit({
    windowMs, max, standardHeaders: true, legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests, try again shortly' } }),
  });

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const spec = YAML.parse(fs.readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));

app.use('/api/auth/login', limiter(20)); // brute-force protection
app.use('/api/auth', authRoutes);
app.use('/api/books', limiter(600), bookRoutes);
app.use('/api/tickets', limiter(600), ticketRoutes);
app.use('/api/admin', limiter(1200), adminRoutes);
app.use('/api/stream', streamRoutes);

app.use(notFound);
app.use(errorHandler);
