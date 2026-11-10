import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc, type Overview as OverviewData } from '../lib/rpc';
import { errorText } from '../lib/errors';
import { useAuth } from '../auth/AuthProvider';

export function Overview() {
  const { role } = useAuth();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    rpc.overview().then(setData).catch((e) => setError(errorText(e)));
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
