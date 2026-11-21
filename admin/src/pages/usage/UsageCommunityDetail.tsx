import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { rpc, type UsageCommunityDetail as Data } from '../../lib/rpc';
import { errorText } from '../../lib/errors';
import { BarChart, HBars, LineChart } from '../../components/charts';
import { useUsageRange } from './UsageLayout';

export function UsageCommunityDetail() {
  const { id = '' } = useParams();
  const range = useUsageRange();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    rpc.usageCommunity(id, range).then(setData).catch((e) => setError(errorText(e)));
  }, [id, range]);

  const back = <p><Link to={`/usage/communities?from=${range.from}&to=${range.to}`}>← All communities</Link></p>;
  if (error) return <>{back}<p className="error">{error === 'NOT_FOUND' ? 'Community not found.' : error}</p></>;
  if (!data) return <>{back}<p className="muted">Loading…</p></>;
  const c = data.community;
  const sum = (k: keyof Data['series'][number]) => data.series.reduce((a, r) => a + Number(r[k]), 0);
  const tiles: [string, number][] = [
    ['Members', c.members], ['Views', sum('views')], ['Messages', sum('messages')], ['Posts', sum('posts')],
    ['Matches', sum('matches')], ['Joins', sum('joins')],
  ];
  return (
    <>
      {back}
      <h2 style={{ marginTop: 0 }}>{c.name} <span className="muted small">{c.sport} · {c.visibility} · created {c.created_at.slice(0, 10)}</span></h2>
      <div className="tiles">
        {tiles.map(([l, v]) => <div key={l} className="tile"><span className="tile-n">{v.toLocaleString()}</span><span className="muted">{l}</span></div>)}
      </div>

      <h2>Views and chat</h2>
      <div className="card">
        <LineChart data={data.series} xKey="day" series={[
          { key: 'views', label: 'Views' }, { key: 'viewers', label: 'Unique viewers' }, { key: 'messages', label: 'Messages' }, { key: 'chatters', label: 'Chatters' }]} />
      </div>

      <h2>Posts, matches and reactions</h2>
      <div className="card">
        <BarChart data={data.series} xKey="day" series={[
          { key: 'posts', label: 'Posts' }, { key: 'matches', label: 'Matches' }, { key: 'reactions', label: 'Reactions' }, { key: 'joins', label: 'Joins' }]} />
      </div>

      <div className="grid2">
        <div>
          <h2>Chat by hour of day</h2>
          <div className="card"><BarChart data={data.chat_hours} xKey="hour" xLabel={(h) => `${h}`} series={[{ key: 'messages', label: 'Messages' }]} />
            <p className="muted small">Pakistan time.</p></div>
        </div>
        <div>
          <h2>Most active chatters</h2>
          <div className="card"><HBars rows={data.top_chatters.map((t) => ({ label: t.username, value: t.messages, sub: 'msgs' }))} />
            <p className="muted small">Message counts only, never content.</p></div>
        </div>
      </div>
    </>
  );
}
