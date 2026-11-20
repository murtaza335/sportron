/** Projector display settings (tournaments.live_display) — defaults mirror the server's _live_display_defaults(). */
export interface LiveDisplaySettings {
  show_school: boolean;
  show_fields: string[];
  show_module: boolean;
  show_court: boolean;
  show_up_next: boolean;
  show_recent: boolean;
  show_app_promo: boolean;
  title: string | null;
  courts: string[];
  layout: 'auto' | 'row' | 'grid';
  max_per_page: number;
  final_hold_seconds: number;
}

export const DEFAULT_LIVE_DISPLAY: LiveDisplaySettings = {
  show_school: false,
  show_fields: [],
  show_module: true,
  show_court: true,
  show_up_next: true,
  show_recent: true,
  show_app_promo: true,
  title: null,
  courts: [],
  layout: 'auto',
  max_per_page: 6,
  final_hold_seconds: 60,
};

export const resolveLiveDisplay = (partial?: Partial<LiveDisplaySettings> | null): LiveDisplaySettings => ({
  ...DEFAULT_LIVE_DISPLAY,
  ...(partial ?? {}),
});
