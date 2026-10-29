import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api.js';
import { ErrorNote } from '../../components/ui.jsx';

const MAX = 5000;

export default function NewTicket() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [books, setBooks] = useState([]);
  const [form, setForm] = useState({ bookId: params.get('book') || '', subject: '', description: '' });
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [details, setDetails] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/books').then((r) => setBooks(r.data)).catch((e) => setError(e.message));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDetails([]);
    try {
      await api('/tickets', {
        method: 'POST',
        body: { bookId: form.bookId || null, subject: form.subject, description: form.description, attachmentName: fileName || null },
      });
      navigate('/tickets');
    } catch (err) {
      setError(err.message);
      setDetails(err.details || []);
      setBusy(false);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <h1>Raise a query</h1>
      <p className="muted lead">Tell us what is going on. Our team replies here, and you will see it without refreshing.</p>
      <form className="card form" onSubmit={submit}>
        <label>Which book is this about?
          <select value={form.bookId} onChange={set('bookId')}>
            <option value="">General / Account level</option>
            {books.map((b) => <option key={b._id} value={b._id}>{b.title}</option>)}
          </select>
        </label>
        <label>Subject
          <input value={form.subject} onChange={set('subject')} maxLength={150} required placeholder="e.g. Royalty for Q2 has not arrived" />
        </label>
        <label>Describe the issue
          <textarea rows={7} value={form.description} onChange={set('description')} maxLength={MAX} required
            placeholder="Include dates, platforms and any amounts you were expecting." />
          <small className="muted">{form.description.length}/{MAX}</small>
        </label>
        <label>Attachment (optional)
          <input type="file" onChange={(e) => setFileName(e.target.files?.[0]?.name || '')} />
          <small className="muted">File upload is coming soon. For now only the file name is attached; we will ask for the file in our reply if we need it.</small>
        </label>
        <ErrorNote error={error} details={details} />
        <div className="row">
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Submit query'}</button>
          <button type="button" className="btn btn-quiet" onClick={() => navigate('/tickets')}>Cancel</button>
        </div>
      </form>
    </>
  );
}
