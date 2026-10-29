import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api.js';
import { Empty, ErrorNote } from '../../components/ui.jsx';
import { fmtDate, money, num } from '../../utils.js';

const isLive = (b) => b.status === 'Published & Live';

function BookCard({ b }) {
  const live = isLive(b);
  return (
    <article className="book">
      <header>
        <div>
          <h3>{b.title}</h3>
          <p className="muted">{b.genre} · ISBN {b.isbn}</p>
        </div>
        <span className={`badge ${live ? 'status-resolved' : 'status-in-progress'}`}>{b.status}</span>
      </header>

      {live ? (
        <>
          <dl className="grid">
            <div><dt>Published</dt><dd>{fmtDate(b.publicationDate)}</dd></div>
            <div><dt>MRP</dt><dd>{money(b.mrp)}</dd></div>
            <div><dt>Copies sold</dt><dd>{num(b.totalCopiesSold)}</dd></div>
            <div><dt>Royalty / copy</dt><dd>{money(b.authorRoyaltyPerCopy)}</dd></div>
          </dl>
          <dl className="grid money">
            <div><dt>Royalty earned</dt><dd>{money(b.totalRoyaltyEarned)}</dd></div>
            <div><dt>Paid</dt><dd>{money(b.royaltyPaid)}</dd></div>
            <div className={b.royaltyPending > 0 ? 'pending' : ''}><dt>Pending</dt><dd>{money(b.royaltyPending)}</dd></div>
            <div><dt>Last payout</dt><dd>{b.lastRoyaltyPayoutDate ? fmtDate(b.lastRoyaltyPayoutDate) : 'No payout yet'}</dd></div>
          </dl>
          <p className="muted small">Available on {b.availableOn.join(', ') || 'no platforms yet'}</p>
        </>
      ) : (
        <p className="inprod">
          This book is still in production ({b.status.replace('In Production - ', '')}). Sales and royalty details will appear here once it is live.
        </p>
      )}
      <footer><Link to={`/tickets/new?book=${b._id}`}>Raise a query about this book</Link></footer>
    </article>
  );
}

export default function Books() {
  const [books, setBooks] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/books').then((r) => setBooks(r.data)).catch((e) => setError(e.message));
  }, []);

  const live = (books || []).filter(isLive);
  const sum = (k) => live.reduce((s, b) => s + (b[k] || 0), 0);

  return (
    <>
      <h1>My books</h1>
      <ErrorNote error={error} />
      {!books && !error && <p className="muted">Loading your books…</p>}
      {books?.length === 0 && <Empty title="No books yet">Your books will appear here once we start working on them.</Empty>}
      {books?.length > 0 && (
        <>
          {live.length > 0 && (
            <div className="summary">
              <div><span>Total royalty earned</span><strong>{money(sum('totalRoyaltyEarned'))}</strong></div>
              <div><span>Paid out</span><strong>{money(sum('royaltyPaid'))}</strong></div>
              <div className="pending"><span>Pending</span><strong>{money(sum('royaltyPending'))}</strong></div>
            </div>
          )}
          <div className="books">{books.map((b) => <BookCard key={b._id} b={b} />)}</div>
        </>
      )}
    </>
  );
}
