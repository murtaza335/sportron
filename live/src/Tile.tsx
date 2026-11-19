import {
  formatClock,
  isStale,
  viewerElapsed,
  type CourtTile,
  type LiveDisplaySettings,
  type LiveMatch,
  type Side,
} from '@live-engine';
import { memo, type CSSProperties } from 'react';
import { useNow, useSize } from './hooks';

export interface TileProps {
  tile: CourtTile<LiveMatch>;
  /** Next scheduled match on this court (pinned idle tiles only). */
  next: LiveMatch | null;
  display: LiveDisplaySettings;
  offset: number;
  /** A finished match is still inside the "keep FINAL" window. */
  showFinal: boolean;
}

const fmtTime = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
};

function winnerOf(m: LiveMatch): Side | null {
  const snap = m.snapshot as { winner?: Side | null } | undefined;
  return snap?.winner ?? null;
}

function SideBlock({ m, side, big, name, winner, dim }: { m: LiveMatch; side: Side; big: number; name: number; winner: boolean; dim: boolean }) {
  const s = m.summary!;
  const e = side === 'a' ? m.a : m.b;
  const value = side === 'a' ? s.a : s.b;
  const mid = side === 'a' ? s.a_mid : s.b_mid;
  const subs = side === 'a' ? s.a_sub : s.b_sub;
  const extra = e?.fields?.map((f) => f.value).join(' · ');
  return (
    <div className={`side side-${side}${winner ? ' winner' : ''}${dim ? ' dim' : ''}`}>
      <div className="side-info">
        <div className="name" style={{ fontSize: name }}>
          <span className="name-text">{e?.name ?? (side === 'a' ? 'Side A' : 'Side B')}</span>
          {s.server === side ? <span className="serve" title="Serving" /> : null}
        </div>
        {extra ? <div className="extra" style={{ fontSize: name * 0.62 }}>{extra}</div> : null}
        {subs.length > 0 ? (
          <div className="subs" style={{ fontSize: name * 0.95 }}>
            {subs.slice(-6).map((x, i) => (
              <span key={i}>{x}</span>
            ))}
          </div>
        ) : null}
      </div>
      {mid != null ? <div className="mid" style={{ fontSize: name * 1.1 }}>{mid}</div> : null}
      <div className="big" style={{ fontSize: big }}>{value}</div>
    </div>
  );
}

function TileView({ tile, next, display, offset, showFinal }: TileProps) {
  const [ref, size] = useSize<HTMLDivElement>();
  const now = useNow();
  const m = tile.matches[0] as LiveMatch | undefined;
  const live = !!m && (m.state === 'live' || m.state === 'break');
  const final = !!m && m.state === 'finished' && showFinal;
  const wide = size.w >= size.h * 1.2;
  const big = wide ? Math.min(size.h * 0.5, size.w * 0.3) : Math.min(size.h * 0.22, size.w * 0.34);
  const name = Math.max(14, Math.min(size.h * 0.065, size.w * 0.07, 40));
  const style = { '--pad': `${Math.max(6, size.h * 0.02)}px` } as CSSProperties;

  if (!m || !m.summary || (!live && !final)) {
    return (
      <div className="tile idle" ref={ref} style={style}>
        {display.show_court && tile.court ? <div className="court">{tile.court}</div> : null}
        {next ? (
          <>
            <div className="idle-label">Next{tile.court ? ` on ${tile.court}` : ''}</div>
            <div className="idle-time">{fmtTime(next.scheduled_at)}</div>
            <div className="idle-names">
              {next.a?.name ?? 'TBD'} <span>vs</span> {next.b?.name ?? 'TBD'}
            </div>
          </>
        ) : (
          <div className="idle-label">{tile.court ? `${tile.court} · free` : 'Free'}</div>
        )}
      </div>
    );
  }

  const s = m.summary;
  const serverNow = now + offset;
  const clock = s.clock && live ? formatClock(viewerElapsed(s.clock, serverNow, m.updated_at ? Date.parse(m.updated_at) : serverNow), s.clock.dir, s.clock.limit_ms) : null;
  const stale = live && isStale(m, serverNow);
  const liveCount = tile.matches.filter((x) => x.state === 'live' || x.state === 'break').length;
  const w = final ? winnerOf(m) : null;
  const ctx = [m.module_name, m.round_name ?? m.code].filter(Boolean).join(' · ');

  return (
    <div className={`tile ${final ? 'final' : 'live'} ${wide ? 'wide' : 'tall'}`} ref={ref} style={style}>
      <div className="head">
        {display.show_court && tile.court ? <span className="court">{tile.court}</span> : null}
        <span className="ctx">{ctx}</span>
        <span className={`state ${final ? 'is-final' : s.state_label === 'LIVE' ? 'is-live' : 'is-break'}`}>
          {final ? 'FINAL' : s.state_label === 'LIVE' ? <><i className="pulse" />LIVE</> : s.state_label}
        </span>
        {clock ? <span className="clock">{clock}</span> : null}
      </div>
      <div className="sides">
        <SideBlock m={m} side="a" big={big} name={name} winner={w === 'a'} dim={!!w && w !== 'a'} />
        <SideBlock m={m} side="b" big={big} name={name} winner={w === 'b'} dim={!!w && w !== 'b'} />
      </div>
      <div className="foot" style={{ fontSize: Math.max(12, name * 0.8) }}>
        {s.line}
        {stale ? <em> · waiting for scorer</em> : null}
        {liveCount > 1 ? <em> · {liveCount} matches on this court</em> : null}
      </div>
    </div>
  );
}

/** Re-render a tile only when ITS match, its next-up or the display settings changed (the clock ticks inside). */
export const Tile = memo(
  TileView,
  (a, b) =>
    a.tile.key === b.tile.key &&
    a.tile.court === b.tile.court &&
    a.tile.matches.length === b.tile.matches.length &&
    a.tile.matches[0] === b.tile.matches[0] &&
    a.next === b.next &&
    a.display === b.display &&
    a.offset === b.offset &&
    a.showFinal === b.showFinal,
);
