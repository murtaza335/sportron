import type { Family, LiveRules, LiveSnapshot, Summary } from './types';

// Live match scoring (migration 133, docs/live-match/PLAN.md). Shapes of the jsonb documents the live RPCs return.

/** Server-side state of a live row. `finished` rows are kept as the match's detailed record. */
export type LiveRowState = 'live' | 'break' | 'finished' | 'abandoned';

export interface LiveSideField {
  label: string;
  value: string;
}

export interface LiveSide {
  id: string;
  name: string;
  /** App reads only; the projector never gets it. */
  profile_id?: string | null;
  /** Extra public fields (School, …). On the projector only what the organiser switched on. */
  fields: LiveSideField[];
}

/** One match on a board: identity + (when live / finished) its live part. */
export interface LiveMatch {
  match_id: string;
  module_id: string;
  module_name?: string;
  sport: string;
  custom_sport_name: string | null;
  scoring_mode: 'games' | 'score';
  stage_number: number;
  bracket_side: string | null;
  round_number: number;
  match_number: number;
  round_name: string | null;
  code: string | null;
  status: string;
  scheduled_at: string | null;
  venue: string | null;
  court?: string | null;
  a: LiveSide | null;
  b: LiveSide | null;
  // live part
  state?: LiveRowState;
  family?: Family;
  summary?: Summary;
  snapshot?: LiveSnapshot;
  seq?: number;
  updated_at?: string;
  started_at?: string;
  finished_at?: string | null;
}

export type LiveLayout = 'auto' | 'row' | 'grid';

/** Projector display settings (tournaments.live_display) with defaults applied. */
export interface LiveDisplay {
  show_school: boolean;
  show_fields: string[];
  show_module: boolean;
  show_court: boolean;
  show_up_next: boolean;
  show_recent: boolean;
  show_app_promo: boolean;
  title: string | null;
  courts: string[];
  layout: LiveLayout;
  max_per_page: number;
  final_hold_seconds: number;
}

export interface LiveBoard {
  /** false = unknown code / projector off / tournament not published (projector only). */
  active: boolean;
  server_now: string;
  tournament?: { id: string; name: string; location: string | null; live_code: string | null; status: string };
  display?: LiveDisplay;
  app_link?: string;
  live: LiveMatch[];
  recent: LiveMatch[];
  up_next: LiveMatch[];
}

export interface LiveMatchDetail extends LiveMatch {
  tournament_id: string;
  live_code: string | null;
  rules: LiveRules;
  scorer_id: string | null;
  server_now: string;
}

/** The raw `tournament_live_scores` row (returned by live_start_match). */
export interface LiveRow {
  match_id: string;
  module_id: string;
  tournament_id: string;
  state: LiveRowState;
  family: Family;
  rules: LiveRules;
  snapshot: LiveSnapshot;
  summary: Summary;
  seq: number;
  scorer_id: string | null;
  scorer_device: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface LiveTournamentChip {
  id: string;
  name: string;
  cover_url: string | null;
  live_count: number;
}

export interface LiveSettings {
  live_public: boolean;
  live_code: string;
  live_display: LiveDisplay;
  base_url: string;
}

/** Payload broadcast on `live:<code>` (event `score`). */
export interface LiveScoreEvent {
  match_id: string;
  seq?: number;
  state?: LiveRowState;
  summary?: Summary;
  snapshot?: LiveSnapshot;
  updated_at?: string;
  removed?: boolean;
}
