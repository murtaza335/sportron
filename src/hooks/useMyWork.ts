import { useAuth } from '@/contexts/AuthContext';
import { useFlag } from '@/contexts/RemoteConfigContext';
import { useCachedLoad } from '@/hooks/useCachedLoad';
import { fetchMyWork } from '@/services/organizations';

function localMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** My organization roles and managed sports. Silent (empty) while the `organizations` flag is off. */
export function useMyWork() {
  const { user } = useAuth();
  const enabled = useFlag('organizations', false);
  const r = useCachedLoad(enabled && user ? `work:${user.id}` : null, () => fetchMyWork(localMidnight()));
  return { ...r, enabled, orgs: r.data?.orgs ?? [], sports: r.data?.sports ?? [] };
}
