import { NavLink, Outlet, useOutletContext, useSearchParams } from 'react-router-dom';
import type { UsageRange } from '../../lib/rpc';

const day = (d: Date) => {
  // Calendar day in Pakistan time (the team's timezone, same as the database buckets).
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(d);
};
const daysAgo = (n: number) => day(new Date(Date.now() - n * 86400000));

export function useUsageRange(): UsageRange {
  return useOutletContext<UsageRange>();
}

export function RangePicker({ range, onChange }: { range: UsageRange; onChange: (r: UsageRange) => void }) {
  const presets: [string, number][] = [['7 days', 6], ['30 days', 29], ['90 days', 89]];
  const today = daysAgo(0);
  return (
    <div className="toolbar range">
      {presets.map(([label, n]) => (
        <button key={label} className={`btn btn-sm${range.from === daysAgo(n) && range.to === today ? ' btn-primary' : ''}`}
          onClick={() => onChange({ from: daysAgo(n), to: today })}>{label}</button>
      ))}
      <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && onChange({ ...range, from: e.target.value })} />
      <span className="muted">to</span>
      <input type="date" value={range.to} min={range.from} max={today} onChange={(e) => e.target.value && onChange({ ...range, to: e.target.value })} />
    </div>
  );
}

/** Shell for every /usage page: sub-navigation + one shared date range kept in the URL. */
export function UsageLayout() {
  const [params, setParams] = useSearchParams();
  const range: UsageRange = { from: params.get('from') ?? daysAgo(29), to: params.get('to') ?? daysAgo(0) };
  const set = (r: UsageRange) => setParams({ from: r.from, to: r.to }, { replace: true });
  const qs = `?from=${range.from}&to=${range.to}`;
  return (
    <>
      <h1>Usage</h1>
      <nav className="subnav">
        <NavLink to={`/usage${qs}`} end>Overview</NavLink>
        <NavLink to={`/usage/communities${qs}`}>Communities</NavLink>
        <NavLink to={`/usage/chat${qs}`}>Chat</NavLink>
        <NavLink to={`/usage/screens${qs}`}>Screens</NavLink>
        <NavLink to={`/usage/users${qs}`}>Users &amp; retention</NavLink>
        <NavLink to={`/usage/sessions${qs}`}>Sessions &amp; tournaments</NavLink>
      </nav>
      <RangePicker range={range} onChange={set} />
      <Outlet context={range} />
    </>
  );
}
