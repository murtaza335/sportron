import { useEffect } from 'react';
import { router } from 'expo-router';

export default function AndroidRedirect() {
  useEffect(() => {
    router.replace('https://play.google.com/store/apps/details?id=com.murtazabaig.T3S');
  }, []);

  return null;
}