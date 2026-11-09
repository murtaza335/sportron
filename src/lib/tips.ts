import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { useAuth } from '@/contexts/AuthContext';

/** One-time, dismissible "how it works" tips shown inline on each main screen. */
export type TipId = 'communities' | 'community_home' | 'sessions' | 'tournaments' | 'chats' | 'activity';

export const TIPS: Record<TipId, { title: string; body: string }> = {
  communities: {
    title: 'Welcome to your communities',
    body: 'A community is a group for one sport. Tap the Discover button to find and join public ones, or create your own.',
  },
  community_home: {
    title: 'Post, play, ping',
    body: 'Use the + button to write a post, share a photo, record a match (your opponent approves it) or ping everyone.',
  },
  sessions: {
    title: 'Find a game today',
    body: 'Create a session or apply to one. Use All / Joined / My to filter, and the clock icon to see past sessions.',
  },
  tournaments: {
    title: 'How tournaments work',
    body: 'A tournament has modules (one per sport). Open a module to see entries, the bracket or table, and live results.',
  },
  chats: {
    title: 'Your chats in one place',
    body: 'Community chats and session chats show up here with unread badges. Long-press a message to reply.',
  },
  activity: {
    title: 'Activity inbox',
    body: 'Action Required holds things you can approve or decline; Invites are community invitations; Past Activity is everything else.',
  },
};

// Bump to re-show tips after adding new ones.
const TIPS_VERSION = 1;

let seen: Set<string> | null = null;
let loadedFor: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const storageKey = (uid: string) => `tips_seen_${uid}_v${TIPS_VERSION}`;

async function load(uid: string) {
  if (loadedFor === uid) return;
  loadedFor = uid;
  try {
    const raw = await AsyncStorage.getItem(storageKey(uid));
    seen = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    seen = new Set();
  }
  emit();
}

async function persist(uid: string) {
  try {
    await AsyncStorage.setItem(storageKey(uid), JSON.stringify([...(seen ?? [])]));
  } catch {
    // best effort
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** `visible` is false until storage has loaded (no flash), then true until dismissed. */
export function useTip(id: TipId) {
  const { user } = useAuth();
  const uid = user?.id;
  useEffect(() => {
    if (uid) void load(uid);
  }, [uid]);
  const isSeen = useSyncExternalStore(
    subscribe,
    () => (seen === null || loadedFor !== uid ? null : seen.has(id)),
    () => null,
  );
  const dismiss = useCallback(() => {
    if (!uid || !seen) return;
    seen.add(id);
    emit();
    void persist(uid);
  }, [uid, id]);
  return { visible: isSeen === false, dismiss };
}

/** Settings → "Show tips again". */
export async function resetTips(uid: string | undefined) {
  if (!uid) return;
  seen = new Set();
  loadedFor = uid;
  emit();
  await persist(uid);
}
