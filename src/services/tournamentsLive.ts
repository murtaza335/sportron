import { supabase } from '@/lib/supabase';
import type { LiveRules, LiveSnapshot, Summary } from '@/lib/live';
import type {
  LiveBoard,
  LiveDisplay,
  LiveMatchDetail,
  LiveRow,
  LiveSettings,
  LiveTournamentChip,
} from '@/types';

/** Live match scoring RPC wrappers (migration 133). Errors carry the raw RPC message (mapped by tournamentErrors). */

function fail(error: { message: string } | null): never {
  throw new Error(error?.message ?? 'Unknown error');
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error);
  return data as T;
}

/** True when the server doesn't have migration 133 yet — callers hide all live UI (same trick as the schedule). */
export function isLiveUnavailable(err: unknown): boolean {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '');
  return msg.includes('PGRST202') || msg.includes('Could not find the function') || msg.includes('does not exist');
}

// ─── Referee ─────────────────────────────────────────────────────────────────

export async function startLive(args: {
  matchId: string;
  deviceId: string;
  takeover?: boolean;
  court?: string | null;
  rules: LiveRules;
  snapshot: LiveSnapshot;
  summary: Summary;
}): Promise<LiveRow> {
  return rpc<LiveRow>('live_start_match', {
    p_match: args.matchId,
    p_device: args.deviceId,
    p_takeover: args.takeover ?? false,
    p_court: args.court ?? null,
    p_rules: args.rules,
    p_snapshot: args.snapshot,
    p_summary: args.summary,
  });
}

/** Returns the server's `seq`. If it is lower than the `seq` sent, the write was dropped (rate limit) — resend. */
export async function pushLiveScore(args: {
  matchId: string;
  seq: number;
  snapshot: LiveSnapshot;
  summary: Summary;
}): Promise<{ seq: number; state: string }> {
  return rpc<{ seq: number; state: string }>('live_push_score', {
    p_match: args.matchId,
    p_seq: args.seq,
    p_snapshot: args.snapshot,
    p_summary: args.summary,
  });
}

export async function finishLive(args: {
  matchId: string;
  seq: number;
  snapshot: LiveSnapshot;
  summary: Summary;
  scoreA: number;
  scoreB: number;
  scoreDetail: { a: number; b: number }[] | null;
  winnerEntryId: string | null;
  note: string | null;
}): Promise<void> {
  await rpc<unknown>('live_finish_match', {
    p_match: args.matchId,
    p_seq: args.seq,
    p_snapshot: args.snapshot,
    p_summary: args.summary,
    p_score_a: args.scoreA,
    p_score_b: args.scoreB,
    p_score_detail: args.scoreDetail,
    p_winner: args.winnerEntryId,
    p_note: args.note,
  });
}

export async function abandonLive(matchId: string): Promise<void> {
  await rpc<null>('live_abandon_match', { p_match: matchId });
}

// ─── Viewers ─────────────────────────────────────────────────────────────────

export async function fetchLiveBoard(tournamentId: string): Promise<LiveBoard> {
  const b = await rpc<LiveBoard | null>('get_live_tournament_board', { p_tournament: tournamentId });
  return b ?? { active: false, server_now: new Date().toISOString(), live: [], recent: [], up_next: [] };
}

export async function fetchLiveMatch(matchId: string): Promise<LiveMatchDetail | null> {
  return rpc<LiveMatchDetail | null>('get_live_match', { p_match: matchId });
}

export async function fetchLiveTournaments(): Promise<LiveTournamentChip[]> {
  return (await rpc<LiveTournamentChip[] | null>('get_live_tournaments')) ?? [];
}

// ─── Organiser ───────────────────────────────────────────────────────────────

export async function fetchLiveSettings(tournamentId: string): Promise<LiveSettings> {
  return rpc<LiveSettings>('get_tournament_live_settings', { p_tournament: tournamentId });
}

export async function setLivePublic(tournamentId: string, on: boolean): Promise<{ live_public: boolean; live_code: string }> {
  return rpc('set_tournament_live_public', { p_tournament: tournamentId, p_on: on });
}

/** `code` null = new random code. */
export async function setLiveCode(tournamentId: string, code: string | null): Promise<string> {
  const r = await rpc<{ live_code: string }>('set_tournament_live_code', { p_tournament: tournamentId, p_code: code });
  return r.live_code;
}

export async function setLiveDisplay(tournamentId: string, patch: Partial<LiveDisplay>): Promise<LiveDisplay> {
  return rpc<LiveDisplay>('set_tournament_live_display', { p_tournament: tournamentId, p_patch: patch });
}

/** Save the module's scoring rules (the full resolved rules object incl. `family` + `preset`); null clears them (sport default). */
export async function setModuleLiveRules(moduleId: string, rules: LiveRules | null): Promise<void> {
  await rpc<unknown>('set_module_live_rules', { p_module: moduleId, p_rules: rules });
}
