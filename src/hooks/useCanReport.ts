import { useAuth } from '@/contexts/AuthContext';
import { useFlag } from '@/contexts/RemoteConfigContext';

/**
 * The single gate for every report entry point: the `reports` feature flag is on, the viewer is signed in
 * and the content isn't theirs. `ownerId` omitted/null = owner unknown, allow (the server rejects self-reports).
 */
export function useCanReport(ownerId?: string | null): boolean {
  const enabled = useFlag('reports', false);
  const { user } = useAuth();
  return enabled && !!user && ownerId !== user.id;
}
