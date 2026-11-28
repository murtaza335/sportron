import type { ModuleStatus } from '@/types';

/** What a manager should do next for one sport. */
export function sportNextStep(s: {
  status: ModuleStatus;
  entry_count: number;
  scorer_count?: number;
}): { label: string; target: 'entries' | 'seeding' | 'manage' } | null {
  if (s.status === 'draft' || s.status === 'open') {
    return s.entry_count < 2 ? { label: 'Add players', target: 'entries' } : { label: 'Close entries and create the draw', target: 'manage' };
  }
  if (s.status === 'seeding') return { label: 'Create draw and start', target: 'seeding' };
  if (s.status === 'in_progress' && s.scorer_count === 0) return { label: 'Appoint scorers', target: 'manage' };
  return null;
}
