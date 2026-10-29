// Server-Sent Events hub. Payloads carry only ids/types (never ticket content),
// clients refetch through the normal authorised REST API.
const clients = new Set(); // { res, userId, role, authorId }

export function addClient(client) {
  clients.add(client);
  return () => clients.delete(client);
}

/** Admins receive every event; an author only receives events for their own tickets. */
export function publish(event, ticket) {
  const payload = `event: ticket\ndata: ${JSON.stringify({ ...event, ticketId: String(ticket._id) })}\n\n`;
  for (const c of clients) {
    if (c.role === 'admin' || String(c.authorId) === String(ticket.author?._id || ticket.author)) {
      c.res.write(payload);
    }
  }
}
