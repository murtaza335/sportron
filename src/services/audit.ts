import { supabase } from '@/lib/supabase';
import type { AuditLog } from '@/types';

/**
 * Fetch audit logs for a specific record (e.g. a community).
 */
export async function fetchAuditLogsForRecord(
  tableName: string,
  recordId: string,
  limit = 50,
  offset = 0,
): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('table_name', tableName)
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch audit logs for a specific user (across all tables).
 */
export async function fetchAuditLogsForUser(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('actor_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data ?? [];
}

/**
 * Fetch recent audit logs across all tables.
 */
export async function fetchRecentAuditLogs(
  limit = 50,
  offset = 0,
): Promise<AuditLog[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return data ?? [];
}
