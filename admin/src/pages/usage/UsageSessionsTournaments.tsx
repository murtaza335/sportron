import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc, type UsageSessionsTournaments as Data } from '../../lib/rpc';
import { errorText } from '../../lib/errors';
import { BarChart, HBars, LineChart } from '../../components/charts';
import { useUsageRange } from './UsageLayout';

export function UsageSessionsTournaments() {
  const range = useUsageRange();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    rpc.usageSessionsTournaments(range).then(setData).catch((e) => setError(errorText(e)));
  }, [range]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const created = data.sessions_by_sport.reduce((a, r) => a + r.created, 0);
  const filled = data.sessions_by_sport.reduce((a, r) => a + r.filled, 0);
  const fb = data.feedback;
  const marked = Number(fb.showed_up) + Number(fb.no_show);
  return (
    <>
      <div className="tiles">
        <div className="tile"><span className="tile-n">{created}</span><span className="muted">Sessions created</span></div>
        <div className="tile"><span className="tile-n">{created ? Math.round((filled / created) * 100) : 0}%</span><span className="muted">Filled or completed</span></div>
        <div className="tile"><span className="tile-n">{data.sessions_series.reduce((a, r) => a + Number(r.applications), 0)}</span><span className="muted">Applications</span></div>
        <div className="tile"><span className="tile-n">{marked ? Math.round((Number(fb.no_show) / marked) * 100) : 0}%</span><span className="muted">No-show rate ({marked} marked)</span></div>
      </div>

      <h2>Sessions per day</h2>
      <div className="card">
        <LineChart data={data.sessions_series} xKey="day" series={[{ key: 'created', label: 'Created' }, { key: 'applications', label: 'Applications' }]} />
      </div>

      <h2>Sessions by sport</h2>
      <div className="card">
        <HBars rows={data.sessions_by_sport.map((r) => ({ label: r.purpose, value: r.created, sub: `${r.filled} filled` }))} />
      </div>

      <h2>Tournament views per day</h2>
      <div className="card">
        <BarChart data={data.tournament_series} xKey="day" series={[{ key: 'views', label: 'Tournament screens' }, { key: 'live', label: 'Live screens' }]} />
        <p className="muted small">Screen loads (list, tournament, module, live). Needs tracking history.</p>
      </div>

      <h2>Most viewed tournaments</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Tournament</th><th>Views</th><th>People</th><th>Live views</th></tr></thead>
          <tbody>
            {data.top_tournaments.map((t) => (
              <tr key={t.id}><td className="wrap"><Link to={`/tournaments/${t.id}`}>{t.name}</Link></td><td>{t.views}</td><td>{t.viewers}</td><td>{t.live_views}</td></tr>
            ))}
            {!data.top_tournaments.length && <tr><td colSpan={4} className="muted">No tournament visits recorded in this range.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
