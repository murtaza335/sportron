import type { RealtimeChannel } from '@supabase/supabase-js';

import type { LiveScoreEvent } from '@/lib/live';
import { supabase } from '@/lib/supabase';

/**
 * One shared realtime subscription per live topic (`live:<code>`), ref-counted. supabase.channel() hands back the SAME
 * channel for a repeated topic, so two screens (Live screen + a live match screen) must not subscribe separately.
 * The topic is private and receive-only: the database trigger is the only sender (migration 133).
 */
export interface LiveListener {
  onScore: (ev: LiveScoreEvent) => void;
  /** Organiser changed the settings / code: refetch. */
  onConfig: () => void;
  onStatus: (connected: boolean) => void;
}

interface Entry {
  channel: RealtimeChannel;
  listeners: Set<LiveListener>;
  connected: boolean;
  teardown: ReturnType<typeof setTimeout> | null;
}

const registry = new Map<string, Entry>();
const KEEP_ALIVE_MS = 3000;

export function subscribeLive(code: string, listener: LiveListener): () => void {
  let e = registry.get(code);
  if (!e) {
    const entry: Entry = {
      channel: supabase.channel(`live:${code}`, { config: { private: true } }),
      listeners: new Set(),
      connected: false,
      teardown: null,
    };
    entry.channel
      .on('broadcast', { event: 'score' }, (msg) => {
        const ev = msg.payload as LiveScoreEvent | undefined;
        if (ev && ev.match_id) entry.listeners.forEach((l) => l.onScore(ev));
      })
      .on('broadcast', { event: 'config' }, () => entry.listeners.forEach((l) => l.onConfig()))
      .subscribe((status) => {
        entry.connected = status === 'SUBSCRIBED';
        entry.listeners.forEach((l) => l.onStatus(entry.connected));
      });
    registry.set(code, entry);
    e = entry;
  }
  if (e.teardown) {
    clearTimeout(e.teardown);
    e.teardown = null;
  }
  e.listeners.add(listener);
  listener.onStatus(e.connected);

  const entry = e;
  return () => {
    entry.listeners.delete(listener);
    if (entry.listeners.size > 0 || entry.teardown) return;
    // Keep the socket briefly: screens often unmount and mount again within a navigation.
    entry.teardown = setTimeout(() => {
      if (entry.listeners.size === 0) {
        void supabase.removeChannel(entry.channel);
        if (registry.get(code) === entry) registry.delete(code);
      }
      entry.teardown = null;
    }, KEEP_ALIVE_MS);
  };
}
