import type { LayoutMode } from '@live-engine';
import { useMemo, useState } from 'react';
import { makeDemoBoard } from './demo';
import { Mark } from './Mark';
import { supabase } from './supabase';
import { useProjector } from './useProjector';
import { useScreen } from './useScreen';
import { Waiting } from './Waiting';
import { Wall, type WallParams } from './Wall';

function readParams(): WallParams {
  const q = new URLSearchParams(window.location.search);
  const list = (k: string) => {
    const v = q.get(k);
    return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null;
  };
  const layout = q.get('layout');
  const max = Number(q.get('max'));
  return {
    courts: list('court'),
    match: q.get('match'),
    module: q.get('module'),
    layout: layout === 'row' || layout === 'grid' || layout === 'auto' ? (layout as LayoutMode) : null,
    max: max >= 1 && max <= 8 ? Math.round(max) : null,
  };
}

function Message({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="message">
      <h1>{title}</h1>
      {text ? <p>{text}</p> : null}
      {children}
      <Mark corner />
    </div>
  );
}

function Home() {
  const [code, setCode] = useState('');
  return (
    <Message title="Sportron Live" text="Enter the code from the organiser.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const c = code.trim().toLowerCase();
          if (c) window.location.assign(`/${encodeURIComponent(c)}`);
        }}
      >
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. k7m2qp" autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        <button type="submit">Open</button>
      </form>
    </Message>
  );
}

function Live({ code, params }: { code: string; params: WallParams }) {
  const { board, state, connected, offset, online } = useProjector(code);
  if (state === 'loading') return <Message title="Loading live scores…" />;
  if (state === 'inactive' || !board) {
    return <Message title="This screen isn’t active" text="Ask the organiser to check the link. This page keeps checking and will start by itself." />;
  }
  return <Wall board={board} offset={offset} status={connected ? 'live' : online ? 'polling' : 'offline'} params={params} />;
}

/** A permanent screen link (/s/<code>): nobody has to touch the TV between events. */
function Screen({ code, params }: { code: string; params: WallParams }) {
  const { data, loading, connected, offset, online } = useScreen(code);
  if (loading) return <Message title="Loading…" />;
  if (!data || !data.found) {
    return <Message title="This screen isn’t active" text="Check the link with the organiser. This page keeps checking and will start by itself." />;
  }
  if (data.waiting || !data.board || !data.board.active) return <Waiting data={data} />;
  return <Wall board={data.board} offset={offset} status={connected ? 'live' : online ? 'polling' : 'offline'} params={params} />;
}

function Demo({ params }: { params: WallParams }) {
  const board = useMemo(() => makeDemoBoard(), []);
  return <Wall board={board} offset={0} status="live" params={params} />;
}

export function App() {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  const params = useMemo(readParams, []);
  if (path === 'demo') return <Demo params={params} />;
  if (!path) return <Home />;
  if (!supabase) return <Message title="Not configured" text="Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for this deployment." />;
  // Tournament codes are at least 4 characters, so "s/<code>" can never be one.
  if (path.startsWith('s/')) return <Screen code={decodeURIComponent(path.slice(2))} params={params} />;
  return <Live code={decodeURIComponent(path)} params={params} />;
}
