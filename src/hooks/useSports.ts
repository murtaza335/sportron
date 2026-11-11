import { useMemo } from 'react';

import { useRemoteConfig } from '@/contexts/RemoteConfigContext';
import { SPORT_LABELS, type ScoringMode, type Sport } from '@/types';

/** One entry of the remote `sports` config (migration 127 / roadmap B4). */
export type SportEntry = {
  key: string;
  label: string;
  emoji?: string;
  kind: 'racket' | 'team';
  tier: 'primary' | 'more';
  participant_type?: 'individual' | 'team';
  roster_min?: number;
  roster_max?: number;
  lineup_size?: number | null;
  scoring_mode?: ScoringMode;
  allow_draws?: boolean;
  unit_label?: string;
  enabled_for?: ('tournaments' | 'communities')[];
};

/** Bundled fallback = today's sports, so the app never has fewer sports than before. */
const BUNDLED: SportEntry[] = (Object.keys(SPORT_LABELS) as Sport[])
  .filter((s) => s !== 'other')
  .map((s) => ({
    key: s,
    label: SPORT_LABELS[s],
    kind: ['table_tennis', 'badminton', 'tennis', 'squash', 'pickleball'].includes(s) ? ('racket' as const) : ('team' as const),
    tier: 'primary' as const,
  }));

function isEntry(e: unknown): e is SportEntry {
  const x = e as Partial<SportEntry> | null;
  return !!x && typeof x.key === 'string' && typeof x.label === 'string' && (x.tier === 'primary' || x.tier === 'more');
}

/**
 * Sports the app offers: remote list when valid, bundled otherwise. `more` is the extra tier shown behind the
 * "More" pill in the tournament module form. Remote entries never replace the built-in primary sports (old
 * builds and every known-sport rule depend on them), they can only add to the list.
 */
export function useSports(scope: 'tournaments' | 'communities' = 'tournaments') {
  const remote = useRemoteConfig<unknown>('sports', null);
  return useMemo(() => {
    const list = Array.isArray(remote) ? (remote.filter(isEntry) as SportEntry[]) : [];
    const more = list
      .filter((s) => s.tier === 'more' && !(s.key in SPORT_LABELS) && (!s.enabled_for || s.enabled_for.includes(scope)))
      .sort((a, b) => a.label.localeCompare(b.label));
    const byKey = new Map<string, SportEntry>([...BUNDLED, ...more].map((s) => [s.key, s]));
    return { primary: BUNDLED, more, byKey };
  }, [remote, scope]);
}
