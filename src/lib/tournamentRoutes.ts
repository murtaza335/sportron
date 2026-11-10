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
  moduleManage: (id: string, moduleId: string) => h(`/tournament/${id}/module/${moduleId}/manage`),
  entryForm: (id: string, moduleId: string, entryId?: string) =>
    h(`/tournament/${id}/module/${moduleId}/entry-form${entryId ? `?entryId=${entryId}` : ''}`),
  seeding: (id: string, moduleId: string) => h(`/tournament/${id}/module/${moduleId}/seeding`),
  knockout: (id: string, moduleId: string) => h(`/tournament/${id}/module/${moduleId}/knockout`),
  rounds: (id: string, moduleId: string) => h(`/tournament/${id}/module/${moduleId}/rounds`),
  profile: (id: string) => h(`/profile/${id}`),
};
