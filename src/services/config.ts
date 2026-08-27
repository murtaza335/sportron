import { supabase } from '@/lib/supabase';

export type MaintenanceConfig = {
  enabled: boolean;
  message: string;
};

const FALLBACK: MaintenanceConfig = { enabled: false, message: '' };

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

    if (error || !data) return FALLBACK;

    const value = data.value as Record<string, unknown>;
    return {
      enabled: Boolean(value.enabled),
      message: typeof value.message === 'string' ? value.message : '',
    };
  } catch {
    return FALLBACK;
  }
}
