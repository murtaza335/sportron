import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { rpc, type TournamentListRow, type TournamentStatus } from '../lib/rpc';
import { errorText } from '../lib/errors';
import { StatusBadge } from '../components/StatusBadge';

const PAGE = 25;
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

export function Tournaments() {
  const nav = useNavigate();
  const [status, setStatus] = useState<TournamentStatus | ''>('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<TournamentListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let live = true;
    setRows(null);
    rpc
      .listTournaments({ status: status || null, search: debounced, limit: PAGE, offset: page * PAGE })
      .then((r) => live && (setRows(r), setError(null)))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [status, debounced, page]);

  const total = rows?.[0]?.total_count ?? 0;

  return (
    <>
      <h1>Tournaments</h1>
      <div className="toolbar">
        <input placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={status} onChange={(e) => { setStatus(e.target.value as TournamentStatus | ''); setPage(0); }}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <Link to="/tournaments/new" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          New tournament
        </Link>
      </div>
      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Status</th><th>Starts</th><th>Modules</th><th>Admins</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="muted">No tournaments found.</td></tr>
              )}
              {rows.map((t) => (
                <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/tournaments/${t.id}`)}>
                  <td><Link to={`/tournaments/${t.id}`} onClick={(e) => e.stopPropagation()}>{t.name}</Link></td>
                  <td><StatusBadge status={t.status} /></td>
                  <td>{fmt(t.starts_at)}</td>
                  <td>{t.module_count}</td>
                  <td>{t.admin_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > PAGE && (
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span className="muted">
            {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total}
          </span>
          <button className="btn btn-sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </>
  );
}
