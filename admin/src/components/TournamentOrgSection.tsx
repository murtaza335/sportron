import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { rpc, type OrgListRow, type TournamentOrg } from '../lib/rpc';
import { errorText } from '../lib/errors';
import { useToast } from './Toast';
import { useConfirm } from './ConfirmDialog';

/** "Which organization runs this?" dropdown. Empty value = run by Sportron. */
export function OrgSelect({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const [orgs, setOrgs] = useState<OrgListRow[]>([]);
  useEffect(() => {
    rpc.listOrganizations().then(setOrgs).catch(() => setOrgs([]));
  }, []);
  return (
    <label className="field" style={{ marginBottom: 0 }}>
      <span>Organization</span>
      <select value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">None (run by Sportron)</option>
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Tournament page: attach to an organization, hide / unhide (super admin). */
export function TournamentOrgSection({ tournamentId, name }: { tournamentId: string; name: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [info, setInfo] = useState<TournamentOrg | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setInfo(await rpc.getTournamentOrg(tournamentId));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<void>, ok: string) {
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

  async function move(org: string | null) {
    const res = await confirm({
      title: org ? 'Move to this organization?' : 'Remove from the organization?',
      body: `"${name}": the organization's admins ${org ? 'will be able to manage it' : 'lose access to it'}.`,
      confirmLabel: 'Move',
      askNote: true,
    });
    if (res) await run(() => rpc.setTournamentOrg(tournamentId, org, res.note), 'Organization updated.');
  }

  async function toggleHidden() {
    const hide = !info!.hidden;
    const res = await confirm({
      title: hide ? 'Hide this tournament?' : 'Show this tournament again?',
      body: hide
        ? 'Players, guests and public screens stop seeing it. Its admins, managers and scorers still do.'
        : 'It becomes visible again according to its status.',
      confirmLabel: hide ? 'Hide' : 'Show',
      destructive: hide,
      askNote: true,
    });
    if (res) await run(() => rpc.setTournamentHidden(tournamentId, hide, res.note), hide ? 'Hidden.' : 'Visible again.');
  }

  return (
    <>
      <h2>Organization and visibility</h2>
      <div className="card">
        {error && <p className="error">{error}</p>}
        {info && (
          <>
            <OrgSelect value={info.organization_id} disabled={busy} onChange={(v) => void move(v)} />
            {info.organization_id && (
              <p>
                <Link to={`/organizations/${info.organization_id}`}>Open {info.organization_name}</Link>
              </p>
            )}
            <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
              <span>{info.hidden ? 'Hidden from players and screens.' : 'Not hidden.'}</span>
              <button className="btn" disabled={busy} onClick={() => void toggleHidden()}>
                {info.hidden ? 'Show again' : 'Hide'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
