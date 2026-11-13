import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc, type Overview as OverviewData, type ReportStats } from '../lib/rpc';
import { errorText } from '../lib/errors';
import { useAuth } from '../auth/AuthProvider';

export function Overview() {
  const { role } = useAuth();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<ReportStats | null>(null);

  useEffect(() => {
    rpc.overview().then(setData).catch((e) => setError(errorText(e)));
    // Super admins also see the moderation queue size (non-fatal if it fails).
    rpc.reportStats().then(setReports).catch(() => undefined);
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const tiles: [string, number][] = [
    ['Draft', data.tournaments_draft],
    ['Published', data.tournaments_published],
    ['Completed', data.tournaments_completed],
    ['Cancelled', data.tournaments_cancelled],
  ];

  return (
    <>
      <h1>Overview</h1>
      {data.maintenance_enabled && (
        <div className="banner banner-warn">
          Maintenance mode is <strong>ON</strong>: app users see the maintenance screen.{' '}
          {role === 'super_admin' && <Link to="/settings">Change</Link>}
        </div>
      )}
      {reports && (
        <>
          <h2>Reports</h2>
          <div className="tiles">
            <Link to="/reports" className="tile">
              <span className="tile-n">{Number(reports.open_count)}</span>
              <span className="muted">Open reports</span>
            </Link>
            <Link to="/reports" className="tile">
              <span className="tile-n">{Number(reports.opened_last_24h)}</span>
              <span className="muted">New in 24 h</span>
            </Link>
          </div>
          {reports.oldest_open && (
            <p className="muted">Oldest open report: {new Date(reports.oldest_open).toLocaleString()}</p>
          )}
        </>
      )}
      <h2>Tournaments</h2>
      <div className="tiles">
        {tiles.map(([label, n]) => (
          <Link key={label} to="/tournaments" className="tile">
            <span className="tile-n">{n}</span>
            <span className="muted">{label}</span>
          </Link>
        ))}
      </div>
      <h2>App</h2>
      <p>
        Minimum app version: <strong>{data.min_app_version ?? 'not set'}</strong> · Maintenance:{' '}
        <strong>{data.maintenance_enabled ? 'on' : 'off'}</strong>
      </p>
    </>
  );
}
