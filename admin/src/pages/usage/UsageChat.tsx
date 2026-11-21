import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc, type UsageChat as Data } from '../../lib/rpc';
import { errorText } from '../../lib/errors';
import { BarChart, LineChart } from '../../components/charts';
import { useUsageRange } from './UsageLayout';

export function UsageChat() {
  const range = useUsageRange();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    rpc.usageChat(range).then(setData).catch((e) => setError(errorText(e)));
  }, [range]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const t = data.totals;
  const days = Math.max(1, data.series.length);
  const replyRate = t.messages ? Math.round((t.replies / t.messages) * 100) : 0;
  const tiles: [string, string][] = [
    ['Messages', Number(t.messages).toLocaleString()],
    ['Per day (avg)', (Number(t.messages) / days).toFixed(1)],
    ['Community chat', Number(t.community).toLocaleString()],
    ['Session chat', Number(t.session).toLocaleString()],
    ['Chats with messages', Number(t.active_chats).toLocaleString()],
    ['Avg msgs per chat', t.active_chats ? (Number(t.messages) / Number(t.active_chats)).toFixed(1) : '0'],
    ['Replies', `${replyRate}%`],
    ['Edited', Number(data.edited).toLocaleString()],
  ];
  return (
    <>
      <div className="tiles">
        {tiles.map(([l, v]) => <div key={l} className="tile"><span className="tile-n">{v}</span><span className="muted">{l}</span></div>)}
      </div>

      <h2>Messages per day</h2>
      <div className="card">
        <BarChart data={data.series} xKey="day" series={[{ key: 'community', label: 'Community chats' }, { key: 'session', label: 'Session chats' }]} />
      </div>

      <h2>People chatting per day</h2>
      <div className="card"><LineChart data={data.series} xKey="day" series={[{ key: 'chatters', label: 'Unique chatters' }]} /></div>

      <h2>When people chat</h2>
      <div className="card">
        <BarChart data={data.hours} xKey="hour" xLabel={(h) => `${h}`} series={[{ key: 'messages', label: 'Messages' }]} />
        <p className="muted small">Hour of day, Pakistan time, all chats in the range.</p>
      </div>

      <h2>Busiest chats</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Chat</th><th>Type</th><th>Messages</th><th>Replies</th><th>Most people in one hour</th></tr></thead>
          <tbody>
            {data.busiest.map((c) => (
              <tr key={`${c.type}-${c.id}`}>
                <td className="wrap">{c.type === 'community'
                  ? <Link to={`/usage/communities/${c.id}?from=${range.from}&to=${range.to}`}>{c.name}</Link> : c.name}</td>
                <td>{c.type}</td><td>{c.messages}</td><td>{c.replies}</td><td>{c.peak_senders}</td>
              </tr>
            ))}
            {!data.busiest.length && <tr><td colSpan={5} className="muted">No chat messages in this range.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted small">Counts only. Message text is never shown here; content review happens through Reports. Deleted messages cannot be counted.</p>
    </>
  );
}
