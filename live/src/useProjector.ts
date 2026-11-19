import { applyScoreEvent, type LiveBoard, type LiveScoreEvent } from '@live-engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export type ProjectorState = 'loading' | 'active' | 'inactive';

const SAFETY_POLL_MS = 60_000;
const INACTIVE_POLL_MS = 30_000;
const RELOAD_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Board of the projector page: first load by RPC, live updates over the tournament's private channel, and a polling
 * fallback (5 s with jitter) whenever the socket is down — it never shows an error page, it just keeps trying.
 */
export function useProjector(code: string): { board: LiveBoard | null; state: ProjectorState; connected: boolean; offset: number; online: boolean } {
  const [board, setBoard] = useState<LiveBoard | null>(null);
  const [state, setState] = useState<ProjectorState>('loading');
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(true);
  const [offset, setOffset] = useState(0);
  const ref = useRef<LiveBoard | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc('get_live_board', { p_code: code });
      if (error) throw error;
      const b = data as LiveBoard;
      setOnline(true);
      if (!b || !b.active) {
        ref.current = null;
        setBoard(null);
        setState('inactive');
        return;
      }
      ref.current = b;
      setBoard(b);
      setOffset(Date.parse(b.server_now) - Date.now());
      setState('active');
    } catch {
      setOnline(false); // keep showing the last known scores
    }
  }, [code]);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) return;
    refetchTimer.current = setTimeout(() => {
      refetchTimer.current = null;
      void load();
    }, 500);
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  // realtime
  useEffect(() => {
    if (!supabase || state !== 'active') return;
    const channel = supabase
      .channel(`live:${code}`, { config: { private: true } })
      .on('broadcast', { event: 'score' }, (msg) => {
        const ev = msg.payload as LiveScoreEvent | undefined;
        const cur = ref.current;
        if (!ev || !cur) return;
        const r = applyScoreEvent(cur, ev);
        if (r.board !== cur) {
          ref.current = r.board;
          setBoard(r.board);
        }
        if (r.refetch) scheduleRefetch();
      })
      .on('broadcast', { event: 'config' }, () => scheduleRefetch())
      .subscribe((status) => {
        const ok = status === 'SUBSCRIBED';
        setConnected(ok);
        if (ok) scheduleRefetch();
      });
    return () => {
      setConnected(false);
      void supabase?.removeChannel(channel);
    };
  }, [code, state, scheduleRefetch]);

  // polling: 5 s (± jitter) while the socket is down, a slow safety net while it is up, 30 s when inactive
  useEffect(() => {
    if (state === 'loading') return;
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      const ms = state === 'inactive' ? INACTIVE_POLL_MS : connected ? SAFETY_POLL_MS : 4000 + Math.random() * 2000;
      t = setTimeout(async () => {
        await load();
        next();
      }, ms);
    };
    next();
    return () => clearTimeout(t);
  }, [state, connected, load]);

  // old PCs leak memory over a long day: start fresh every 6 hours
  useEffect(() => {
    const t = setTimeout(() => window.location.reload(), RELOAD_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(
    () => () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    },
    [],
  );

  return { board, state, connected, offset, online };
}
