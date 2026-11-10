import { supabase } from './supabase';
import { toAdminError } from './errors';

export type PlatformRole = 'super_admin' | 'tournament_manager';
export type TournamentStatus = 'draft' | 'published' | 'completed' | 'cancelled';

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toAdminError(error);
  return data as T;
}

// ── Types ────────────────────────────────────────────────────────────────────
export interface Overview {
  role: PlatformRole;
  tournaments_draft: number;
  tournaments_published: number;
  tournaments_completed: number;
  tournaments_cancelled: number;
  maintenance_enabled: boolean;
  min_app_version: string | null;
}
export interface ProfileHit {
  id: string;
  username: string;
  avatar_url: string | null;
  platform_role: PlatformRole | null;
}
export interface StaffRow {
  profile_id: string;
  username: string;
  avatar_url: string | null;
  role: PlatformRole;
  granted_by: string | null;
  granted_by_username: string | null;
  granted_at: string;
}
export interface SiteConfigRow {
  key: 'maintenance' | 'min_app_version';
  value: Record<string, unknown>;
  updated_at: string | null;
}
export interface TournamentListRow {
  id: string;
  name: string;
  status: TournamentStatus;
  organization: string | null;
  location: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  module_count: number;
  admin_count: number;
  total_count: number;
}
export interface TournamentRow {
  id: string;
  name: string;
  description: string | null;
  organization: string | null;
  location: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: TournamentStatus;
  created_by: string | null;
  created_by_username: string | null;
  created_at: string;
  updated_at: string;
}
export interface ModuleRow {
  id: string;
  name: string;
  sport: string;
  format: string;
  status: string;
  sort_order: number;
  active_entries: number;
  champion_name: string | null;
}
export interface TournamentAdminRow {
  profile_id: string;
  username: string;
  avatar_url: string | null;
  added_at: string;
}
export interface TournamentPatch {
  name?: string;
  description?: string | null;
  organization?: string | null;
  location?: string | null;
  image_url?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
}

// ── Calls ────────────────────────────────────────────────────────────────────
export const rpc = {
  myRole: () => call<PlatformRole | null>('get_my_platform_role'),
  overview: async () => (await call<Overview[]>('admin_get_overview'))[0],
  searchProfiles: (query: string, limit = 10) =>
    call<ProfileHit[]>('admin_search_profiles', { p_query: query, p_limit: limit }),

  listStaff: () => call<StaffRow[]>('admin_list_platform_admins'),
  grantRole: (profile: string, role: PlatformRole) =>
    call<void>('admin_grant_platform_role', { p_profile: profile, p_role: role }),
  revokeRole: (profile: string) => call<void>('admin_revoke_platform_role', { p_profile: profile }),

  getSiteConfig: () => call<SiteConfigRow[]>('admin_get_site_config'),
  setMaintenance: (enabled: boolean, message: string, note?: string) =>
    call<void>('admin_set_maintenance', { p_enabled: enabled, p_message: message, p_note: note || null }),
  setMinAppVersion: (minVersion: string, storeUrl: string, message: string, note?: string) =>
    call<void>('admin_set_min_app_version', {
      p_min_version: minVersion,
      p_store_url: storeUrl,
      p_message: message,
      p_note: note || null,
    }),

  listTournaments: (args: { status?: TournamentStatus | null; search?: string; limit?: number; offset?: number }) =>
    call<TournamentListRow[]>('admin_list_tournaments', {
      p_status: args.status ?? null,
      p_search: args.search ?? null,
      p_limit: args.limit ?? 25,
      p_offset: args.offset ?? 0,
    }),
  getTournament: async (id: string) => (await call<TournamentRow[]>('admin_get_tournament', { p_tournament: id }))[0],
  listModules: (id: string) => call<ModuleRow[]>('admin_list_tournament_modules', { p_tournament: id }),
  listTournamentAdmins: (id: string) => call<TournamentAdminRow[]>('admin_list_tournament_admins', { p_tournament: id }),
  createTournament: (set: TournamentPatch, note?: string) =>
    call<string>('admin_create_tournament', { p_set: set, p_note: note || null }),
  updateTournament: (id: string, set: TournamentPatch, note?: string) =>
    call<void>('admin_update_tournament', { p_tournament: id, p_set: set, p_note: note || null }),
  setTournamentStatus: (id: string, status: TournamentStatus, note?: string) =>
    call<void>('admin_set_tournament_status', { p_tournament: id, p_status: status, p_note: note || null }),
  addTournamentAdmin: (id: string, profile: string, note?: string) =>
    call<void>('admin_add_tournament_admin', { p_tournament: id, p_profile: profile, p_note: note || null }),
  removeTournamentAdmin: (id: string, profile: string, note?: string) =>
    call<void>('admin_remove_tournament_admin', { p_tournament: id, p_profile: profile, p_note: note || null }),
  reopenModule: (moduleId: string, clearResults: boolean, note?: string) =>
    call<void>('admin_reopen_module', { p_module: moduleId, p_clear_results: clearResults, p_note: note || null }),
  deleteTournament: (id: string, confirmName: string, note?: string) =>
    call<void>('admin_delete_tournament', { p_tournament: id, p_confirm_name: confirmName, p_note: note || null }),
};
