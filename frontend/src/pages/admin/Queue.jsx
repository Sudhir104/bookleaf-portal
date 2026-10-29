import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { Empty, ErrorNote, PriorityBadge, SourceTag, StatusBadge, useDebounced } from '../../components/ui.jsx';
import { useEventStream } from '../../useEventStream.js';
import { ageHours, ageLabel, CATEGORIES, PRIORITIES, STATUSES, ticketNo } from '../../utils.js';

const DEFAULTS = { status: 'active', category: '', priority: '', assignee: '', q: '', from: '', to: '', sort: 'urgency' };
const PAGE_SIZE = 25;

function Stats({ s }) {
  if (!s) return null;
  const active = (s.byStatus.Open || 0) + (s.byStatus['In Progress'] || 0);
  const critical = s.activeByPriority.Critical || 0;
  return (
    <div className="summary">
      <div><span>Active tickets</span><strong>{active}</strong></div>
      <div className={critical ? 'danger' : ''}><span>Critical</span><strong>{critical}</strong></div>
      <div><span>Unassigned</span><strong>{s.unassignedActive}</strong></div>
      <div>
        <span>Longest waiting</span>
        <strong>{s.oldestActive ? ageLabel(s.oldestActive.createdAt) : '—'}</strong>
      </div>
    </div>
  );
}

export default function Queue() {
  const navigate = useNavigate();
  const [f, setF] = useState(DEFAULTS);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const q = useDebounced(f.q, 300);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page, limit: PAGE_SIZE });
    Object.entries({ ...f, q }).forEach(([k, v]) => { if (v && !(k === 'status' && v === 'all')) params.set(k, v); });
    try {
      const [r, s] = await Promise.all([api(`/admin/tickets?${params}`), api('/admin/tickets/stats')]);
      setRows(r.data); setMeta(r.meta); setStats(s.data); setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [f.status, f.category, f.priority, f.assignee, f.from, f.to, f.sort, q, page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEventStream(() => load()); // new tickets / AI classification / author-side changes appear live

  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  const pages = meta ? Math.max(1, Math.ceil(meta.total / PAGE_SIZE)) : 1;
  const dirty = JSON.stringify(f) !== JSON.stringify(DEFAULTS);

  return (
    <>
      <div className="page-head">
        <h1>Ticket queue</h1>
        <span className="live" title="Updates automatically">● Live</span>
      </div>
      <Stats s={stats} />
      <ErrorNote error={error} />

      <div className="filters card">
        <label>Status
          <select value={f.status} onChange={set('status')}>
            <option value="active">Active (open + in progress)</option>
            <option value="all">All</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Category
          <select value={f.category} onChange={set('category')}>
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Priority
          <select value={f.priority} onChange={set('priority')}>
            <option value="">All</option>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label>Assignee
          <select value={f.assignee} onChange={set('assignee')}>
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </label>
        <label>From<input type="date" value={f.from} onChange={set('from')} /></label>
        <label>To<input type="date" value={f.to} onChange={set('to')} /></label>
        <label>Sort
          <select value={f.sort} onChange={set('sort')}>
            <option value="urgency">Most urgent first</option>
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
        </label>
        <label className="grow">Search subject<input value={f.q} onChange={set('q')} placeholder="e.g. royalty" /></label>
        {dirty && <button className="btn btn-quiet" onClick={() => { setF(DEFAULTS); setPage(1); }}>Reset</button>}
      </div>

      {!rows && !error && <p className="muted">Loading tickets…</p>}
      {rows?.length === 0 && <Empty title="No tickets match">{dirty ? 'Try clearing a filter.' : 'New author queries will show up here as they arrive.'}</Empty>}
      {rows?.length > 0 && (
        <div className="table-wrap">
          <table className="queue">
            <thead>
              <tr><th>Priority</th><th>Ticket</th><th>Category</th><th>Status</th><th>Assigned</th><th>Waiting</th></tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const stale = t.isActive && ageHours(t.createdAt) > 48;
                return (
                  <tr key={t._id} className={`${t.priority === 'Critical' && t.isActive ? 'row-critical' : ''} ${stale ? 'row-stale' : ''}`}
                    tabIndex={0} onClick={() => navigate(`/admin/tickets/${t._id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/admin/tickets/${t._id}`)}>
                    <td><PriorityBadge priority={t.priority} /></td>
                    <td>
                      <strong>{t.subject}</strong>
                      <span className="muted small">{ticketNo(t._id)} · {t.author?.name} · {t.book?.title || 'General'}</span>
                    </td>
                    <td>{t.category || <span className="muted">Classifying…</span>} <SourceTag source={t.categorySource} /></td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>{t.assignedTo?.name || <span className="muted">Unassigned</span>}</td>
                    <td className={stale ? 'age-stale' : ''}>{t.isActive ? ageLabel(t.createdAt) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {meta && meta.total > PAGE_SIZE && (
        <div className="pager">
          <button className="btn btn-quiet" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted">Page {page} of {pages} · {meta.total} tickets</span>
          <button className="btn btn-quiet" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </>
  );
}
