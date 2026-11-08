import { supabase } from '@/lib/supabase';
import type {
  EntryFieldInput,
  ModuleDetail,
  ModuleFormInput,
  ModuleGroup,
  KnockoutQualifier,
  ModuleSettingsPatch,
  StandingsV2,
  ProfileLite,
  ScoreDetailRow,
  Sport,
  Tournament,
  TournamentDetail,
  TeamMemberInput,
  TournamentEntry,
  TournamentEntryMember,
  TournamentEntryField,
  TournamentListItem,
  TournamentMatch,
  TournamentScope,
  TournamentRole,
  ModuleStatus,
  TournamentRound,
} from '@/types';

/** Throw a plain Error carrying the RPC's raw message (codes are mapped by tournamentErrors). */
function fail(error: { message: string } | null): never {
  throw new Error(error?.message ?? 'Unknown error');
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error);
  return data as T;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function fetchTournaments(scope: TournamentScope): Promise<TournamentListItem[]> {
  const rows = await rpc<TournamentListItem[] | null>('get_tournaments', { p_scope: scope });
  return (rows ?? []).map((r) => ({
    ...r,
    sports: (r.sports ?? []) as Sport[],
    module_count: Number(r.module_count ?? 0),
    live_module_count: Number(r.live_module_count ?? 0),
    my_role: (r.my_role ?? null) as TournamentRole,
  }));
}

export async function fetchTournamentDetail(tournamentId: string): Promise<TournamentDetail> {
  const d = await rpc<TournamentDetail>('get_tournament_detail', { p_tournament: tournamentId });
  return {
    ...d,
    admins: d.admins ?? [],
    champions: d.champions ?? [],
    modules: (d.modules ?? []).map((m) => ({ ...m, entry_count: Number(m.entry_count ?? 0) })),
  };
}

export async function fetchEntryFields(
  tournamentId: string,
  includeArchived = false,
): Promise<TournamentEntryField[]> {
  const rows = await rpc<TournamentEntryField[] | null>('get_tournament_entry_fields', {
    p_tournament: tournamentId,
    p_include_archived: includeArchived,
  });
  return (rows ?? []).map((f) => ({
    ...f,
    options: Array.isArray(f.options) ? (f.options as string[]) : null,
  }));
}

export async function fetchModuleDetail(moduleId: string): Promise<ModuleDetail> {
  const d = await rpc<ModuleDetail>('get_module_detail', { p_module: moduleId });
  return {
    ...d,
    rounds: (d.rounds ?? []) as TournamentRound[],
    admins: d.admins ?? [],
    counts: {
      entries: Number(d.counts?.entries ?? 0),
      withdrawn: Number(d.counts?.withdrawn ?? 0),
      matches: Number(d.counts?.matches ?? 0),
      matches_decided: Number(d.counts?.matches_decided ?? 0),
      rosters_incomplete: Number(d.counts?.rosters_incomplete ?? 0),
      groups_finished: !!d.counts?.groups_finished,
    },
  };
}

export async function fetchModuleEntries(moduleId: string): Promise<TournamentEntry[]> {
  const rows = await rpc<TournamentEntry[] | null>('get_module_entries', { p_module: moduleId });
  return (rows ?? []).map((e) => ({
    ...e,
    fields: e.fields ?? {},
    member_count: Number(e.member_count ?? 0),
    members: ((e.members ?? []) as TournamentEntryMember[]).map((m) => ({
      ...m,
      fields: m.fields ?? {},
    })),
  }));
}

export async function fetchModuleMatches(moduleId: string): Promise<TournamentMatch[]> {
  const rows = await rpc<TournamentMatch[] | null>('get_module_matches', { p_module: moduleId });
  return (rows ?? []).map((r) => ({
    ...r,
    score_detail: (r.score_detail ?? null) as ScoreDetailRow[] | null,
    entry_a: r.entry_a ? { ...r.entry_a, profile_ids: r.entry_a.profile_ids ?? [] } : null,
    entry_b: r.entry_b ? { ...r.entry_b, profile_ids: r.entry_b.profile_ids ?? [] } : null,
  }));
}

export async function fetchModuleStandingsV2(moduleId: string): Promise<StandingsV2> {
  const d = await rpc<StandingsV2>('get_module_standings_v2', { p_module: moduleId });
  return d;
}

export async function moveGroupEntry(entryId: string, groupId: string): Promise<void> {
  await rpc<null>('move_group_entry', { p_entry: entryId, p_group: groupId });
}

export async function previewKnockoutQualifiers(moduleId: string): Promise<KnockoutQualifier[]> {
  const rows = await rpc<KnockoutQualifier[] | null>('preview_knockout_qualifiers', { p_module: moduleId });
  return (rows ?? []).map((r) => ({ ...r, position: Number(r.position), suggested_seed: Number(r.suggested_seed) }));
}

/** `entryIds` = qualifier ids in the wanted seed order, or null for the suggested order. Returns the match count. */
export async function buildKnockoutStage(moduleId: string, entryIds: string[] | null): Promise<number> {
  return rpc<number>('build_knockout_stage', { p_module: moduleId, p_entry_ids: entryIds });
}

export async function resetKnockoutStage(moduleId: string): Promise<void> {
  await rpc<null>('reset_knockout_stage', { p_module: moduleId });
}

export async function fetchModuleGroups(moduleId: string): Promise<ModuleGroup[]> {
  const rows = await rpc<ModuleGroup[] | null>('get_module_groups', { p_module: moduleId });
  return rows ?? [];
}

export async function searchProfilesForTournament(query: string): Promise<ProfileLite[]> {
  const rows = await rpc<ProfileLite[] | null>('search_profiles_for_tournament', { p_query: query });
  return rows ?? [];
}

// ─── Tournament admin writes ─────────────────────────────────────────────────

export async function renameTournament(tournamentId: string, name: string): Promise<void> {
  await rpc<null>('rename_tournament', { p_tournament: tournamentId, p_name: name });
}

export type TournamentSettingsPatch = Partial<
  Pick<Tournament, 'name' | 'description' | 'organization' | 'location' | 'image_url' | 'starts_at' | 'ends_at' | 'status'>
>;

/** Tournament admin: edit any tournament setting. Only the keys present in `patch` are changed. */
export async function updateTournament(tournamentId: string, patch: TournamentSettingsPatch): Promise<void> {
  await rpc<null>('update_tournament', { p_tournament: tournamentId, p_set: patch });
}

export async function upsertEntryField(
  tournamentId: string,
  input: EntryFieldInput,
): Promise<TournamentEntryField> {
  return rpc<TournamentEntryField>('upsert_tournament_entry_field', {
    p_tournament: tournamentId,
    p_id: input.id,
    p_key: input.key,
    p_label: input.label,
    p_type: input.field_type,
    p_options: input.options,
    p_placeholder: input.placeholder,
    p_required: input.is_required,
    p_public: input.is_public,
    p_sort: input.sort_order,
  });
}

export async function archiveEntryField(fieldId: string): Promise<void> {
  await rpc<null>('archive_tournament_entry_field', { p_field: fieldId });
}

export async function reorderEntryFields(tournamentId: string, ids: string[]): Promise<void> {
  await rpc<null>('reorder_tournament_entry_fields', { p_tournament: tournamentId, p_ids: ids });
}

export async function createModule(tournamentId: string, input: ModuleFormInput): Promise<string> {
  return rpc<string>('create_tournament_module', {
    p_tournament: tournamentId,
    p_name: input.name,
    p_sport: input.sport,
    p_description: input.description,
    p_rules_text: input.rules_text,
    p_venue: input.venue,
    p_starts_at: input.starts_at,
    p_max_entries: input.max_entries,
    p_third_place: input.third_place_match,
    p_seeding_method: input.seeding_method,
  });
}

export async function updateModule(moduleId: string, input: ModuleFormInput): Promise<void> {
  await rpc<null>('update_tournament_module', {
    p_module: moduleId,
    p_name: input.name,
    p_sport: input.sport,
    p_description: input.description,
    p_rules_text: input.rules_text,
    p_venue: input.venue,
    p_starts_at: input.starts_at,
    p_max_entries: input.max_entries,
    p_third_place: input.third_place_match,
    p_seeding_method: input.seeding_method,
  });
}

export async function deleteModule(moduleId: string): Promise<void> {
  await rpc<null>('delete_tournament_module', { p_module: moduleId });
}

export async function addModuleAdmin(moduleId: string, profileId: string): Promise<void> {
  await rpc<null>('add_module_admin', { p_module: moduleId, p_profile: profileId });
}

export async function removeModuleAdmin(moduleId: string, profileId: string): Promise<void> {
  await rpc<null>('remove_module_admin', { p_module: moduleId, p_profile: profileId });
}

// ─── Module admin writes ─────────────────────────────────────────────────────

export async function setModuleStatus(moduleId: string, status: ModuleStatus): Promise<void> {
  await rpc<null>('set_module_status', { p_module: moduleId, p_status: status });
}

export async function upsertEntry(
  moduleId: string,
  entryId: string | null,
  name: string,
  profileId: string | null,
  fieldValues: Record<string, string>,
): Promise<string> {
  return rpc<string>('upsert_tournament_entry', {
    p_module: moduleId,
    p_entry: entryId,
    p_name: name,
    p_profile: profileId,
    p_field_values: fieldValues,
  });
}

/** Create/edit a team entry; `members` is the FULL roster (absent ids are removed). */
export async function upsertTeamEntry(
  moduleId: string,
  entryId: string | null,
  name: string,
  members: TeamMemberInput[],
): Promise<string> {
  return rpc<string>('upsert_team_entry', {
    p_module: moduleId,
    p_entry: entryId,
    p_name: name,
    p_members: members,
  });
}

/** v2 settings patch (participant type, roster size, …). Send after create/updateModule. */
export async function updateModuleSettings(
  moduleId: string,
  patch: ModuleSettingsPatch,
): Promise<void> {
  await rpc<null>('update_tournament_module_settings', { p_module: moduleId, p_set: patch });
}

export async function deleteEntry(entryId: string): Promise<void> {
  await rpc<null>('delete_tournament_entry', { p_entry: entryId });
}

export async function withdrawEntry(entryId: string, reason?: string): Promise<void> {
  await rpc<null>('withdraw_tournament_entry', { p_entry: entryId, p_reason: reason ?? null });
}

export async function setModuleSeeds(moduleId: string, entryIds: string[]): Promise<void> {
  await rpc<null>('set_module_seeds', { p_module: moduleId, p_entry_ids: entryIds });
}

export async function updateRound(
  roundId: string,
  input: { name: string; best_of: number; rules_text: string | null; scheduled_start: string | null },
): Promise<void> {
  await rpc<unknown>('update_tournament_round', {
    p_round: roundId,
    p_name: input.name,
    p_best_of: input.best_of,
    p_rules_text: input.rules_text,
    p_scheduled_start: input.scheduled_start,
  });
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export async function generateBracket(moduleId: string): Promise<number> {
  return rpc<number>('generate_bracket', { p_module: moduleId });
}

export async function recordResult(args: {
  matchId: string;
  scoreA: number;
  scoreB: number;
  scoreDetail: ScoreDetailRow[] | null;
  winnerEntryId: string | null;
  note: string | null;
}): Promise<void> {
  await rpc<unknown>('record_tournament_result', {
    p_match: args.matchId,
    p_score_a: args.scoreA,
    p_score_b: args.scoreB,
    p_score_detail: args.scoreDetail,
    p_winner: args.winnerEntryId,
    p_note: args.note,
  });
}

export async function recordWalkover(
  matchId: string,
  winnerEntryId: string,
  note: string | null,
): Promise<void> {
  await rpc<unknown>('record_tournament_walkover', {
    p_match: matchId,
    p_winner: winnerEntryId,
    p_note: note,
  });
}

export async function resetMatch(matchId: string): Promise<void> {
  await rpc<unknown>('reset_tournament_match', { p_match: matchId });
}

export async function scheduleMatch(
  matchId: string,
  at: string | null,
  venue: string | null,
  court: string | null,
): Promise<void> {
  await rpc<unknown>('schedule_tournament_match', {
    p_match: matchId,
    p_at: at,
    p_venue: venue,
    p_court: court,
  });
}

export type { Tournament };
