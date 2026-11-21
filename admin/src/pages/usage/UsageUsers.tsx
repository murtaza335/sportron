import { useEffect, useState } from 'react';
import { rpc, type UsageRetention as Data } from '../../lib/rpc';
import { errorText } from '../../lib/errors';
import { HBars } from '../../components/charts';
import { useUsageRange } from './UsageLayout';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export function UsageUsers() {
  const range = useUsageRange();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    rpc.usageRetention(range).then(setData).catch((e) => setError(errorText(e)));
  }, [range]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const f = data.funnel;
  const p = data.push;
  const s = data.streaks;
  const maxWeeks = Math.max(1, ...data.cohorts.map((c) => c.active.length));
  return (
    <>
      <h2 style={{ marginTop: 0 }}>Sign-up funnel</h2>
      <div className="card">
        <p className="muted small">People who signed up between {data.range.from} and {data.range.to}.</p>
        <HBars rows={[
          { label: 'Signed up', value: f.signed_up },
          { label: 'Joined a community', value: f.joined_community, sub: `${pct(f.joined_community, f.signed_up)}%` },
          { label: 'Did something (chat, post, match, session)', value: f.did_action, sub: `${pct(f.did_action, f.signed_up)}%` },
          { label: 'Came back on a later day', value: f.came_back, sub: `${pct(f.came_back, f.signed_up)}%` },
        ]} />
        <p className="muted small">"Came back" needs tracking history, so it is only accurate for people who signed up after tracking began.</p>
      </div>

      <h2>Weekly retention</h2>
      <div className="card" style={{ overflowX: 'auto' }}>
        {data.cohorts.length ? (
          <table className="cohort">
            <thead>
              <tr><th>Signed up (week of)</th><th>Users</th>{Array.from({ length: maxWeeks }, (_, k) => <th key={k}>{k === 0 ? 'Week 0' : `+${k}`}</th>)}</tr>
            </thead>
            <tbody>
              {data.cohorts.map((c) => (
                <tr key={c.week}>
                  <td>{c.week}</td><td>{c.size}</td>
                  {Array.from({ length: maxWeeks }, (_, k) => {
                    const v = c.active[k];
                    if (v === undefined) return <td key={k} />;
                    const share = pct(v, c.size);
                    return <td key={k} title={`${v} of ${c.size} users`}
                      style={{ background: `color-mix(in srgb, var(--chart-1) ${Math.max(6, share)}%, transparent)` }}>{share}%</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">No sign-ups in the last 8 weeks.</p>}
        <p className="muted small">Share of each sign-up week's users who were active in week N afterwards. Active-user history starts the day tracking began and is kept 90 days.</p>
      </div>

      <div className="grid2">
        <div>
          <h2>Push reach</h2>
          <div className="card">
            <HBars rows={[
              { label: 'Users', value: p.users },
              { label: 'Can receive push (token saved)', value: p.with_token, sub: `${pct(p.with_token, p.users)}%` },
            ]} />
            <p style={{ margin: '12px 0 0' }}>
              Notifications in range: <strong>{Number(p.notifications).toLocaleString()}</strong>, read: <strong>{pct(p.notifications_read, p.notifications)}%</strong>
            </p>
          </div>
        </div>
        <div>
          <h2>Streaks and activity</h2>
          <div className="card">
            <HBars rows={[
              { label: 'Streak ≥ 1 day', value: s.ge_1 }, { label: 'Streak ≥ 3 days', value: s.ge_3 },
              { label: 'Streak ≥ 7 days', value: s.ge_7 }, { label: 'Streak ≥ 30 days', value: s.ge_30 },
            ]} />
            <p style={{ margin: '12px 0 0' }}>
              Typical active user was active on <strong>{Number(data.per_user.median_active_days).toFixed(0)}</strong> days in range
              ({Number(data.per_user.users).toLocaleString()} active users).
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
