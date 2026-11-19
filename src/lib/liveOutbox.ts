import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

import { createOutbox, type OutboxStorage } from '@/lib/liveOutboxCore';
import { finishLive, pushLiveScore } from '@/services/tournamentsLive';

/** The app-wide live-score outbox: real transport (Supabase RPCs) + AsyncStorage. See liveOutboxCore for the logic. */

const storage: OutboxStorage = {
  get: (k) => AsyncStorage.getItem(k),
  set: (k, v) => AsyncStorage.setItem(k, v),
  remove: (k) => AsyncStorage.removeItem(k),
  keys: async (prefix) => (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix)),
};

export const liveOutbox = createOutbox({
  push: (a) => pushLiveScore(a),
  finish: (a) =>
    finishLive({
      matchId: a.matchId,
      seq: a.seq,
      snapshot: a.snapshot,
      summary: a.summary,
      scoreA: a.scoreA,
      scoreB: a.scoreB,
      scoreDetail: a.scoreDetail,
      winnerEntryId: a.winnerEntryId,
      note: a.note,
    }),
  storage,
});

// A phone that was offline retries as soon as the app is foregrounded again.
let started = false;
export function startLiveOutbox(): void {
  if (started) return;
  started = true;
  AppState.addEventListener('change', (s) => {
    if (s === 'active') liveOutbox.wake();
  });
  void liveOutbox.resumeAll();
}

const DEVICE_KEY = 'live_device_id';
let deviceId: string | null = null;

/** Random id per app install: lets the same person resume scoring on the same phone without a takeover. */
export async function getLiveDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  try {
    const saved = await AsyncStorage.getItem(DEVICE_KEY);
    if (saved) return (deviceId = saved);
  } catch {
    // fall through
  }
  const fresh = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  deviceId = fresh;
  try {
    await AsyncStorage.setItem(DEVICE_KEY, fresh);
  } catch {
    // an unsaved id only costs a takeover prompt later
  }
  return fresh;
}
