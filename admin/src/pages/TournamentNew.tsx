import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rpc } from '../lib/rpc';
import { errorText } from '../lib/errors';
import { useToast } from '../components/Toast';
import { EMPTY_FORM, TournamentForm, toPatch } from '../components/TournamentForm';

export function TournamentNew() {
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  return (
    <>
      <h1>New tournament</h1>
      <p className="muted">It starts as a draft (visible only to its admins). Publish it from its page when ready.</p>
      <TournamentForm
        initial={EMPTY_FORM}
        submitLabel="Create draft"
        busy={busy}
        onSubmit={async (v) => {
          setBusy(true);
          try {
            const id = await rpc.createTournament(toPatch(v));
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
