import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';

const AUTHOR_NAV = [
  { to: '/books', label: 'My books' },
  { to: '/tickets/new', label: 'Raise a query' },
  { to: '/tickets', label: 'My tickets', end: true },
];
const ADMIN_NAV = [{ to: '/admin', label: 'Ticket queue', end: false }];

const AI_LABEL = { online: 'AI online', degraded: 'AI paused (retrying)', disabled: 'AI off: manual mode' };

// Admin-only: shows whether AI drafting is available, so staff know why a draft may be missing
function AiStatus() {
  const [state, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => api('/admin/ai/status').then((r) => alive && setState(r.data.state)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!state) return null;
  return <span className={`ai-pill ai-${state}`}>{AI_LABEL[state]}</span>;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const nav = user.role === 'admin' ? ADMIN_NAV : AUTHOR_NAV;

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">B</span>
          <div>
            <strong>BookLeaf</strong>
            <small>{user.role === 'admin' ? 'Operations desk' : 'Author support'}</small>
          </div>
        </div>
        <nav aria-label="Main">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end ?? true}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="side-foot">
          {user.role === 'admin' && <AiStatus />}
          <div className="who">
            <span>{user.name}</span>
            <small>{user.email}</small>
          </div>
          <button className="btn btn-quiet" onClick={() => { logout(); navigate('/login'); }}>Sign out</button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}
