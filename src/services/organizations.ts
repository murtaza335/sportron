import { supabase } from '@/lib/supabase';
import type {
  MyWork,
  NewModulePayload,
  OrgActivity,
  OrgMember,
  OrgScreen,
  OrgTournament,
  PublishCheck,
  ScreenBusyInfo,
} from '@/types';

/** Errors keep the RPC's raw code; lib/tournamentErrors turns it into plain words. */
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message ?? 'Unknown error');
  return data as T;
}

export async function fetchMyWork(dayStart: Date): Promise<MyWork> {
  const r = await rpc<MyWork | null>('get_my_work', { p_day_start: dayStart.toISOString() });
  return { orgs: r?.orgs ?? [], sports: r?.sports ?? [] };
}

// ─── People ──────────────────────────────────────────────────────────────────

export async function fetchOrgMembers(orgId: string): Promise<OrgMember[]> {
  return (await rpc<OrgMember[] | null>('org_list_members', { p_org: orgId })) ?? [];
}

export async function addOrganizer(orgId: string, profileId: string): Promise<void> {
  await rpc<null>('org_add_organizer', { p_org: orgId, p_profile: profileId });
}

export async function removeOrganizer(orgId: string, profileId: string): Promise<void> {
  await rpc<null>('org_remove_member', { p_org: orgId, p_profile: profileId });
}

export async function fetchOrgActivity(orgId: string, before: number | null = null): Promise<OrgActivity[]> {
  return (await rpc<OrgActivity[] | null>('org_get_activity', { p_org: orgId, p_before: before, p_limit: 50 })) ?? [];
}

// ─── Tournaments ─────────────────────────────────────────────────────────────

export async function fetchOrgTournaments(orgId: string): Promise<OrgTournament[]> {
  return (await rpc<OrgTournament[] | null>('org_list_tournaments', { p_org: orgId })) ?? [];
}

export async function createOrgTournament(
  orgId: string,
  set: {
    name: string;
    location: string | null;
    image_url: string | null;
    starts_at: string | null;
    ends_at: string | null;
  },
): Promise<string> {
  return rpc<string>('org_create_tournament', { p_org: orgId, p_set: set });
}

export async function createOrgModules(tournamentId: string, modules: NewModulePayload[]): Promise<string[]> {
  return rpc<string[]>('org_create_tournament_modules', { p_tournament: tournamentId, p_modules: modules });
}

export async function fetchPublishCheck(tournamentId: string): Promise<PublishCheck> {
  const r = await rpc<PublishCheck | null>('get_publish_check', { p_tournament: tournamentId });
  return { problems: r?.problems ?? [], warnings: r?.warnings ?? [] };
}

export async function publishTournament(tournamentId: string): Promise<void> {
  await rpc<null>('publish_tournament', { p_tournament: tournamentId });
}

export async function cancelTournament(tournamentId: string, reason: string | null): Promise<void> {
  await rpc<null>('cancel_tournament', { p_tournament: tournamentId, p_reason: reason });
}

export async function deleteDraftTournament(tournamentId: string, confirmName: string): Promise<void> {
  await rpc<null>('delete_draft_tournament', { p_tournament: tournamentId, p_confirm_name: confirmName });
}

export async function setTournamentHidden(tournamentId: string, hidden: boolean): Promise<void> {
  await rpc<null>('set_tournament_hidden', { p_tournament: tournamentId, p_hidden: hidden });
}

export async function addCoOrganizer(tournamentId: string, profileId: string): Promise<void> {
  await rpc<null>('add_tournament_admin', { p_tournament: tournamentId, p_profile: profileId });
}

export async function removeCoOrganizer(tournamentId: string, profileId: string): Promise<void> {
  await rpc<null>('remove_tournament_admin', { p_tournament: tournamentId, p_profile: profileId });
}

export async function reopenModule(moduleId: string, clearResults: boolean): Promise<void> {
  await rpc<null>('reopen_tournament_module', { p_module: moduleId, p_clear_results: clearResults });
}

// ─── Screens ─────────────────────────────────────────────────────────────────

export async function fetchOrgScreens(orgId: string): Promise<OrgScreen[]> {
  return (await rpc<OrgScreen[] | null>('org_list_screens', { p_org: orgId })) ?? [];
}

export async function upsertScreen(
  orgId: string,
  screenId: string | null,
  set: { name?: string; venue?: string | null; code?: string },
): Promise<string> {
  return rpc<string>('org_upsert_screen', { p_org: orgId, p_screen: screenId, p_set: set });
}

export async function archiveScreen(screenId: string): Promise<void> {
  await rpc<null>('org_archive_screen', { p_screen: screenId });
}

/** The screen is showing another running tournament: ask "Replace?" and call again with replace. */
export class ScreenBusyError extends Error {
  info: ScreenBusyInfo;
  constructor(info: ScreenBusyInfo) {
    super('SCREEN_BUSY');
    this.info = info;
  }
}

export async function assignScreen(screenId: string, tournamentId: string, replace = false): Promise<void> {
  const { error } = await supabase.rpc('assign_screen', {
    p_screen: screenId,
    p_tournament: tournamentId,
    p_replace: replace,
  });
  if (!error) return;
  if (error.message?.includes('SCREEN_BUSY')) {
    let info: ScreenBusyInfo = { tournament: 'another tournament', assigned_by: null, assigned_at: null };
    try {
      info = { ...info, ...(JSON.parse(error.details ?? '{}') as Partial<ScreenBusyInfo>) };
    } catch {
      // keep the generic wording
    }
    throw new ScreenBusyError(info);
  }
  throw new Error(error.message ?? 'Unknown error');
}

export async function unassignScreen(screenId: string): Promise<void> {
  await rpc<null>('unassign_screen', { p_screen: screenId });
}

export async function setScreenDisplay(
  screenId: string,
  patch: { courts?: string[] | null; layout?: 'auto' | 'row' | 'grid' | null },
): Promise<void> {
  await rpc<null>('set_screen_display', { p_screen: screenId, p_patch: patch });
}
