import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ErrorNote } from '../components/ui.jsx';

const DEMO = {
  author: { email: 'priya.sharma@email.com', password: 'Author@123' },
  admin: { email: 'admin@bookleaf.com', password: 'Admin@123' },
};

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/books'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(form.email.trim(), form.password);
      navigate(u.role === 'admin' ? '/admin' : '/books', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">B</span>
          <div><strong>BookLeaf</strong><small>Author Support &amp; Communication Portal</small></div>
        </div>
        <h1>Sign in</h1>
        <form onSubmit={submit}>
          <label>Email
            <input type="email" required autoComplete="username" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>Password
            <input type="password" required autoComplete="current-password" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <ErrorNote error={error} />
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <div className="demo">
          <p>Demo accounts</p>
          <div className="row">
            <button type="button" className="btn btn-quiet" onClick={() => setForm(DEMO.author)}>Fill author login</button>
            <button type="button" className="btn btn-quiet" onClick={() => setForm(DEMO.admin)}>Fill admin login</button>
          </div>
        </div>
      </div>
    </div>
  );
}
