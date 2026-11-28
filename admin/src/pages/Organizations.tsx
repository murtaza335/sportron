import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { rpc, type OrgListRow } from '../lib/rpc';
import { errorText } from '../lib/errors';
import { useToast } from '../components/Toast';
import { StatusBadge } from '../components/StatusBadge';

export function Organizations() {
  const nav = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<OrgListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [short, setShort] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await rpc.listOrganizations());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    try {
      const id = await rpc.createOrganization(name.trim(), short.trim() || null);
      toast.success('Organization created. Now add its admins.');
      nav(`/organizations/${id}`);
    } catch (e) {
      toast.error(errorText(e));
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Organizations</h1>
      <p className="muted">
        An organization runs its own tournaments in the app. You create it and choose its admins; they do the rest.
      </p>

      <form
        className="card"
        style={{ marginBottom: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="row">
          <label className="field">
            <span>Name</span>
            <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="NUST" />
          </label>
          <label className="field">
            <span>Short name (shown on screens)</span>
            <input value={short} maxLength={20} onChange={(e) => setShort(e.target.value)} placeholder="NUST" />
          </label>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || name.trim().length < 3}>
          Create organization
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Name</th><th>Status</th><th>Admins</th><th>Organizers</th><th>Tournaments</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} className="muted">No organizations yet.</td></tr>}
              {rows.map((o) => (
                <tr key={o.id}>
                  <td><Link to={`/organizations/${o.id}`}>{o.name}</Link></td>
                  <td><StatusBadge status={o.status} /></td>
                  <td>{o.admin_count}</td>
                  <td>{o.organizer_count}</td>
                  <td>{o.tournament_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
