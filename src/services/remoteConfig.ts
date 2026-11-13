import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/** Flags already evaluated server-side for this user/platform/app version. Fail-soft: errors mean "no data". */
export async function fetchFeatureFlags(): Promise<Record<string, boolean> | null> {
  try {
    const { data, error } = await supabase.rpc('get_feature_flags', {
      p_platform: Platform.OS,
      p_app_version: Constants.expoConfig?.version ?? '0.0.0',
    });
    if (error || !data) return null;
    const out: Record<string, boolean> = {};
    for (const r of data as { key: string; enabled: boolean }[]) out[r.key] = r.enabled;
    return out;
  } catch {
    return null;
  }
}

/** Remote lists / limits / content (sports, expire options, tips, what's new). null = unavailable. */
export async function fetchRemoteConfig(): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.rpc('get_remote_config');
    if (error || !data) return null;
    const out: Record<string, unknown> = {};
    for (const r of data as { key: string; value: unknown }[]) out[r.key] = r.value;
    return out;
  } catch {
    return null;
  }
}

export type RecommendedVersion = { version: string; storeUrl: string; message: string };

/** Soft "update available" target from site_config (B6). null when unset or unreadable. */
export async function fetchRecommendedVersion(): Promise<RecommendedVersion | null> {
  try {
    const { data, error } = await supabase
      .from('site_config')
      .select('value')
      .eq('key', 'recommended_app_version')
      .maybeSingle();
    if (error || !data) return null;
    const v = data.value as Record<string, unknown>;
    if (typeof v.version !== 'string' || !v.version) return null;
    return {
      version: v.version,
      storeUrl: typeof v.store_url === 'string' ? v.store_url : '',
      message: typeof v.message === 'string' ? v.message : '',
    };
  } catch {
    return null;
  }
}
