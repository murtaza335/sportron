// The guided "new tournament" flow: sport chips → one entry per competition, with sensible defaults.
// PURE (no React / React Native, relative imports only) so docs/organizations/wizard-tests.cjs can run it.
import { PRESETS, defaultPresetId } from './live/presets';

export type WizardSport = 'badminton' | 'table_tennis' | 'basketball' | 'volleyball';
export type TeamFormat = 'round_robin' | 'single_elimination';

export type WizardOption = {
  key: string;
  sport: WizardSport;
  /** Chip label, e.g. "Men's singles". */
  label: string;
  /** Module name, e.g. "Badminton Men's Singles". */
  name: string;
  team: null | { min: number; max: number; lineup: number };
  /** Team sports let the organizer pick league or knockout. */
  formatChoice: boolean;
};

export const WIZARD_SPORTS: { sport: WizardSport; label: string }[] = [
  { sport: 'badminton', label: 'Badminton' },
  { sport: 'table_tennis', label: 'Table tennis' },
  { sport: 'basketball', label: 'Basketball' },
  { sport: 'volleyball', label: 'Volleyball' },
];

const racket = (sport: WizardSport, sportName: string): WizardOption[] => {
  const doubles = { min: 2, max: 2, lineup: 2 };
  const rows: [string, string, WizardOption['team']][] = [
    ['ms', "Men's singles", null],
    ['ws', "Women's singles", null],
    ['md', "Men's doubles", doubles],
    ['wd', "Women's doubles", doubles],
    ['xd', 'Mixed doubles', doubles],
    ['team', 'Team', { min: 2, max: 8, lineup: 3 }],
  ];
  return rows.map(([key, label, team]) => ({
    key: `${sport}:${key}`,
    sport,
    label,
    name: `${sportName} ${label.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/'S\b/g, "'s")}`,
    team,
    formatChoice: false,
  }));
};

const team = (sport: WizardSport, sportName: string, roster: NonNullable<WizardOption['team']>): WizardOption[] =>
  [
    ['men', 'Men'],
    ['women', 'Women'],
  ].map(([key, label]) => ({
    key: `${sport}:${key}`,
    sport,
    label,
    name: `${sportName} ${label}`,
    team: roster,
    formatChoice: true,
  }));

export const WIZARD_OPTIONS: WizardOption[] = [
  ...racket('badminton', 'Badminton'),
  ...racket('table_tennis', 'Table Tennis'),
  ...team('basketball', 'Basketball', { min: 5, max: 12, lineup: 5 }),
  ...team('volleyball', 'Volleyball', { min: 6, max: 14, lineup: 6 }),
];

export type WizardModule = {
  name: string;
  sport: WizardSport;
  settings: Record<string, unknown>;
  live_rules: Record<string, unknown>;
};

/** The server payload for the chosen competitions. `formats` overrides team sports (default league). */
export function buildModules(keys: string[], formats: Record<string, TeamFormat> = {}): WizardModule[] {
  return WIZARD_OPTIONS.filter((o) => keys.includes(o.key)).map((o) => {
    const settings: Record<string, unknown> = {};
    if (o.team) {
      settings.participant_type = 'team';
      settings.roster_min = o.team.min;
      settings.roster_max = o.team.max;
      settings.lineup_size = o.team.lineup;
    }
    if (o.formatChoice) settings.format = formats[o.key] ?? 'round_robin';
    const rules = { ...(PRESETS[defaultPresetId(o.sport)] as unknown as Record<string, unknown>) };
    if (rules.family === 'sets' && o.team && o.team.lineup === 2) rules.doubles = true;
    return { name: o.name, sport: o.sport, settings, live_rules: rules };
  });
}
