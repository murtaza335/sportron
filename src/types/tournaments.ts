import type { Profile, Sport } from './index';

export type TournamentStatus = 'draft' | 'published' | 'completed' | 'cancelled';
export type ModuleStatus = 'draft' | 'open' | 'seeding' | 'in_progress' | 'completed' | 'cancelled';
export type TournamentRole = 'tournament_admin' | 'module_admin' | 'entrant' | null;
export type EntryFieldType = 'text' | 'email' | 'phone' | 'number' | 'select';
export type TournamentMatchStatus =
  | 'pending'
  | 'scheduled'
  | 'completed'
  | 'walkover'
  | 'bye'
  | 'cancelled';
export type TournamentScope = 'live' | 'upcoming' | 'past' | 'mine' | 'all';
export type SeedingMethod = 'manual' | 'random';
export type StandingStatus = 'champion' | 'alive' | 'eliminated' | 'withdrawn';

export type ProfileLite = Pick<Profile, 'id' | 'username' | 'avatar_url'>;

export type Tournament = {
  id: string;
  name: string;
  description: string | null;
  organization: string | null;
  location: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: TournamentStatus;
  community_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TournamentListItem = Tournament & {
  module_count: number;
  sports: Sport[];
  live_module_count: number;
  my_role: TournamentRole;
};

export type TournamentEntryField = {
  id: string;
  tournament_id: string;
  key: string;
  label: string;
  field_type: EntryFieldType;
  options: string[] | null;
  placeholder: string | null;
  is_required: boolean;
  is_public: boolean;
  is_core: boolean;
  sort_order: number;
  archived_at: string | null;
};

export type TournamentModule = {
  id: string;
  tournament_id: string;
  name: string;
  sport: Sport;
  description: string | null;
  rules_text: string | null;
  venue: string | null;
  starts_at: string | null;
  format: 'single_elimination';
  status: ModuleStatus;
  third_place_match: boolean;
  seeding_method: SeedingMethod;
  max_entries: number | null;
  bracket_generated_at: string | null;
  champion_entry_id: string | null;
  runner_up_entry_id: string | null;
  third_place_entry_id: string | null;
  sort_order: number;
};

export type TournamentRound = {
  id: string;
  module_id: string;
  round_number: number;
  is_third_place: boolean;
  name: string;
  best_of: 1 | 3 | 5 | 7;
  rules_text: string | null;
  scheduled_start: string | null;
};

export type TournamentEntry = {
  id: string;
  name: string;
  seed: number | null;
  status: 'active' | 'withdrawn';
  eliminated_round: number | null;
  final_rank: number | null;
  profile: ProfileLite | null;
  fields: Record<string, string>;
};

export type BracketEntryRef = {
  id: string;
  name: string;
  seed: number | null;
  profile_id: string | null;
};

export type ScoreDetailRow = { a: number; b: number };

export type TournamentMatch = {
  id: string;
  module_id: string;
  round_id: string;
  round_number: number;
  match_number: number;
  is_third_place: boolean;
  entry_a: BracketEntryRef | null;
  entry_b: BracketEntryRef | null;
  next_match_id: string | null;
  next_slot: 'a' | 'b' | null;
  status: TournamentMatchStatus;
  scheduled_at: string | null;
  venue: string | null;
  court: string | null;
  score_a: number | null;
  score_b: number | null;
  score_detail: ScoreDetailRow[] | null;
  winner_entry_id: string | null;
  result_note: string | null;
  completed_at: string | null;
  round_name: string;
  best_of: number;
};

export type TournamentStanding = {
  rank: number;
  rank_label: string;
  entry_id: string;
  name: string;
  seed: number | null;
  profile_id: string | null;
  played: number;
  won: number;
  lost: number;
  score_for: number;
  score_against: number;
  score_diff: number;
  reached_round: number | null;
  reached_label: string | null;
  status: StandingStatus;
  eliminated_by: string | null;
};

export type ChampionRef = { id: string; name: string };

export type TournamentChampion = {
  module_id: string;
  module_name: string;
  sport: Sport;
  champion: ChampionRef | null;
  runner_up: ChampionRef | null;
  third: ChampionRef | null;
};

export type TournamentModuleSummary = {
  id: string;
  name: string;
  sport: Sport;
  status: ModuleStatus;
  entry_count: number;
  starts_at: string | null;
  venue: string | null;
  sort_order: number;
  current_round_name: string | null;
  my_role: TournamentRole;
};

export type TournamentDetail = {
  tournament: Tournament;
  admins: ProfileLite[];
  my_role: TournamentRole;
  champions: TournamentChampion[];
  modules: TournamentModuleSummary[];
};

export type ModuleDetail = {
  module: TournamentModule;
  tournament: { id: string; name: string; status: TournamentStatus };
  rounds: TournamentRound[];
  admins: ProfileLite[];
  my_role: TournamentRole;
  counts: { entries: number; withdrawn: number; matches: number; matches_decided: number };
};

export type ModuleFormInput = {
  name: string;
  sport: Sport;
  description: string | null;
  rules_text: string | null;
  venue: string | null;
  starts_at: string | null;
  max_entries: number | null;
  third_place_match: boolean;
  seeding_method: SeedingMethod;
};

export type EntryFieldInput = {
  id: string | null;
  key: string;
  label: string;
  field_type: EntryFieldType;
  options: string[] | null;
  placeholder: string | null;
  is_required: boolean;
  is_public: boolean;
  sort_order: number | null;
};
