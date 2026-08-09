import { useEffect, useRef } from 'react';
import { useFCM } from '@/hooks/useFCM';
import { useAuth } from '@/contexts/AuthContext';

export function FCMInitializer() {
  const { session, profile } = useAuth();
  const { initialize } = useFCM();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (session && profile && !initializedRef.current) {
      initializedRef.current = true;
      initialize();
    }
  }, [session, profile, initialize]);

  return null;
}