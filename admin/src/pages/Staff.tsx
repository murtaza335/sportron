import { useCallback, useEffect, useState } from 'react';
import { rpc, type PlatformRole, type StaffRow } from '../lib/rpc';
import { errorText } from '../lib/errors';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { UserPicker } from '../components/UserPicker';

const ROLE_LABEL: Record<PlatformRole, string> = {
  super_admin: 'Super admin',
  tournament_manager: 'Tournament manager',
};

export function Staff() {
  const { session } = useAuth();
  const me = session?.user.id;
  const toast = useToast();
  const confirm = useConfirm();

  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<PlatformRole>('tournament_manager');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await rpc.listStaff());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function add(profileId: string, username: string) {
    const res = await confirm({
      title: `Add ${username} as ${ROLE_LABEL[newRole]}?`,
      body:
        newRole === 'super_admin'
          ? 'Super admins can change settings (maintenance, minimum version), delete tournaments and manage staff.'
          : 'Tournament managers can manage tournaments, their admins and details.',
      confirmLabel: 'Add',
      destructive: newRole === 'super_admin',
      askNote: false,
    });
    if (res) await run(() => rpc.grantRole(profileId, newRole), `${username} added.`);
  }

  async function changeRole(r: StaffRow, role: PlatformRole) {
    if (role === r.role) return;
    const res = await confirm({
      title: `Change ${r.username} to ${ROLE_LABEL[role]}?`,
      confirmLabel: 'Change role',
      destructive: role === 'super_admin',
    });
    if (res) await run(() => rpc.grantRole(r.profile_id, role), 'Role changed.');
    else void load(); // reset the dropdown
  }

  async function revoke(r: StaffRow) {
    const res = await confirm({
      title: `Remove ${r.username} from staff?`,
      body: 'They lose access on their very next request.',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (res) await run(() => rpc.revokeRole(r.profile_id), 'Staff access removed.');
  }

  return (
    <>
      <h1>Staff</h1>
      <p className="muted">
        You cannot change or remove your own role, so another super admin must do that. Being staff gives no
        powers inside the app.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label className="field">
            <span>Role for the person you add</span>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as PlatformRole)}>
              <option value="tournament_manager">Tournament manager</option>
              <option value="super_admin">Super admin</option>
            </select>
          </label>
          <div className="field">
            <span>Add staff</span>
            <UserPicker
              placeholder="Search username…"
              excludeIds={(rows ?? []).map((r) => r.profile_id)}
              onPick={(p) => void add(p.id, p.username)}
            />
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>User</th><th>Role</th><th>Added by</th><th>Since</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const self = r.profile_id === me;
                return (
                  <tr key={r.profile_id}>
                    <td>{r.username}{self && <span className="chip" style={{ marginLeft: 8 }}>you</span>}</td>
                    <td>
                      <select
                        value={r.role}
                        disabled={self || busy}
                        onChange={(e) => void changeRole(r, e.target.value as PlatformRole)}
                        style={{ width: 'auto' }}
                      >
                        <option value="tournament_manager">Tournament manager</option>
                        <option value="super_admin">Super admin</option>
                      </select>
                    </td>
                    <td>{r.granted_by_username ?? '—'}</td>
                    <td>{new Date(r.granted_at).toLocaleDateString()}</td>
                    <td>
                      <button className="btn btn-sm" disabled={self || busy} onClick={() => void revoke(r)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
