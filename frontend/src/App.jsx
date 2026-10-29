import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Books from './pages/author/Books.jsx';
import NewTicket from './pages/author/NewTicket.jsx';
import MyTickets from './pages/author/MyTickets.jsx';
import Queue from './pages/admin/Queue.jsx';
import TicketDetail from './pages/admin/TicketDetail.jsx';

const home = (user) => (user?.role === 'admin' ? '/admin' : '/books');

// Route guard: wrong role is sent to its own home, anonymous users to /login
function RequireRole({ role }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="center-note">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={home(user)} replace />;
  return <Layout />;
}

export default function App() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireRole role="author" />}>
        <Route path="/books" element={<Books />} />
        <Route path="/tickets" element={<MyTickets />} />
        <Route path="/tickets/new" element={<NewTicket />} />
      </Route>
      <Route element={<RequireRole role="admin" />}>
        <Route path="/admin" element={<Queue />} />
        <Route path="/admin/tickets/:id" element={<TicketDetail />} />
      </Route>
      <Route path="*" element={loading ? null : <Navigate to={user ? home(user) : '/login'} replace />} />
    </Routes>
  );
}
