import { useEffect, useState } from 'react';

import { ThemedText } from '@/components/ui/Text';
import { fetchMatchScorer } from '@/services/tournaments';
import type { MatchScorer } from '@/types';

/** Managers: "Scored by @x" under a match. Silent when unknown or the server is not updated yet. */
export function MatchScorerLine({ matchId, decided }: { matchId: string; decided: boolean }) {
  const [info, setInfo] = useState<(MatchScorer & { matchId: string }) | null>(null);
  useEffect(() => {
    let alive = true;
    fetchMatchScorer(matchId)
      .then((r) => alive && setInfo({ ...r, matchId }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [matchId]);
  if (!info || info.matchId !== matchId) return null;
  const text = info.scoring_now
    ? `@${info.scoring_now} is scoring now`
    : decided && info.recorded_by
      ? `Scored by @${info.recorded_by}`
      : null;
  return text ? (
    <ThemedText variant="caption" muted>
      {text}
    </ThemedText>
  ) : null;
}
