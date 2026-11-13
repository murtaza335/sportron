import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { rpc, type BroadcastAudience, type BroadcastRow } from '../lib/rpc';
import { errorText } from '../lib/errors';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';

const SPORTS = [
  'table_tennis', 'badminton', 'tennis', 'squash', 'pickleball', 'football',
  'cricket', 'volleyball', 'handball', 'basketball', 'other',
];

export function Broadcasts() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<BroadcastRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [cta, setCta] = useState('');
  const [audience, setAudience] = useState<BroadcastAudience['audience']>('all');
  const [sport, setSport] = useState(SPORTS[0]);
  const [community, setCommunity] = useState('');
  const [count, setCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await rpc.listBroadcasts());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const target = (): BroadcastAudience => ({
    audience,
    sport: audience === 'sport' ? sport : null,
    community: audience === 'community' ? community.trim() : null,
  });

  // Changing the audience invalidates the previewed count.
  useEffect(() => { setCount(null); }, [audience, sport, community]);

  async function preview() {
    try {
      setCount(await rpc.countBroadcastAudience(target()));
    } catch (e) {
      setCount(null);
      toast.error(errorText(e));
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const n = await rpc.countBroadcastAudience(target());
      const res = await confirm({
        title: `Send to ${n} ${n === 1 ? 'person' : 'people'}?`,
        body: (
          <>
            <strong>{title}</strong>
            <br />
            {body}
            <br />
            This is a push notification and cannot be recalled.
          </>
        ),
        confirmLabel: 'Send now',
        destructive: true,
        askNote: true,
      });
      if (!res) return;
      const sent = await rpc.sendBroadcast({ ...target(), title: title.trim(), body: body.trim(), cta_url: cta.trim() || null, note: res.note });
      toast.success(`Sent to ${sent}.`);
      setTitle(''); setBody(''); setCta(''); setCount(null);
      await load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Broadcasts</h1>
      <p className="muted">
        Send a push notification (also saved in the Activity inbox) to everyone, to players interested in a sport,
        or to a community&apos;s members. Players who turned notifications off won&apos;t get the push.
      </p>
      <form className="card" onSubmit={send}>
        <label className="field"><span>Title (max 60)</span>
          <input value={title} maxLength={60} required onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field"><span>Message (max 240)</span>
          <textarea value={body} maxLength={240} required rows={3} onChange={(e) => setBody(e.target.value)} /></label>
        <label className="field"><span>Opens (optional: /tournament/… or https://…)</span>
          <input value={cta} maxLength={300} onChange={(e) => setCta(e.target.value)} /></label>
        <div className="row">
          <label className="field"><span>Audience</span>
            <select value={audience} onChange={(e) => setAudience(e.target.value as BroadcastAudience['audience'])}>
              <option value="all">Everyone</option>
              <option value="sport">Interested in a sport</option>
              <option value="community">A community&apos;s members</option>
            </select></label>
          {audience === 'sport' && (
            <label className="field"><span>Sport</span>
              <select value={sport} onChange={(e) => setSport(e.target.value)}>
                {SPORTS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select></label>
          )}
          {audience === 'community' && (
            <label className="field"><span>Community id</span>
              <input value={community} onChange={(e) => setCommunity(e.target.value)} placeholder="uuid" /></label>
          )}
        </div>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <button className="btn" type="button" disabled={busy} onClick={() => void preview()}>Preview audience</button>
          {count !== null && <span className="muted">{count} recipient{count === 1 ? '' : 's'}</span>}
          <button className="btn btn-primary" type="submit" disabled={busy || !title.trim() || !body.trim()}>Review &amp; send</button>
        </div>
      </form>

      <h2>History</h2>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Sent</th><th>Title</th><th>Audience</th><th>Recipients</th><th>By</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="muted">Nothing sent yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.title}<br /><span className="muted">{r.body}</span></td>
                <td>{r.audience}{r.sport ? `: ${r.sport.replace('_', ' ')}` : ''}</td>
                <td>{r.recipient_count}</td>
                <td>{r.created_by_username ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
