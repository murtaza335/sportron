import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc, type UsageOverview as Data, type UsageStatus } from '../../lib/rpc';
import { errorText } from '../../lib/errors';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import { BarChart, Heatmap, HBars, LineChart } from '../../components/charts';
import { useUsageRange } from './UsageLayout';

const n = (v: number) => Number(v).toLocaleString();

export function UsageOverview() {
  const range = useUsageRange();
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState<UsageStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    rpc.usageOverview(range).then(setData).catch((e) => setError(errorText(e)));
    rpc.usageStatus().then(setStatus).catch(() => undefined);
  }, [range]);
  useEffect(load, [load]);

  async function toggle() {
    if (!status) return;
    const next = !status.enabled;
    const ok = await confirm({
      title: next ? 'Turn usage tracking on?' : 'Turn usage tracking off?',
      body: next ? 'Screen visits and activity are recorded again.' : 'Nothing new is recorded until you turn it back on. Existing numbers stay.',
      confirmLabel: next ? 'Turn on' : 'Turn off',
      destructive: !next,
    });
    if (!ok) return;
    setBusy(true);
    try { await rpc.usageSetTracking(next); toast.success(next ? 'Tracking is on' : 'Tracking is off'); load(); }
    catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }

  async function backfill() {
    const from = status?.first_day ?? range.from;
    const ok = await confirm({
      title: 'Rebuild history?',
      body: `Recomputes daily and chat numbers from ${range.from} using the existing messages, posts, matches and sessions. Screen visits and active users only exist from the day tracking started.`,
      confirmLabel: 'Rebuild',
    });
    if (!ok) return;
    setBusy(true);
    try { const days = await rpc.usageBackfill(range.from < from ? range.from : from); toast.success(`Rebuilt ${days} days`); load(); }
    catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const t = data.tiles;
  const plat = Object.entries(data.platforms);
  return (
    <>
      {!data.tracking_enabled && <div className="banner banner-warn">Usage tracking is <strong>OFF</strong>. Nothing new is being recorded.</div>}
      <div className="tiles">
        <div className="tile"><span className="tile-n">{n(t.dau)}</span><span className="muted">Active today</span></div>
        <div className="tile"><span className="tile-n">{n(t.online_now)}</span><span className="muted">Online now (15 min)</span></div>
        <div className="tile"><span className="tile-n">{n(t.wau)}</span><span className="muted">Active 7 days</span></div>
        <div className="tile"><span className="tile-n">{n(t.mau)}</span><span className="muted">Active 30 days</span></div>
        <div className="tile"><span className="tile-n">{t.mau ? Math.round((t.dau / t.mau) * 100) : 0}%</span><span className="muted">Stickiness (today ÷ 30 d)</span></div>
        <div className="tile"><span className="tile-n">{n(t.new_users_7d)}</span><span className="muted">New users, 7 days</span></div>
        <div className="tile"><span className="tile-n">{n(t.total_users)}</span><span className="muted">Total users</span></div>
      </div>

      <h2>Daily active and new users</h2>
      <div className="card">
        <LineChart data={data.series} xKey="day" series={[{ key: 'dau', label: 'Active users' }, { key: 'new_users', label: 'New users' }]} />
      </div>

      <h2>Activity per day</h2>
      <div className="card">
        <BarChart data={data.series} xKey="day" series={[
          { key: 'messages', label: 'Chat messages' }, { key: 'posts', label: 'Posts' }, { key: 'matches', label: 'Matches' }]} />
      </div>

      <div className="grid2">
        <div>
          <h2>When people are active</h2>
          <div className="card"><Heatmap cells={data.heatmap} unit="users" />
            <p className="muted small">Pakistan time. Darker = more distinct users active in that hour of the week.</p></div>
        </div>
        <div>
          <h2>Platform</h2>
          <div className="card">
            <HBars rows={plat.map(([k, v]) => ({ label: k, value: Number(v), sub: 'users' }))} />
            <p className="muted small">People can appear on more than one platform.</p>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div>
          <h2>Top communities</h2>
          <div className="card">
            <HBars rows={data.top_communities.map((c) => ({ label: c.name, value: c.score, sub: 'pts' }))} />
            <p className="small"><Link to={`/usage/communities?from=${range.from}&to=${range.to}`}>All communities →</Link></p>
          </div>
        </div>
        <div>
          <h2>Busiest chats</h2>
          <div className="card">
            <HBars rows={data.top_chats.map((c) => ({ label: `${c.type === 'community' ? '💬' : '🏓'} ${c.name}`, value: c.messages, sub: 'msgs' }))} />
            <p className="small"><Link to={`/usage/chat?from=${range.from}&to=${range.to}`}>Chat details →</Link></p>
          </div>
        </div>
      </div>

      <h2>Tracking</h2>
      <div className="card">
        {status && (
          <p className="muted small">
            Status: <strong>{status.enabled ? 'on' : 'off'}</strong> · last screen visit recorded {status.last_view_hour ? new Date(status.last_view_hour).toLocaleString() : 'never'} ·
            history since {status.first_day ?? 'n/a'} · timezone {status.timezone}
          </p>
        )}
        <div className="row-btns">
          <button className="btn" disabled={busy || !status} onClick={toggle}>{status?.enabled ? 'Turn tracking off' : 'Turn tracking on'}</button>
          <button className="btn" disabled={busy} onClick={backfill}>Rebuild history from {range.from}</button>
        </div>
      </div>
    </>
  );
}
