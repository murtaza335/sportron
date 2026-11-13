import type { ReportReason, ReportTargetType } from '@/lib/reports';
import { supabase } from '@/lib/supabase';

/** Files a report via the `submit_report` RPC. Returns the report id; throws the raw RPC message (mapped by lib/reports). */
export async function submitReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('submit_report', {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_reason: input.reason,
    p_details: input.details?.trim() ? input.details.trim() : null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
