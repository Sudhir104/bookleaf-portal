import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { ErrorNote, PriorityBadge, SourceTag, StatusBadge } from '../../components/ui.jsx';
import { useEventStream } from '../../useEventStream.js';
import { CATEGORIES, PRIORITIES, STATUSES, fmtDate, fmtDateTime, money, num, ticketNo } from '../../utils.js';

const AI_NOTE = {
  failed: 'AI classification failed, so keyword rules were used. Check the category and priority, or retry.',
  skipped: 'AI is not configured, so keyword rules were used. Check the category and priority.',
};

export default function TicketDetail() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // reply composer
  const [draft, setDraft] = useState('');
  const [draftState, setDraftState] = useState('idle'); // idle | loading | ready | error
  const [draftError, setDraftError] = useState('');
  const [fromAi, setFromAi] = useState(false);
  const [replyStatus, setReplyStatus] = useState('In Progress');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const r = await api(`/admin/tickets/${id}`);
    setT(r.data);
    return r.data;
  }, [id]);

  const requestDraft = useCallback(async (regenerate = false) => {
    setDraftState('loading');
    setDraftError('');
    try {
      const r = await api(`/admin/tickets/${id}/ai/draft${regenerate ? '?regenerate=true' : ''}`, { method: 'POST' });
      setDraft(r.data.draft);
      setFromAi(true);
      setDraftState('ready');
    } catch (e) {
      setDraftError(e.message); // admin can still type a reply manually
      setDraftState('error');
    }
  }, [id]);

  // Open ticket -> load it, then show the cached AI draft or ask for one
  useEffect(() => {
    let alive = true;
    load()
      .then((data) => {
        if (!alive) return;
        if (data.aiDraft) { setDraft(data.aiDraft); setFromAi(true); setDraftState('ready'); }
        else if (data.isActive) requestDraft();
      })
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live updates refresh the ticket but never touch what the admin is typing
  useEventStream((ev) => { if (ev.type === 'ready' || ev.ticketId === id) load().catch(() => {}); });

  const run = async (fn) => {
    setError(''); setNotice('');
    try { await fn(); await load(); } catch (e) { setError(e.message); }
  };
  const patch = (body) => run(() => api(`/admin/tickets/${id}`, { method: 'PATCH', body }));

  const send = () => run(async () => {
    setSending(true);
    try {
      await api(`/admin/tickets/${id}/responses`, { method: 'POST', body: { message: draft, status: replyStatus, aiAssisted: fromAi } });
      setDraft(''); setFromAi(false); setDraftState('idle');
      setNotice('Reply sent. The author can see it now.');
    } finally { setSending(false); }
  });

  const addNote = () => run(async () => {
    await api(`/admin/tickets/${id}/notes`, { method: 'POST', body: { text: note } });
    setNote('');
  });

  const retryTriage = () => run(() => api(`/admin/tickets/${id}/ai/triage`, { method: 'POST' }));

  if (!t) return <><Link to="/admin">← Back to queue</Link><ErrorNote error={error} />{!error && <p className="muted">Loading ticket…</p>}</>;

  const bd = t.bookDetails;
  return (
    <>
      <Link to="/admin">← Back to queue</Link>
      <div className="page-head detail-head">
        <div>
          <h1>{t.subject}</h1>
          <p className="muted">{ticketNo(t._id)} · raised {fmtDateTime(t.createdAt)}</p>
        </div>
        <div className="head-right"><PriorityBadge priority={t.priority} /><StatusBadge status={t.status} /></div>
      </div>
      <ErrorNote error={error} />
      {notice && <div className="alert alert-ok" role="status">{notice}</div>}

      <div className="detail">
        <section className="col-main">
          <div className="msg msg-author">
            <span className="who-line">{t.author?.name} · {t.book?.title || 'General / Account level'}</span>
            <p>{t.description}</p>
            {t.attachmentName && <span className="muted small">Attachment: {t.attachmentName} (name only)</span>}
          </div>
          {t.responses.map((r) => (
            <div className="msg msg-admin" key={r._id}>
              <span className="who-line">{r.sentByName} · {fmtDateTime(r.createdAt)}{r.aiAssisted ? ' · AI-assisted' : ''}</span>
              <p>{r.message}</p>
            </div>
          ))}

          <div className="card composer">
            <div className="composer-head">
              <h2>Reply to author</h2>
              <div className="row">
                {draftState !== 'loading' && (
                  <button className="btn btn-quiet" onClick={() => {
                    if (!draft || fromAi || window.confirm('Replace your text with a new AI draft?')) requestDraft(draftState === 'ready');
                  }}>
                    {draftState === 'ready' ? 'Regenerate AI draft' : draftState === 'error' ? 'Retry AI draft' : 'Generate AI draft'}
                  </button>
                )}
              </div>
            </div>
            {draftState === 'loading' && <p className="muted" role="status">Drafting a reply from the knowledge base and this author&apos;s records…</p>}
            {draftState === 'error' && <div className="alert alert-warn">{draftError} You can still write the reply below.</div>}
            {draftState === 'ready' && <p className="muted small">AI draft: review and edit before sending. Check numbers against the author&apos;s record on the right.</p>}
            <textarea rows={12} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={draftState === 'loading'}
              placeholder="Write your reply…" aria-label="Reply message" />
            <div className="row between">
              <label className="inline">After sending, set status to
                <select value={replyStatus} onChange={(e) => setReplyStatus(e.target.value)}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <button className="btn btn-primary" disabled={sending || draft.trim().length < 10 || draftState === 'loading'} onClick={send}>
                {sending ? 'Sending…' : 'Send reply'}
              </button>
            </div>
          </div>
        </section>

        <aside className="col-side">
          <div className="card">
            <h2>Triage</h2>
            {AI_NOTE[t.aiStatus] && (
              <div className="alert alert-warn">
                {AI_NOTE[t.aiStatus]}
                {t.aiStatus === 'failed' && <> <button className="link" onClick={retryTriage}>Retry AI</button></>}
              </div>
            )}
            {t.aiReason && t.aiStatus === 'done' && <p className="muted small">AI note: {t.aiReason}</p>}
            <label>Status
              <select value={t.status} onChange={(e) => patch({ status: e.target.value })}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>Category <SourceTag source={t.categorySource} />
              <select value={t.category || ''} onChange={(e) => patch({ category: e.target.value })}>
                {!t.category && <option value="" disabled>Classifying…</option>}
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>Priority <SourceTag source={t.prioritySource} />
              <select value={t.priority || ''} onChange={(e) => patch({ priority: e.target.value })}>
                {!t.priority && <option value="" disabled>Classifying…</option>}
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <div className="assign">
              <span>Assigned to <strong>{t.assignedTo?.name || 'nobody'}</strong></span>
              <button className="btn btn-quiet" onClick={() => patch({ assignedTo: t.assignedTo ? null : 'me' })}>
                {t.assignedTo ? 'Unassign' : 'Assign to me'}
              </button>
            </div>
          </div>

          <div className="card">
            <h2>Author</h2>
            <p><strong>{t.author?.name}</strong><br />{t.author?.email}<br />{t.author?.phone} · {t.author?.city}</p>
            {bd && (
              <>
                <h2>Book record</h2>
                <dl className="facts">
                  <div><dt>Title</dt><dd>{bd.title}</dd></div>
                  <div><dt>Status</dt><dd>{bd.status}</dd></div>
                  <div><dt>ISBN</dt><dd>{bd.isbn}</dd></div>
                  {bd.status === 'Published & Live' && (
                    <>
                      <div><dt>Published</dt><dd>{fmtDate(bd.publicationDate)}</dd></div>
                      <div><dt>Copies sold</dt><dd>{num(bd.totalCopiesSold)}</dd></div>
                      <div><dt>Royalty earned</dt><dd>{money(bd.totalRoyaltyEarned)}</dd></div>
                      <div><dt>Paid</dt><dd>{money(bd.royaltyPaid)}</dd></div>
                      <div><dt>Pending</dt><dd>{money(bd.royaltyPending)}</dd></div>
                      <div><dt>Last payout</dt><dd>{bd.lastRoyaltyPayoutDate ? fmtDate(bd.lastRoyaltyPayoutDate) : 'None yet'}</dd></div>
                      <div><dt>Print partner</dt><dd>{bd.printPartner || '—'}</dd></div>
                      <div><dt>Listed on</dt><dd>{bd.availableOn.join(', ') || '—'}</dd></div>
                    </>
                  )}
                </dl>
              </>
            )}
          </div>

          <div className="card">
            <h2>Internal notes</h2>
            <p className="muted small">Only BookLeaf staff can see these.</p>
            {t.internalNotes.length === 0 && <p className="muted small">No notes yet.</p>}
            {t.internalNotes.map((n) => (
              <div className="note" key={n._id}>
                <span className="who-line">{n.byName} · {fmtDateTime(n.createdAt)}</span>
                <p>{n.text}</p>
              </div>
            ))}
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team…" aria-label="Internal note" />
            <button className="btn btn-quiet" disabled={!note.trim()} onClick={addNote}>Add note</button>
          </div>
        </aside>
      </div>
    </>
  );
}
