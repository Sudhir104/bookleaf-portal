import { Router } from 'express';
import { userFromToken } from '../middleware/auth.js';
import { addClient } from '../services/events.js';

const router = Router();

// GET /api/stream?token=<jwt>
// EventSource cannot send an Authorization header, so the JWT is accepted as a query param on this one route.
router.get('/', async (req, res) => {
  const user = await userFromToken(req.query.token);

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (Render/nginx)
  });
  res.flushHeaders();
  res.write('event: ready\ndata: {}\n\n');

  const remove = addClient({ res, userId: user._id, role: user.role, authorId: user.author });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    remove();
  });
});

export default router;
