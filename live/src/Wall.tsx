import {
  buildTiles,
  compareCourts,
  courtKey,
  gridFor,
  paginate,
  resolveLiveDisplay,
  type LayoutMode,
  type LiveBoard,
  type LiveMatch,
} from '@live-engine';
import { useEffect, useMemo, useState } from 'react';
import { useAspect, useIdleCursor, useNow, useWakeLock } from './hooks';
import { Mark } from './Mark';
import { Qr } from './Qr';
import { Tile } from './Tile';

export interface WallParams {
  courts: string[] | null;
  match: string | null;
  module: string | null;
  layout: LayoutMode | null;
  max: number | null;
}

const ROTATE_MS = 15_000;

function resultText(m: LiveMatch): string {
  const s = m.summary;
  return s ? `${m.a?.name ?? ''} ${s.a}–${s.b} ${m.b?.name ?? ''}` : '';
}

const clockTime = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function Wall({ board, offset, status, params }: { board: LiveBoard; offset: number; status: 'live' | 'polling' | 'offline'; params: WallParams }) {
  const now = useNow();
  const aspect = useAspect();
  useWakeLock();
  useIdleCursor();
  const display = useMemo(() => resolveLiveDisplay(board.display), [board.display]);
  const holdMs = display.final_hold_seconds * 1000;
  const serverNow = now + offset;

  // 1. everything that deserves a tile: live matches + finished ones still inside the "keep FINAL" window
  const items = [
    ...board.live,
    ...board.recent.filter((m) => m.finished_at && serverNow - Date.parse(m.finished_at) < holdMs),
  ].filter((m) => (!params.module || m.module_id === params.module) && (!params.match || m.match_id === params.match));

  // 2. tiles in screen order (pinned courts keep their place all day)
  const pinned = params.courts ?? display.courts;
  const built = buildTiles(items, pinned, courtKey, compareCourts);
  const tiles = params.courts
    ? built.filter((t) => params.courts!.some((c) => courtKey(c) === t.key))
    : params.match
      ? built.filter((t) => t.matches.length > 0)
      : built;

  // 3. pages
  const { pages, perPage } = paginate(tiles, params.max ?? display.max_per_page);
  const [page, setPage] = useState(0);
  const pageCount = pages.length;
  useEffect(() => {
    if (pageCount <= 1) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pageCount), ROTATE_MS);
    return () => clearInterval(t);
  }, [pageCount]);
  const current = pages[Math.min(page, pageCount - 1)] ?? [];
  const mode = params.layout ?? display.layout;
  const g = gridFor(Math.max(1, current.length), mode, aspect);

  const nextFor = (key: string): LiveMatch | null => board.up_next.find((m) => courtKey(m.court) === key) ?? null;
  const showFinal = (m?: LiveMatch) => !!m && m.state === 'finished' && !!m.finished_at && serverNow - Date.parse(m.finished_at) < holdMs;

  const title = board.tournament?.name ?? 'Live';
  const upNext = display.show_up_next ? board.up_next.slice(0, 4) : [];
  const results = display.show_recent ? board.recent.slice(0, 3) : [];
  const promo = (display.show_app_promo || board.brand?.locked) && board.app_link;
  const compact = tiles.length >= 5;

  return (
    <div className={`wall${compact ? ' compact' : ''}`}>
      <header>
        <h1>{title}</h1>
        <div className="head-right">
          <Mark />
          {pageCount > 1 ? (
            <span className="dots" aria-label={`Page ${page + 1} of ${pageCount}`}>
              {pages.map((_, i) => (
                <i key={i} className={i === page ? 'on' : ''} />
              ))}
            </span>
          ) : null}
          <span className={`status ${status}`} title={status === 'live' ? 'Connected' : status === 'polling' ? 'Reconnecting…' : 'Offline — showing the last scores'} />
        </div>
      </header>

      {tiles.length === 0 ? (
        <div className="empty">
          <div>No live matches right now</div>
          <small>Scores appear here the moment a referee starts a match.</small>
        </div>
      ) : (
        <main className="grid" style={{ gridTemplateColumns: `repeat(${g.cols}, 1fr)`, gridTemplateRows: `repeat(${g.rows}, 1fr)` }}>
          {current.map((t) => (
            <Tile key={t.key} tile={t} next={t.pinned || !t.matches.length ? nextFor(t.key) : null} display={display} offset={offset} showFinal={showFinal(t.matches[0])} />
          ))}
        </main>
      )}

      {perPage > 0 && (upNext.length > 0 || results.length > 0 || promo) ? (
        <footer>
          <div className="strip">
            {upNext.length > 0 ? (
              <div className="strip-block">
                <b>Up next</b>
                {upNext.map((m) => (
                  <span key={m.match_id}>
                    {m.court ? `${m.court} · ` : ''}
                    {clockTime(m.scheduled_at)} {m.a?.name ?? 'TBD'} vs {m.b?.name ?? 'TBD'}
                  </span>
                ))}
              </div>
            ) : null}
            {results.length > 0 ? (
              <div className="strip-block">
                <b>Results</b>
                {results.map((m) => (
                  <span key={m.match_id}>{resultText(m)}</span>
                ))}
              </div>
            ) : null}
          </div>
          {promo ? (
            <div className="promo">
              <span>
                Follow live in the
                <br />
                <b>Sportron</b> app
              </span>
              <Qr text={board.app_link!} size={compact ? 52 : 72} />
            </div>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}
