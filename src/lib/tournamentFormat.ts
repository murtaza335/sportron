import type { ThemeColor } from '@/constants/theme';
import { isRacketSport, SPORT_LABELS } from '@/types';
import type {
  EntryFieldType,
  ModuleStatus,
  ParticipantType,
  Sport,
  TournamentModule,
  TournamentEntryField,
  TournamentListItem,
  TournamentMatchStatus,
  TournamentRole,
  TournamentStatus,
} from '@/types';

export type StatusTone = { label: string; token: ThemeColor };

/** Tournament status pill; a published tournament with live modules shows LIVE (PLAN §11). */
export function tournamentStatusTone(
  status: TournamentStatus,
  liveModuleCount = 0,
): StatusTone {
  switch (status) {
    case 'draft':
      return { label: 'DRAFT', token: 'textSecondary' };
    case 'completed':
      return { label: 'COMPLETED', token: 'text' };
    case 'cancelled':
      return { label: 'CANCELLED', token: 'error' };
    case 'published':
    default:
      return liveModuleCount > 0
        ? { label: '● LIVE', token: 'success' }
        : { label: 'UPCOMING', token: 'accent' };
  }
}

export function moduleStatusTone(status: ModuleStatus): StatusTone {
  switch (status) {
    case 'draft':
      return { label: 'DRAFT', token: 'textSecondary' };
    case 'open':
      return { label: 'OPEN', token: 'info' };
    case 'seeding':
      return { label: 'SEEDING', token: 'warning' };
    case 'in_progress':
      return { label: '● LIVE', token: 'success' };
    case 'completed':
      return { label: 'COMPLETED', token: 'text' };
    case 'cancelled':
    default:
      return { label: 'CANCELLED', token: 'error' };
  }
}

/** Hex colour at ~15% opacity (same technique as sport pills). */
export function tint(color: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}26` : color;
}

export function roleTag(role: TournamentRole): string | null {
  if (role === 'tournament_admin' || role === 'module_admin') return 'ADMIN';
  if (role === 'entrant') return 'PLAYING';
  return null;
}

export function isAdminRole(role: TournamentRole): boolean {
  return role === 'tournament_admin' || role === 'module_admin';
}

export function sportLabel(sport: Sport): string {
  return SPORT_LABELS[sport] ?? 'Other';
}

export function matchStatusLabel(status: TournamentMatchStatus): string {
  switch (status) {
    case 'pending':
      return 'Upcoming';
    case 'scheduled':
      return 'Scheduled';
    case 'completed':
      return 'Final';
    case 'walkover':
      return 'W/O';
    case 'bye':
      return 'BYE';
    case 'cancelled':
    default:
      return 'Cancelled';
  }
}

export function isMatchDecided(status: TournamentMatchStatus): boolean {
  return status === 'completed' || status === 'walkover' || status === 'bye';
}

export function bestOfLabel(bestOf: number): string {
  return bestOf > 1 ? `Best of ${bestOf}` : 'Single game';
}

/** "Quarter-finals" → "QUARTER-FINALS · BEST OF 3" for section headers. */
export function roundHeader(name: string, bestOf: number): string {
  return bestOf > 1 ? `${name} · Bo${bestOf}` : name;
}

/** Slug used as `key` for a new custom entry field. */
export function slugifyFieldKey(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);
  const key = /^[a-z]/.test(base) ? base : `f_${base}`;
  return key.length >= 2 ? key : `${key}_x`;
}

export const FIELD_TYPE_LABELS: Record<EntryFieldType, string> = {
  text: 'Text',
  number: 'Number',
  email: 'Email',
  phone: 'Phone',
  select: 'Select',
};

/**
 * Client mirror of the server entry validation (migration 086). Returns an error message or null.
 * The server remains the source of truth.
 */
export function validateFieldValue(field: TournamentEntryField, raw: string): string | null {
  const v = raw.trim();
  if (!v) return field.is_required ? `${field.label} is required.` : null;
  if (v.length > 200) return `${field.label} is too long.`;
  switch (field.field_type) {
    case 'email':
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : `${field.label} looks invalid.`;
    case 'phone':
      return /^\+?[0-9\s-]{7,20}$/.test(v) ? null : `${field.label} looks invalid.`;
    case 'number':
      return /^-?[0-9]+(\.[0-9]+)?$/.test(v) ? null : `${field.label} looks invalid.`;
    case 'select':
      return field.options?.includes(v) ? null : `${field.label} looks invalid.`;
    default:
      return null;
  }
}

/** Date range like "12–20 Nov" / "12 Nov – 3 Dec" / "12 Nov". */
export function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return null;
  const e = end ? new Date(end) : null;
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: 'short' });
  if (!e || Number.isNaN(e.getTime()) || e.toDateString() === s.toDateString()) {
    return `${s.getDate()} ${month(s)}`;
  }
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()}–${e.getDate()} ${month(s)}`;
  }
  return `${s.getDate()} ${month(s)} – ${e.getDate()} ${month(e)}`;
}

/** "Sat 13 Nov · 5:00 PM" */
export function formatMatchTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

export function listSportsLabel(t: Pick<TournamentListItem, 'sports'>): string {
  return t.sports.map(sportLabel).join(', ');
}

// ─── Rosters (v2) ────────────────────────────────────────────────────────────

export type RosterDefaults = { min: number; max: number; lineup: number | null };

/** Default roster sizes per sport (PLAN-v2 §3.1). Racket sports = doubles; null = no preset. */
export const DEFAULT_ROSTER: Record<Sport, RosterDefaults> = {
  table_tennis: { min: 2, max: 2, lineup: 2 },
  badminton: { min: 2, max: 2, lineup: 2 },
  tennis: { min: 2, max: 2, lineup: 2 },
  squash: { min: 2, max: 2, lineup: 2 },
  pickleball: { min: 2, max: 2, lineup: 2 },
  football: { min: 11, max: 18, lineup: 11 },
  cricket: { min: 11, max: 15, lineup: 11 },
  volleyball: { min: 6, max: 12, lineup: 6 },
  basketball: { min: 5, max: 12, lineup: 5 },
  handball: { min: 7, max: 14, lineup: 7 },
  other: { min: 2, max: 20, lineup: null },
};

/** B3: racket → singles or doubles, team sports → teams only, other → either. */
export function allowedParticipantTypes(sport: Sport): ParticipantType[] {
  if (isRacketSport(sport)) return ['individual', 'team'];
  if (sport === 'other') return ['individual', 'team'];
  return ['team'];
}

/** Doubles = a team module with exactly two players. */
export function isDoubles(m: Pick<TournamentModule, 'participant_type' | 'roster_min' | 'roster_max'>): boolean {
  return m.participant_type === 'team' && m.roster_min === 2 && m.roster_max === 2;
}

/** "Singles" · "Doubles" · "Teams (11–18 players)". */
export function participantLabel(
  m: Pick<TournamentModule, 'participant_type' | 'roster_min' | 'roster_max'>,
): string {
  if (m.participant_type !== 'team') return 'Singles';
  if (isDoubles(m)) return 'Doubles';
  if (m.roster_min != null && m.roster_max != null) {
    return m.roster_min === m.roster_max
      ? `Teams (${m.roster_max} players)`
      : `Teams (${m.roster_min}–${m.roster_max} players)`;
  }
  return 'Teams';
}

/** Word for one entry: team modules say "team"/"pair", individual modules "player". */
export function entryNoun(m: Pick<TournamentModule, 'participant_type' | 'roster_min' | 'roster_max'>, plural = false): string {
  const base = m.participant_type !== 'team' ? 'player' : isDoubles(m) ? 'pair' : 'team';
  return plural ? `${base}s` : base;
}

/** "Ali R. / Omar F." for a doubles pair, else the entry name. */
export function pairLine(members: { name: string }[]): string {
  return members.map((p) => p.name).join(' / ');
}
