import { useState } from 'react';

import { toast } from '@/components/motion/Toast';
import { invalidateCached } from '@/hooks/useCachedLoad';
import { alert } from '@/lib/alert';
import { haptics } from '@/lib/haptics';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { assignScreen, ScreenBusyError } from '@/services/organizations';
import { setLivePublic } from '@/services/tournamentsLive';

/**
 * "Show this tournament on that screen", with the two follow-up questions the server can raise:
 * a busy screen ("Replace?") and a tournament whose public viewing is off.
 */
export function useAssignScreen(onDone: () => Promise<void> | void) {
  const [busy, setBusy] = useState<string | null>(null);

  const assign = async (screen: { id: string; name: string }, tournament: { id: string; name: string }, replace = false) => {
    setBusy(screen.id);
    try {
      await assignScreen(screen.id, tournament.id, replace);
      haptics.success();
      toast('Screen updated', `${screen.name} now shows ${tournament.name}.`);
      invalidateCached('org-screens:');
      await onDone();
    } catch (e) {
      if (e instanceof ScreenBusyError) {
        const who = e.info.assigned_by ? ` (set by @${e.info.assigned_by})` : '';
        alert(`Replace on ${screen.name}?`, `It is showing “${e.info.tournament}”${who}.`, [
          { text: 'Keep it', style: 'cancel' },
          { text: 'Replace', style: 'destructive', onPress: () => void assign(screen, tournament, true) },
        ]);
      } else if (e instanceof Error && e.message.includes('LIVE_NOT_PUBLIC')) {
        alert('Allow public viewing?', 'Scores of this tournament must be viewable without signing in to appear on a screen.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Allow and show',
            onPress: async () => {
              try {
                await setLivePublic(tournament.id, true);
                await assign(screen, tournament, replace);
              } catch (err) {
                alert('Something went wrong', friendlyTournamentError(err));
              }
            },
          },
        ]);
      } else {
        haptics.error();
        alert('Couldn’t update the screen', friendlyTournamentError(e));
      }
    } finally {
      setBusy(null);
    }
  };

  return { assign, busy };
}
