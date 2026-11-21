import { useEffect, useMemo, useState } from 'react';
import { rpc, type UsageScreens as Data } from '../../lib/rpc';
import { errorText } from '../../lib/errors';
import { BarChart, HBars } from '../../components/charts';
import { useUsageRange } from './UsageLayout';

// Friendly names for the view keys written by migration 136.
const LABEL: Record<string, string> = {
  communities_list: 'Communities tab', community: 'Community page', community_feed: 'Community feed', discover: 'Discover',
  sessions_open: 'Sessions: all open', sessions_my: 'Sessions: mine', sessions_joined: 'Sessions: joined',
  sessions_accessible: 'Sessions: accessible', sessions_history: 'Sessions: history', session: 'Session detail',
  chats_hub: 'Chats tab', tournaments_list: 'Tournaments tab', tournament: 'Tournament page', module: 'Tournament module',
  tournament_today: "Today's matches", live: 'Live board', live_match: 'Live match',
};
const name = (v: string) => LABEL[v] ?? v;

export function UsageScreens() {
  const range = useUsageRange();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState('');

  useEffect(() => {
    setData(null);
    setError(null);
    rpc.usageScreens(range).then(setData).catch((e) => setError(errorText(e)));
  }, [range]);

  const daily = useMemo(() => {
    if (!data) return [];
    const m = new Map<string, number>();
    for (const r of data.daily) if (!view || r.view === view) m.set(r.day, (m.get(r.day) ?? 0) + r.hits);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, hits]) => ({ day, hits }));
  }, [data, view]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const total = data.screens.reduce((a, s) => a + s.hits, 0);
  return (
    <>
      <p className="muted small">
        A visit = the app loading that screen's data. Screens served from the app's cache are not counted. Kept for {data.retention_days} days.
      </p>
      <div className="tiles">
        <div className="tile"><span className="tile-n">{total.toLocaleString()}</span><span className="muted">Screen loads</span></div>
        <div className="tile"><span className="tile-n">{data.screens.reduce((a, s) => a + s.guest_hits, 0).toLocaleString()}</span><span className="muted">By guests (no account)</span></div>
        <div className="tile"><span className="tile-n">{data.screens.reduce((a, s) => a + s.web_hits, 0).toLocaleString()}</span><span className="muted">On web</span></div>
        <div className="tile"><span className="tile-n">{data.screens.reduce((a, s) => a + s.native_hits, 0).toLocaleString()}</span><span className="muted">In the app</span></div>
      </div>

      <h2>Most visited screens</h2>
      <div className="card"><HBars rows={data.screens.map((s) => ({ label: name(s.view), value: s.hits, sub: `${s.viewers} people` }))} /></div>

      <h2>Per day</h2>
      <div className="toolbar">
        <select value={view} onChange={(e) => setView(e.target.value)}>
          <option value="">All screens</option>
          {data.screens.map((s) => <option key={s.view} value={s.view}>{name(s.view)}</option>)}
        </select>
      </div>
      <div className="card"><BarChart data={daily} xKey="day" series={[{ key: 'hits', label: 'Loads' }]} /></div>

      <h2>Details</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Screen</th><th>Loads</th><th>People</th><th>Guests</th><th>App</th><th>Web</th></tr></thead>
          <tbody>
            {data.screens.map((s) => (
              <tr key={s.view}><td>{name(s.view)}</td><td>{s.hits}</td><td>{s.viewers}</td><td>{s.guest_hits}</td><td>{s.native_hits}</td><td>{s.web_hits}</td></tr>
            ))}
            {!data.screens.length && <tr><td colSpan={6} className="muted">No visits recorded in this range yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
