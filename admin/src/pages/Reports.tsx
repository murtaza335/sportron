import { useCallback, useEffect, useState } from 'react';
import {
  rpc,
  type ReportAction,
  type ReportQueueRow,
  type ReportStatus,
  type ReportTargetDetail,
} from '../lib/rpc';
import { errorText } from '../lib/errors';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';

const TYPE_LABEL: Record<string, string> = {
  session_message: 'Session chat message',
  community_message: 'Community chat message',
  community_post: 'Post',
  community_post_comment: 'Post comment',
  community_match: 'Match',
  community_match_comment: 'Match comment',
  profile: 'Profile',
  community: 'Community',
  session: 'Session',
  tournament: 'Tournament',
};
/** Types the panel can delete directly (matches/profiles/communities/sessions/tournaments are handled elsewhere). */
const REMOVABLE = new Set(['session_message', 'community_message', 'community_post', 'community_post_comment', 'community_match_comment']);

const REASON_LABEL: Record<string, string> = {
  spam: 'Spam', harassment: 'Harassment', hate: 'Hate speech', sexual: 'Sexual content', violence: 'Violence',
  impersonation: 'Impersonation', fake_result: 'Fake result', scam: 'Scam', other: 'Other',
};
const STATUSES: ReportStatus[] = ['open', 'actioned', 'dismissed'];
const LIMIT = 100;

type Content = Record<string, unknown> | null | undefined;
const str = (v: unknown) => (v == null || v === '' ? null : String(v));

/** One-line summary of a snapshot for the queue table. */
function snippet(type: string, c: Content): string {
  if (!c) return '—';
  switch (type) {
    case 'profile': return `@${str(c.username) ?? '?'}${str(c.bio) ? ` — ${str(c.bio)}` : ''}`;
    case 'community': case 'tournament': return str(c.name) ?? '—';
    case 'session': return str(c.title) ?? str(c.purpose) ?? '—';
    case 'community_match':
      return `${str(c.player_username) ?? '?'} ${str(c.player_score) ?? '?'}–${str(c.opponent_score) ?? '?'} ${str(c.opponent_username) ?? '?'}`;
    default: return str(c.content) ?? (str(c.image_url) ? '[photo]' : '—');
  }
}

function Rows({ c, skip }: { c: Content; skip?: string[] }) {
  if (!c) return <p className="muted">No content.</p>;
  const hidden = new Set(['context', 'image_url', 'avatar_url', ...(skip ?? [])]);
  return (
    <>
      {Object.entries(c).filter(([k, v]) => !hidden.has(k) && v != null && v !== '').map(([k, v]) => (
        <div key={k}><span className="muted">{k.replace(/_/g, ' ')}: </span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
      ))}
    </>
  );
}

function Content({ type, c }: { type: string; c: Content }) {
  if (!c) return <p className="muted">No content.</p>;
  const context = Array.isArray(c.context) ? (c.context as { sender_username?: string; content?: string; created_at?: string }[]) : [];
  const isChat = type === 'session_message' || type === 'community_message';
  return (
    <>
      {isChat ? (
        <div className="bubbles">
          {context.map((m, i) => (
            <div className="bubble" key={i}><small>{m.sender_username ?? '?'}</small>{m.content}</div>
          ))}
          <div className="bubble flagged">
            <small>{str(c.sender_username) ?? '?'} · {str(c.created_at) ? new Date(String(c.created_at)).toLocaleString() : ''}</small>
            {str(c.content)}
          </div>
        </div>
      ) : (
        <Rows c={c} />
      )}
      {typeof c.image_url === 'string' && c.image_url && <img className="thumb" src={c.image_url} alt="Reported" />}
      {typeof c.avatar_url === 'string' && c.avatar_url && type === 'profile' && <img className="thumb" src={c.avatar_url} alt="Avatar" style={{ maxHeight: 96 }} />}
    </>
  );
}

export function Reports() {
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<ReportStatus>('open');
  const [type, setType] = useState('');
  const [rows, setRows] = useState<ReportQueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ type: string; id: string } | null>(null);
  const [detail, setDetail] = useState<ReportTargetDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [action, setAction] = useState<ReportAction>('warned');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await rpc.listReports({ status, targetType: type || null, limit: LIMIT }));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, [status, type]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  useEffect(() => {
    setDetail(null);
    setDetailError(null);
    if (!selected) return;
    let active = true;
    rpc.getReportTarget(selected.type, selected.id)
      .then((d) => active && setDetail(d))
      .catch((e) => active && setDetailError(errorText(e)));
    return () => { active = false; };
  }, [selected]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      setSelected(null);
      await load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function dismiss() {
    if (!selected) return;
    const res = await confirm({ title: 'Dismiss these reports?', body: 'The content stays. All open reports on it are closed as dismissed.', confirmLabel: 'Dismiss', askNote: true });
    if (res) await run(() => rpc.resolveReports(selected.type, selected.id, 'dismissed', null, res.note), 'Reports dismissed.');
  }
  async function markActioned() {
    if (!selected) return;
    const res = await confirm({ title: 'Mark as actioned?', body: `Records "${action.replace('_', ' ')}" against all open reports on this item.`, confirmLabel: 'Mark actioned', askNote: true });
    if (res) await run(() => rpc.resolveReports(selected.type, selected.id, 'actioned', action, res.note), 'Marked as actioned.');
  }
  async function remove() {
    if (!selected) return;
    const res = await confirm({
      title: 'Remove this content?',
      body: 'It is deleted for everyone (open chats update live) and cannot be undone. The report keeps a copy for the record.',
      confirmLabel: 'Remove content',
      destructive: true,
      askNote: true,
    });
    if (res) await run(() => rpc.removeReportedContent(selected.type, selected.id, res.note), 'Content removed.');
  }

  const isOpen = status === 'open';
  const sel = selected && rows?.find((r) => r.target_type === selected.type && r.target_id === selected.id);

  return (
    <>
      <h1>Reports</h1>
      <div className="tabs" role="tablist">
        {STATUSES.map((s) => (
          <button key={s} role="tab" aria-selected={status === s} className="tab" onClick={() => { setStatus(s); setSelected(null); }}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <select value={type} onChange={(e) => { setType(e.target.value); setSelected(null); }} aria-label="Filter by type">
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn" onClick={() => void load()}>Refresh</button>
      </div>

      {error && <p className="error">{error}</p>}
      {!rows && !error && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="muted">Nothing here. {isOpen ? 'The queue is empty.' : ''}</p>}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Item</th><th>Content</th><th>Reports</th><th>Top reason</th><th>Owner</th><th>Last reported</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const active = selected?.type === r.target_type && selected.id === r.target_id;
                return (
                  <tr
                    key={`${r.target_type}:${r.target_id}`}
                    className="clickable"
                    aria-selected={active}
                    onClick={() => setSelected({ type: r.target_type, id: r.target_id })}
                  >
                    <td>{TYPE_LABEL[r.target_type] ?? r.target_type}</td>
                    <td className="snippet">{snippet(r.target_type, r.snapshot)}</td>
                    <td><strong>{Number(r.report_count)}</strong>{Number(r.reporter_count) !== Number(r.report_count) ? ` (${Number(r.reporter_count)} people)` : ''}</td>
                    <td>{REASON_LABEL[r.top_reason] ?? r.top_reason}</td>
                    <td>{r.owner_username ? `@${r.owner_username}` : '—'}</td>
                    <td>{new Date(r.last_reported).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows && rows.length >= LIMIT && <p className="muted">Showing the top {LIMIT}. Resolve some to see more.</p>}

      {selected && (
        <section className="detail" aria-label="Report detail">
          <h2>{TYPE_LABEL[selected.type] ?? selected.type}</h2>
          {detailError && <p className="error">{detailError}</p>}
          {!detail && !detailError && <p className="muted">Loading…</p>}
          {detail && (
            <>
              <div className="detail-grid">
                <div>
                  <h3>Reported content (snapshot)</h3>
                  <Content type={selected.type} c={detail.snapshot} />
                  <h3>Live now</h3>
                  {detail.live.deleted
                    ? <p className="muted">Deleted — it no longer exists in the app.</p>
                    : <Content type={selected.type} c={detail.live.content} />}
                </div>
                <div>
                  <h3>Owner</h3>
                  {detail.owner ? (
                    <p>
                      @{detail.owner.username ?? '?'}{detail.owner.deleted && <span className="chip" style={{ marginLeft: 8 }}>deleted account</span>}
                      <br />
                      <span className="muted">Joined {new Date(detail.owner.created_at).toLocaleDateString()}</span>
                    </p>
                  ) : <p className="muted">Unknown (system content).</p>}
                  {detail.owner_history && (
                    <p className="muted">
                      Report history for this person: {detail.owner_history.open} open · {detail.owner_history.actioned} actioned · {detail.owner_history.dismissed} dismissed
                    </p>
                  )}
                  <h3>Reports ({detail.reports.length})</h3>
                  {detail.reports.map((r) => (
                    <div className="report-item" key={r.id}>
                      <strong>{REASON_LABEL[r.reason] ?? r.reason}</strong>{' '}
                      <span className={`badge badge-${r.status}`}>{r.status}</span>
                      <div className="muted">by @{r.reporter_username ?? '?'} · {new Date(r.created_at).toLocaleString()}</div>
                      {r.details && <div>“{r.details}”</div>}
                      {r.status !== 'open' && (
                        <div className="muted">
                          {r.action_taken ? r.action_taken.replace('_', ' ') : ''}{r.resolution_note ? ` — ${r.resolution_note}` : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {isOpen && sel && (
                <div className="actions">
                  <button className="btn" disabled={busy} onClick={() => void dismiss()}>Dismiss</button>
                  {REMOVABLE.has(selected.type) && !detail.live.deleted && (
                    <button className="btn btn-danger" disabled={busy} onClick={() => void remove()}>Remove content</button>
                  )}
                  <span className="spacer" />
                  <select value={action} onChange={(e) => setAction(e.target.value as ReportAction)} style={{ width: 'auto' }} aria-label="Action taken">
                    <option value="warned">Warned the user</option>
                    <option value="content_removed">Content removed (elsewhere)</option>
                    <option value="other">Other action</option>
                  </select>
                  <button className="btn btn-primary" disabled={busy} onClick={() => void markActioned()}>Mark actioned</button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
