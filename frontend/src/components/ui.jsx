import { useEffect, useState } from 'react';

export const StatusBadge = ({ status }) => (
  <span className={`badge status-${status.replace(' ', '-').toLowerCase()}`}>{status}</span>
);

export const PriorityBadge = ({ priority }) =>
  priority ? (
    <span className={`badge prio-${priority.toLowerCase()}`}>{priority}</span>
  ) : (
    <span className="badge prio-none">Unclassified</span>
  );

const SRC = { ai: 'AI', rules: 'Rules', admin: 'Set by admin' };
export const SourceTag = ({ source }) =>
  source ? <span className="src" title="Who set this value">{SRC[source]}</span> : null;

export const Empty = ({ title, children }) => (
  <div className="empty">
    <h3>{title}</h3>
    {children && <p>{children}</p>}
  </div>
);

export const ErrorNote = ({ error, details }) =>
  error ? (
    <div className="alert alert-error" role="alert">
      {error}
      {details?.length > 0 && (
        <ul>
          {details.map((d) => (
            <li key={d.field + d.message}>{d.message}</li>
          ))}
        </ul>
      )}
    </div>
  ) : null;

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
