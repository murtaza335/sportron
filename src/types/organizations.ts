// Organizations Phase 1 (migrations 138+, docs/organizations/PLAN.md).
import type { ModuleStatus, OrgRole, TournamentStatus } from './tournaments';
import type { Sport } from './index';

export type MyOrg = {
  id: string;
  name: string;
  short_name: string | null;
  role: OrgRole;
  suspended: boolean;
  tournament_count: number;
};

export type MySportMatch = {
  match_id: string;
  a_name: string | null;
  b_name: string | null;
  scheduled_at: string;
  court: string | null;
  status: string;
};

/** A sport (module) I was made manager of. */
export type MySport = {
  tournament_id: string;
  tournament_name: string;
  tournament_status: TournamentStatus;
  module_id: string;
  module_name: string;
  sport: Sport;
  custom_sport_name: string | null;
  status: ModuleStatus;
  entry_count: number;
  scorer_count: number;
  has_draw: boolean;
  today: MySportMatch[];
};

export type MyWork = { orgs: MyOrg[]; sports: MySport[] };

export type OrgMember = {
  profile_id: string;
  username: string;
  avatar_url: string | null;
  role: OrgRole;
  added_at: string;
};

export type OrgTournament = {
  id: string;
  name: string;
  status: TournamentStatus;
  hidden: boolean;
  starts_at: string | null;
  ends_at: string | null;
  image_url: string | null;
  module_count: number;
  entry_count: number;
  created_by_username: string | null;
};

export type OrgActivity = {
  id: number;
  actor: string;
  summary: string;
  tournament_id: string | null;
  created_at: string;
};

export type PublishCheck = { problems: string[]; warnings: string[] };

/** One sport created by the guided "new tournament" flow (`org_create_tournament_modules`). */
export type NewModulePayload = {
  name: string;
  sport: Sport;
  settings?: Record<string, unknown>;
  live_rules?: Record<string, unknown>;
};
