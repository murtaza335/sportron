import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  rpc,
  type ModuleRow,
  type TournamentAdminRow,
  type TournamentRow,
  type TournamentStatus,
} from '../lib/rpc';
import { errorText } from '../lib/errors';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { StatusBadge } from '../components/StatusBadge';
import { UserPicker } from '../components/UserPicker';
import { TournamentForm, isoToLocalInput, toPatch } from '../components/TournamentForm';

const STATUS_ACTIONS: { to: TournamentStatus; label: string; hint: string }[] = [
  { to: 'published', label: 'Publish', hint: 'Visible to everyone in the app.' },
  { to: 'completed', label: 'Mark completed', hint: 'Read-only in the app; champions are shown.' },
  { to: 'cancelled', label: 'Cancel', hint: 'Read-only in the app with a "Cancelled" banner.' },
  { to: 'draft', label: 'Back to draft', hint: 'Hidden again from everyone except its admins.' },
];

export function TournamentDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { role } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const isSuper = role === 'super_admin';

  const [t, setT] = useState<TournamentRow | null>(null);
  const [admins, setAdmins] = useState<TournamentAdminRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tt, aa, mm] = await Promise.all([rpc.getTournament(id), rpc.listTournamentAdmins(id), rpc.listModules(id)]);
      setT(tt);
      setAdmins(aa);
      setModules(mm);
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Runs an action with shared busy/toast/reload handling.
  async function run(fn: () => Promise<void>, ok: string, reload = true) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      if (reload) await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!t) return <p className="muted">Loading…</p>;

  async function changeStatus(to: TournamentStatus, label: string, hint: string) {
    const res = await confirm({
      title: `${label}?`,
      body: `"${t!.name}": ${hint}`,
      confirmLabel: label,
      destructive: to === 'cancelled',
      askNote: true,
    });
    if (res) await run(() => rpc.setTournamentStatus(id, to, res.note), `Status is now ${to}.`);
  }

  async function removeAdmin(a: TournamentAdminRow) {
    const res = await confirm({
      title: `Remove ${a.username}?`,
      body: 'They lose tournament admin powers in the app.',
      confirmLabel: 'Remove',
      destructive: true,
      askNote: true,
    });
    if (res) await run(() => rpc.removeTournamentAdmin(id, a.profile_id, res.note), 'Admin removed.');
  }

  async function reopen(m: ModuleRow) {
    const res = await confirm({
      title: `Reopen "${m.name}"?`,
      body: (
        <>
          The module goes back to <strong>in progress</strong> so admins can fix a result in the app. Final ranks and
          champion are cleared so they are recomputed when the final is decided again.
        </>
      ),
      confirmLabel: 'Reopen and clear results',
      destructive: true,
      askNote: true,
    });
    if (res) await run(() => rpc.reopenModule(m.id, true, res.note), 'Module reopened.');
  }

  async function del() {
    const res = await confirm({
      title: 'Delete this tournament?',
      body: 'This permanently deletes the tournament with all its modules, entries and matches. It cannot be undone.',
      confirmLabel: 'Delete forever',
      destructive: true,
      typeToConfirm: t!.name,
      askNote: true,
    });
    if (!res) return;
    setBusy(true);
    try {
      await rpc.deleteTournament(id, t!.name, res.note);
      toast.success('Tournament deleted.');
      nav('/tournaments', { replace: true });
    } catch (e) {
      toast.error(errorText(e));
      setBusy(false);
    }
  }

  return (
    <>
      <p><Link to="/tournaments">← Tournaments</Link></p>
      <h1>
        {t.name} <StatusBadge status={t.status} />
      </h1>
      <p className="muted">
        Created {new Date(t.created_at).toLocaleDateString()}
        {t.created_by_username ? ` by ${t.created_by_username}` : ''}
      </p>

      <h2>Details</h2>
      <TournamentForm
        key={t.updated_at}
        submitLabel="Save details"
        busy={busy}
        initial={{
          name: t.name,
          description: t.description ?? '',
          organization: t.organization ?? '',
          location: t.location ?? '',
          image_url: t.image_url ?? '',
          starts_at: isoToLocalInput(t.starts_at),
          ends_at: isoToLocalInput(t.ends_at),
        }}
        onSubmit={(v) => void run(() => rpc.updateTournament(id, toPatch(v)), 'Details saved.')}
      />

      <h2>Status</h2>
      <div className="card">
        <div className="toolbar" style={{ marginBottom: 0 }}>
          {STATUS_ACTIONS.filter((a) => a.to !== t.status).map((a) => (
            <button key={a.to} className="btn" disabled={busy} onClick={() => void changeStatus(a.to, a.label, a.hint)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <h2>Admins</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Tournament admins can edit the entry form, create modules and assign module admins in the app.
        </p>
        <UserPicker
          placeholder="Add admin: search username…"
          excludeIds={admins.map((a) => a.profile_id)}
          onPick={(p) => void run(() => rpc.addTournamentAdmin(id, p.id), `${p.username} added.`)}
        />
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <tbody>
              {admins.length === 0 && <tr><td className="muted">No admins yet.</td></tr>}
              {admins.map((a) => (
                <tr key={a.profile_id}>
                  <td>{a.username}</td>
                  <td>{new Date(a.added_at).toLocaleDateString()}</td>
                  <td><button className="btn btn-sm" disabled={busy} onClick={() => void removeAdmin(a)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2>Modules</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Name</th><th>Sport</th><th>Format</th><th>Status</th><th>Entries</th><th>Champion</th>{isSuper && <th />}</tr>
          </thead>
          <tbody>
            {modules.length === 0 && <tr><td colSpan={7} className="muted">No modules yet. Admins create them in the app.</td></tr>}
            {modules.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{m.sport.replace('_', ' ')}</td>
                <td>{m.format.replace(/_/g, ' ')}</td>
                <td><StatusBadge status={m.status} /></td>
                <td>{m.active_entries}</td>
                <td>{m.champion_name ?? '—'}</td>
                {isSuper && (
                  <td>
                    {m.status === 'completed' && (
                      <button className="btn btn-sm" disabled={busy} onClick={() => void reopen(m)}>Reopen</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isSuper && (
        <>
          <h2>Danger zone</h2>
          <div className="danger-zone">
            <p style={{ marginTop: 0 }}>Deleting a tournament is irreversible. The audit log keeps a copy of the row.</p>
            <button className="btn btn-danger" disabled={busy} onClick={() => void del()}>
              Delete tournament
            </button>
          </div>
        </>
      )}
    </>
  );
}
