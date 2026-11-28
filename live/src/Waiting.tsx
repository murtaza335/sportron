import type { ScreenBoard } from '@live-engine';
import { useIdleCursor, useWakeLock } from './hooks';
import { Mark } from './Mark';

function when(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

/** What a screen shows between events. */
export function Waiting({ data }: { data: ScreenBoard }) {
  useWakeLock();
  useIdleCursor();
  return (
    <div className="message waiting">
      <h1>{data.org?.short_name || data.org?.name}</h1>
      <div className="waiting-brand">
        <Mark />
      </div>
      {data.next ? (
        <p>
          Next on this screen: <b>{data.next.name}</b>
          <br />
          {when(data.next.starts_at)}
        </p>
      ) : (
        <p>No live event right now</p>
      )}
      <small>{data.screen?.name}</small>
    </div>
  );
}
