import type { Href } from 'expo-router';

/**
 * Typed-route helpers for tournament screens. Casts are used because expo-router's generated
 * route types (.expo/types) only learn new routes after the dev server regenerates them.
 */
const h = (path: string) => path as unknown as Href;

export const tournamentRoutes = {
  tournament: (id: string) => h(`/tournament/${id}`),
  manage: (id: string) => h(`/tournament/${id}/manage`),
  fields: (id: string) => h(`/tournament/${id}/fields`),
  moduleForm: (id: string, moduleId?: string) =>
    h(`/tournament/${id}/module-form${moduleId ? `?moduleId=${moduleId}` : ''}`),
  module: (id: string, moduleId: string) => h(`/tournament/${id}/module/${moduleId}`),
  /** Module screen opened on its Matches tab, on the Today or Schedule view. */
  moduleMatches: (id: string, moduleId: string, view: 'today' | 'schedule' = 'today') =>
    h(`/tournament/${id}/module/${moduleId}?tab=matches&view=${view}`),
  moduleManage: (id: string, moduleId: string) => h(`/tournament/${id}/module/${moduleId}/manage`),
  entryForm: (id: string, moduleId: string, entryId?: string) =>
    h(`/tournament/${id}/module/${moduleId}/entry-form${entryId ? `?entryId=${entryId}` : ''}`),
  seeding: (id: string, moduleId: string) => h(`/tournament/${id}/module/${moduleId}/seeding`),
  knockout: (id: string, moduleId: string) => h(`/tournament/${id}/module/${moduleId}/knockout`),
  rounds: (id: string, moduleId: string) => h(`/tournament/${id}/module/${moduleId}/rounds`),
  /** Full-screen live scoring (or `?mode=result` for the full-screen result entry). */
  score: (id: string, moduleId: string, matchId: string, mode?: 'result') =>
    h(`/tournament/${id}/module/${moduleId}/score/${matchId}${mode ? `?mode=${mode}` : ''}`),
  /** "To score": the matches I score or manage. */
  toScore: () => h('/score'),
  organize: (orgId?: string) => h(`/organize${orgId ? `?org=${orgId}` : ''}`),
  organizeNew: (orgId: string) => h(`/organize/new?org=${orgId}`),
  organizeOrganizers: (orgId: string) => h(`/organize/organizers?org=${orgId}`),
  organizeActivity: (orgId: string) => h(`/organize/activity?org=${orgId}`),
  mySports: () => h('/organize/sports'),
  organizeScreens: (orgId: string) => h(`/organize/screens?org=${orgId}`),
  organizeScreen: (orgId: string, screenId: string) => h(`/organize/screens/${screenId}?org=${orgId}`),
  liveBoard: (id: string) => h(`/tournament/${id}/live`),
  liveMatch: (id: string, matchId: string) => h(`/tournament/${id}/live/${matchId}`),
  profile: (id: string) => h(`/profile/${id}`),
};
