import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { rpc, type EntryFieldMode, type OrgDetail, type OrgMember, type OrgRole, type OrgSettings } from '../lib/rpc';
import { errorText } from '../lib/errors';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { StatusBadge } from '../components/StatusBadge';
import { UserPicker } from '../components/UserPicker';

const FIELDS: { key: keyof OrgSettings['entry_fields']; label: string }[] = [
  { key: 'cms_id', label: 'CMS ID' },
  { key: 'school', label: 'School' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
];

const ROLE_LABEL: Record<OrgRole, string> = { admin: 'Organization admin', organizer: 'Organizer' };

export function OrganizationDetail() {
  const { id = '' } = useParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newRole, setNewRole] = useState<OrgRole>('admin');
  const [edit, setEdit] = useState<{ name: string; short: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const o = await rpc.getOrganization(id);
      setOrg(o);
      setEdit({ name: o.name, short: o.short_name ?? '' });
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      await load();
      setBusy(false);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!org || !edit) return <p className="muted">Loading…</p>;

  const admins = org.members.filter((m) => m.role === 'admin').length;
  const suspended = org.status === 'suspended';

  async function toggleStatus() {
    const res = await confirm({
      title: suspended ? `Reactivate ${org!.name}?` : `Pause ${org!.name}?`,
      body: suspended
        ? 'Everyone gets their access back and scoring works again.'
        : 'Published tournaments stay visible, but nobody in this organization (including its scorers) can change or score anything until you reactivate it.',
      confirmLabel: suspended ? 'Reactivate' : 'Pause',
      destructive: !suspended,
      askNote: !suspended,
    });
    if (res) {
      await run(
        () => rpc.setOrganizationStatus(id, suspended ? 'active' : 'suspended', res.note),
        suspended ? 'Reactivated.' : 'Paused.',
      );
    }
  }

  async function addMember(profileId: string, username: string) {
    const res = await confirm({
      title: `Add ${username} as ${ROLE_LABEL[newRole]}?`,
      body:
        newRole === 'admin'
          ? 'Organization admins manage organizers, screens and every tournament of this organization, including players’ phone numbers and emails.'
          : 'Organizers create tournaments and manage the ones they create or are added to.',
      confirmLabel: 'Add',
    });
    if (res) await run(() => rpc.addOrgMember(id, profileId, newRole), `${username} added.`);
  }

  async function removeMember(m: OrgMember) {
    const last = m.role === 'admin' && admins === 1;
    const res = await confirm({
      title: `Remove ${m.username}?`,
      body: last
        ? 'This is the only admin. Nobody in the organization will be able to manage organizers or screens until you add another.'
        : 'Their access ends immediately. Their tournaments stay with the organization.',
      confirmLabel: 'Remove',
      destructive: true,
      askNote: true,
    });
    if (res) await run(() => rpc.removeOrgMember(id, m.profile_id, res.note), 'Removed.');
  }

  const setSettings = (settings: Partial<OrgSettings>) =>
    void run(() => rpc.updateOrganization(id, { settings }), 'Settings saved.');

  return (
    <>
      <p><Link to="/organizations">← Organizations</Link></p>
      <h1>
        {org.name} <StatusBadge status={org.status} />
      </h1>
      {suspended && (
        <p className="error">
          Paused{org.suspended_at ? ` on ${new Date(org.suspended_at).toLocaleDateString()}` : ''}
          {org.suspended_reason ? `: ${org.suspended_reason}` : ''}
        </p>
      )}

      <h2>Name</h2>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => rpc.updateOrganization(id, { name: edit.name, short_name: edit.short || null }), 'Saved.');
        }}
      >
        <div className="row">
          <label className="field">
            <span>Name</span>
            <input value={edit.name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Short name</span>
            <input value={edit.short} maxLength={20} onChange={(e) => setEdit({ ...edit, short: e.target.value })} />
          </label>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
      </form>

      <h2>People</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Organization admins can also add organizers from the app. Only you can add or remove admins.
        </p>
        <div className="row">
          <label className="field">
            <span>Role for the person you add</span>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as OrgRole)}>
              <option value="admin">Organization admin</option>
              <option value="organizer">Organizer</option>
            </select>
          </label>
          <div className="field">
            <span>Add person</span>
            <UserPicker
              excludeIds={org.members.filter((m) => m.role === newRole).map((m) => m.profile_id)}
              onPick={(p) => void addMember(p.id, p.username)}
            />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <tbody>
              {org.members.length === 0 && <tr><td className="muted">Nobody yet. Add an organization admin.</td></tr>}
              {org.members.map((m) => (
                <tr key={m.profile_id}>
                  <td>{m.username}</td>
                  <td>{ROLE_LABEL[m.role]}</td>
                  <td>{new Date(m.added_at).toLocaleDateString()}</td>
                  <td><button className="btn btn-sm" disabled={busy} onClick={() => void removeMember(m)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2>Rules for its tournaments</h2>
      <div className="card">
        <label className="field">
          <span>Discount codes</span>
          <select
            value={org.settings.promos_enabled ? 'on' : 'off'}
            disabled={busy}
            onChange={(e) => setSettings({ promos_enabled: e.target.value === 'on' })}
          >
            <option value="off">Not allowed</option>
            <option value="on">Allowed</option>
          </select>
        </label>
        <label className="field">
          <span>Sportron promo and mark on live screens</span>
          <select
            value={org.settings.brand_locked ? 'locked' : 'free'}
            disabled={busy}
            onChange={(e) => setSettings({ brand_locked: e.target.value === 'locked' })}
          >
            <option value="locked">Always on</option>
            <option value="free">Tournament admins may switch the promo off</option>
          </select>
        </label>
        <p className="muted">Sign-up fields for new tournaments (Name is always required; phone, email and CMS ID stay private):</p>
        <div className="row">
          {FIELDS.map((f) => (
            <label className="field" key={f.key}>
              <span>{f.label}</span>
              <select
                value={org.settings.entry_fields[f.key]}
                disabled={busy}
                onChange={(e) =>
                  setSettings({
                    entry_fields: { ...org.settings.entry_fields, [f.key]: e.target.value as EntryFieldMode },
                  })
                }
              >
                <option value="required">Required</option>
                <option value="optional">Optional</option>
                <option value="off">Off</option>
              </select>
            </label>
          ))}
        </div>
      </div>

      <h2>Tournaments</h2>
      <div className="table-wrap">
        <table>
          <tbody>
            {org.tournaments.length === 0 && <tr><td className="muted">No tournaments yet.</td></tr>}
            {org.tournaments.map((t) => (
              <tr key={t.id}>
                <td><Link to={`/tournaments/${t.id}`}>{t.name}</Link></td>
                <td><StatusBadge status={t.status} />{t.hidden && <span className="chip" style={{ marginLeft: 8 }}>hidden</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>{suspended ? 'Reactivate' : 'Pause'}</h2>
      <div className="card">
        <button className={`btn ${suspended ? 'btn-primary' : 'btn-danger'}`} disabled={busy} onClick={() => void toggleStatus()}>
          {suspended ? 'Reactivate organization' : 'Pause organization'}
        </button>
      </div>
    </>
  );
}
