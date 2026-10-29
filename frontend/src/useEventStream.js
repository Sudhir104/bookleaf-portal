import { useEffect, useRef } from 'react';
import { apiBase, getToken } from './api';

/**
 * Subscribes to the server's SSE stream. `onEvent` receives { type, ticketId } for changes
 * and { type: 'ready' } on every (re)connect, so pages can refetch and never miss updates.
 * EventSource reconnects by itself if the connection drops.
 */
export function useEventStream(onEvent) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    const token = getToken();
    if (!token) return undefined;
    const es = new EventSource(`${apiBase}/stream?token=${encodeURIComponent(token)}`);
    es.addEventListener('ready', () => handler.current({ type: 'ready' }));
    es.addEventListener('ticket', (e) => handler.current(JSON.parse(e.data)));
    return () => es.close();
  }, []);
}
