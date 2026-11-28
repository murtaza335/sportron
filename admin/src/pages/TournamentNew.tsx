import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rpc } from '../lib/rpc';
import { errorText } from '../lib/errors';
import { useToast } from '../components/Toast';
import { useAuth } from '../auth/AuthProvider';
import { OrgSelect } from '../components/TournamentOrgSection';
import { EMPTY_FORM, TournamentForm, toPatch } from '../components/TournamentForm';

export function TournamentNew() {
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [org, setOrg] = useState<string | null>(null);
  const isSuper = useAuth().role === 'super_admin';

  return (
    <>
      <h1>New tournament</h1>
      <p className="muted">It starts as a draft (visible only to its admins). Publish it from its page when ready.</p>
      {isSuper && (
        <div className="card" style={{ marginBottom: 16 }}>
          <OrgSelect value={org} onChange={setOrg} />
        </div>
      )}
      <TournamentForm
        initial={EMPTY_FORM}
        submitLabel="Create draft"
        busy={busy}
        onSubmit={async (v) => {
          setBusy(true);
          try {
            const id = await rpc.createTournament({ ...toPatch(v), ...(org ? { organization_id: org } : {}) });
            toast.success('Tournament created.');
            nav(`/tournaments/${id}`, { replace: true });
          } catch (e) {
            toast.error(errorText(e));
            setBusy(false);
          }
        }}
      />
    </>
  );
}
