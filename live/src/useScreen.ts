import { applyScoreEvent, type LiveScoreEvent, type ScreenBoard } from '@live-engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

const POLL_MS = 20_000;
const RELOAD_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * A screen link: re-reads its assignment every ~20 s, hears about re-assignments on `screen:<code>` and
 * about points on the assigned tournament's `live:<code>`. Like the projector, it never shows an error
 * page — it keeps the last picture and retries.
 */
export function useScreen(code: string) {
  const [data, setData] = useState<ScreenBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(true);
  const [offset, setOffset] = useState(0);
  const ref = useRef<ScreenBoard | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // matches on courts this screen doesn't show: their points must not trigger re-reads
  const ignored = useRef(new Set<string>());
  const unknown = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data: raw, error } = await supabase.rpc('get_screen_board', { p_code: code });
      if (error) throw error;
      const next = raw as ScreenBoard;
      const shown = next.board?.live ?? [];
      unknown.current.forEach((id) => {
        if (!shown.some((m) => m.match_id === id)) ignored.current.add(id);
      });
      unknown.current.clear();
      ref.current = next;
      setData(next);
      setOffset(Date.parse(next.server_now) - Date.now());
      setOnline(true);
      setLoading(false);
    } catch {
      setOnline(false); // keep showing the last picture
    }
  }, [code]);

  const scheduleRefetch = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void load();
    }, 500);
  }, [load]);

  const reassigned = useCallback(() => {
    ignored.current.clear();
    scheduleRefetch();
  }, [scheduleRefetch]);

  useEffect(() => {
    void load();
    let t: ReturnType<typeof setTimeout>;
    const next = () => {
      t = setTimeout(async () => {
        await load();
        next();
      }, POLL_MS + Math.random() * 2000);
    };
    next();
    return () => clearTimeout(t);
  }, [load]);

  // assignment changes
  const found = !!data?.found;
  useEffect(() => {
    if (!supabase || !found) return;
    const channel = supabase
      .channel(`screen:${code.toLowerCase()}`, { config: { private: true } })
      .on('broadcast', { event: 'assigned' }, reassigned)
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [code, found, reassigned]);

  // points of the assigned tournament
  const liveCode = data && !data.waiting ? (data.live_code ?? null) : null;
  useEffect(() => {
    if (!supabase || !liveCode) return;
    const channel = supabase
      .channel(`live:${liveCode.toLowerCase()}`, { config: { private: true } })
      .on('broadcast', { event: 'score' }, (msg) => {
        const ev = msg.payload as LiveScoreEvent | undefined;
        const cur = ref.current;
        if (!ev || !cur?.board || ignored.current.has(ev.match_id)) return;
        const r = applyScoreEvent(cur.board, ev);
        if (r.board !== cur.board) {
          const next = { ...cur, board: r.board };
          ref.current = next;
          setData(next);
        }
        if (r.refetch) {
          if (cur.screen?.courts && !cur.board.live.some((m) => m.match_id === ev.match_id)) {
            unknown.current.add(ev.match_id);
          }
          scheduleRefetch();
        }
      })
      .on('broadcast', { event: 'config' }, reassigned)
      .subscribe((status) => {
        const ok = status === 'SUBSCRIBED';
        setConnected(ok);
        if (ok) scheduleRefetch();
      });
    return () => {
      setConnected(false);
      void supabase?.removeChannel(channel);
    };
  }, [liveCode, scheduleRefetch, reassigned]);

  // old PCs leak memory over a long day: start fresh every 6 hours
  useEffect(() => {
    const t = setTimeout(() => window.location.reload(), RELOAD_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { data, loading, connected, offset, online };
}
