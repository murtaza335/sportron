import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc, type UsageCommunityRow } from '../../lib/rpc';
import { errorText } from '../../lib/errors';
import { useUsageRange } from './UsageLayout';

type SortKey = 'score' | 'views' | 'messages' | 'posts' | 'matches' | 'members' | 'last_activity' | 'name';
const COLS: [SortKey, string][] = [
  ['members', 'Members'], ['views', 'Views'], ['messages', 'Messages'], ['posts', 'Posts'], ['matches', 'Matches'],
];

function trend(cur: number, prev: number) {
  if (cur === 0 && prev === 0) return <span className="muted">–</span>;
  if (prev === 0) return <span className="trend-up">new ▲</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return <span className="muted">0%</span>;
  return <span className={pct > 0 ? 'trend-up' : 'trend-down'}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%</span>;
}

export function UsageCommunities() {
  const range = useUsageRange();
  const [rows, setRows] = useState<UsageCommunityRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sport, setSport] = useState('');
  const [sort, setSort] = useState<SortKey>('score');
  const [onlyDead, setOnlyDead] = useState(false);

  useEffect(() => {
    setRows(null);
    setError(null);
    rpc.usageCommunities(range).then(setRows).catch((e) => setError(errorText(e)));
  }, [range]);

  const sports = useMemo(() => [...new Set((rows ?? []).map((r) => r.sport).filter(Boolean) as string[])].sort(), [rows]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (rows ?? []).filter((r) =>
      (!q || r.name.toLowerCase().includes(q)) && (!sport || r.sport === sport) && (!onlyDead || r.dead));
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'last_activity') return (b.last_activity ?? '').localeCompare(a.last_activity ?? '');
      return (b[sort] as number) - (a[sort] as number) || a.name.localeCompare(b.name);
    });
  }, [rows, search, sport, sort, onlyDead]);

  if (error) return <p className="error">{error}</p>;
  if (!rows) return <p className="muted">Loading…</p>;
  const qs = `?from=${range.from}&to=${range.to}`;
  const th = (k: SortKey, label: string) => (
    <th><button className="linklike" onClick={() => setSort(k)}>{label}{sort === k ? ' ↓' : ''}</button></th>
  );

  return (
    <>
      <div className="toolbar">
        <input placeholder="Search communities…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={sport} onChange={(e) => setSport(e.target.value)}>
          <option value="">All sports</option>
          {sports.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={onlyDead} onChange={(e) => setOnlyDead(e.target.checked)} /> Inactive 14+ days</label>
        <span className="muted small">{shown.length} of {rows.length}</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {th('name', 'Community')}
              {COLS.map(([k, l]) => th(k, l))}
              <th>Unique viewers</th>
              {th('score', 'Activity score')}
              <th>vs previous</th>
              {th('last_activity', 'Last activity')}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="wrap">
                  <Link to={`/usage/communities/${r.id}${qs}`}>{r.name}</Link>{' '}
                  <span className="muted small">{r.sport}</span>
                  {r.dead && <> <span className="badge badge-dead">inactive</span></>}
                </td>
                <td>{r.members}</td><td>{r.views}</td><td>{r.messages}</td><td>{r.posts}</td><td>{r.matches}</td>
                <td title="Sum of each day's distinct viewers">{r.viewer_days}</td>
                <td><strong>{r.score}</strong></td>
                <td>{trend(r.score, r.prev_score)}</td>
                <td>{r.last_activity ?? <span className="muted">never</span>}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={10} className="muted">No communities match.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Score = views + 2×messages + 3×posts + 3×matches + reactions + pings + 2×joins. "vs previous" compares with the same-length period before.
        Views need tracking to have been on; chat, posts and matches are exact from their records.
      </p>
    </>
  );
}
