import { supabase } from '@/lib/supabase';

// ── Maintenance ──────────────────────────────────────────────────────────────

export type MaintenanceConfig = {
  enabled: boolean;
  message: string;
};

const MAINTENANCE_FALLBACK: MaintenanceConfig = { enabled: false, message: '' };

/**
 * Fetch the maintenance-mode flag from the `site_config` table.
 * Fail-open: returns disabled on any error so the app stays usable
 * if the config fetch itself fails.
 */
export async function fetchMaintenanceMode(): Promise<MaintenanceConfig> {
  try {
    const { data, error } = await supabase
      .from('site_config')
      .select('value')
      .eq('key', 'maintenance')
      .maybeSingle();

    if (error || !data) return MAINTENANCE_FALLBACK;

    const value = data.value as Record<string, unknown>;
    return {
      enabled: Boolean(value.enabled),
      message: typeof value.message === 'string' ? value.message : '',
    };
  } catch {
    return MAINTENANCE_FALLBACK;
  }
}

// ── Min App Version ──────────────────────────────────────────────────────────

export type MinVersionConfig = {
  minVersion: string;
  storeUrl: string;
  message: string;
};

const MIN_VERSION_FALLBACK: MinVersionConfig = {
  minVersion: '0.0.0',
  storeUrl: '',
  message: '',
};

/**
 * Fetch the minimum required app version from the `site_config` table.
 * Fail-open: returns a zeroed-out config so the app stays usable on error.
 */
export async function fetchMinAppVersion(): Promise<MinVersionConfig> {
  try {
    const { data, error } = await supabase
      .from('site_config')
      .select('value')
      .eq('key', 'min_app_version')
      .maybeSingle();

    if (error || !data) return MIN_VERSION_FALLBACK;

    const value = data.value as Record<string, unknown>;
    return {
      minVersion: typeof value.min_version === 'string' ? value.min_version : '0.0.0',
      storeUrl: typeof value.store_url === 'string' ? value.store_url : '',
      message: typeof value.message === 'string' ? value.message : '',
    };
  } catch {
    return MIN_VERSION_FALLBACK;
  }
}

/**
 * Compare two semver strings. Returns true if `current` >= `min`.
 * Handles missing patch segments (e.g. "1.2" === "1.2.0").
 */
export function isVersionSatisfied(current: string, min: string): boolean {
  const cur = current.split('.').map(Number);
  const mn = min.split('.').map(Number);
  const len = Math.max(cur.length, mn.length);

  for (let i = 0; i < len; i++) {
    const c = cur[i] ?? 0;
    const m = mn[i] ?? 0;
    if (c > m) return true;
    if (c < m) return false;
  }
  return true; // equal
}
