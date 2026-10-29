import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { api } from '../../api.js';
import { Empty, ErrorNote, StatusBadge } from '../../components/ui.jsx';
import { useEventStream } from '../../useEventStream.js';
import { fmtDateTime, ticketNo, STATUSES } from '../../utils.js';

const HINT = {
  Open: 'We have received your query and it is in the queue.',
  'In Progress': 'Our team is working on this.',
  Resolved: 'We believe this is resolved. Raise a new query if something is still wrong.',
  Closed: 'This ticket is closed.',
};

function Ticket({ t, fresh, onSeen }) {
  const [open, setOpen] = useState(fresh || t.status === 'Open' || t.status === 'In Progress');
  const show = open || fresh;
  return (
    <article className={`ticket ${fresh ? 'ticket-fresh' : ''}`}>
      <button className="ticket-head" aria-expanded={show} onClick={() => { setOpen(!show); onSeen(t._id); }}>
        <div>
          <strong>{t.subject}</strong>
          <span className="muted small">{ticketNo(t._id)} · {t.book ? t.book.title : 'General / Account level'} · {fmtDateTime(t.createdAt)}</span>
        </div>
        <div className="head-right">
          {fresh && <span className="badge new">New reply</span>}
          <StatusBadge status={t.status} />
        </div>
      </button>
      {show && (
        <div className="ticket-body">
          <p className="muted small">{HINT[t.status]}</p>
          <div className="msg msg-author">
            <span className="who-line">You · {fmtDateTime(t.createdAt)}</span>
            <p>{t.description}</p>
            {t.attachmentName && <span className="muted small">Attachment: {t.attachmentName}</span>}
          </div>
          {t.responses.length === 0 && <p className="muted small">No reply yet. Most queries get a first response within 48 hours.</p>}
          {t.responses.map((r) => (
            <div className="msg msg-admin" key={r._id}>
              <span className="who-line">{r.sentByName || 'BookLeaf Support'} · {fmtDateTime(r.createdAt)}</span>
              <p>{r.message}</p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export default function MyTickets() {
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [fresh, setFresh] = useState(() => new Set());
  const known = useRef(null); // ticketId -> reply count, to detect new replies

  const load = useCallback(async () => {
    try {
      const r = await api('/tickets');
      if (known.current) {
        const added = r.data.filter((t) => t.responses.length > (known.current[t._id] ?? t.responses.length));
        if (added.length) setFresh((s) => new Set([...s, ...added.map((t) => t._id)]));
      }
      known.current = Object.fromEntries(r.data.map((t) => [t._id, t.responses.length]));
      setTickets(r.data);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEventStream(() => load()); // refetch on any event and on every (re)connect

  const seen = (id) => setFresh((s) => { const n = new Set(s); n.delete(id); return n; });
  const list = (tickets || []).filter((t) => filter === 'All' || t.status === filter);

  return (
    <>
      <div className="page-head">
        <h1>My tickets</h1>
        <span className="live" title="Replies appear automatically">● Live</span>
        <Link className="btn btn-primary" to="/tickets/new">Raise a query</Link>
      </div>
      <ErrorNote error={error} />
      <div className="chips" role="tablist" aria-label="Filter by status">
        {['All', ...STATUSES].map((s) => (
          <button key={s} className={`chip ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>{s}</button>
        ))}
      </div>
      {!tickets && !error && <p className="muted">Loading your tickets…</p>}
      {tickets?.length === 0 && (
        <Empty title="You have not raised any queries">
          Questions about royalties, ISBNs, printing or your book&apos;s status? <Link to="/tickets/new">Raise your first query</Link>.
        </Empty>
      )}
      {tickets?.length > 0 && list.length === 0 && <p className="muted">No tickets with status “{filter}”.</p>}
      <div className="tickets">
        {list.map((t) => <Ticket key={t._id} t={t} fresh={fresh.has(t._id)} onSeen={seen} />)}
      </div>
    </>
  );
}
