import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { rpc, type AnnouncementPatch, type AnnouncementPlacement, type AnnouncementRow } from '../lib/rpc';
import { errorText } from '../lib/errors';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';

const PLACEMENTS: { value: AnnouncementPlacement; label: string }[] = [
  { value: 'app_open_modal', label: 'Pop-up when the app opens' },
  { value: 'home_banner', label: 'Banner on Communities (home)' },
  { value: 'tournaments_banner', label: 'Banner on Tournaments' },
  { value: 'sessions_banner', label: 'Banner on Sessions' },
];

// <input type="datetime-local"> works in local time; the API wants ISO.
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

type Form = {
  title: string;
  body: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
  placement: AnnouncementPlacement;
  android: boolean;
  ios: boolean;
  web: boolean;
  min_app_version: string;
  max_app_version: string;
  audience: 'all' | 'new_users';
  starts_at: string;
  ends_at: string;
  priority: string;
  dismissible: boolean;
  max_shows: string;
};

const EMPTY: Form = {
  title: '', body: '', image_url: '', cta_label: '', cta_url: '', placement: 'home_banner',
  android: false, ios: false, web: false, min_app_version: '', max_app_version: '', audience: 'all',
  starts_at: '', ends_at: '', priority: '0', dismissible: true, max_shows: '',
};

function fromRow(a: AnnouncementRow): Form {
  return {
    title: a.title, body: a.body ?? '', image_url: a.image_url ?? '', cta_label: a.cta_label ?? '',
    cta_url: a.cta_url ?? '', placement: a.placement,
    android: a.platforms.includes('android'), ios: a.platforms.includes('ios'), web: a.platforms.includes('web'),
    min_app_version: a.min_app_version ?? '', max_app_version: a.max_app_version ?? '', audience: a.audience,
    starts_at: toLocal(a.starts_at), ends_at: toLocal(a.ends_at), priority: String(a.priority),
    dismissible: a.dismissible, max_shows: a.max_shows == null ? '' : String(a.max_shows),
  };
}

function toPatch(f: Form): AnnouncementPatch {
  return {
    title: f.title, body: f.body || null, image_url: f.image_url || null,
    cta_label: f.cta_label || null, cta_url: f.cta_url || null, placement: f.placement,
    platforms: (['android', 'ios', 'web'] as const).filter((p) => f[p]),
    min_app_version: f.min_app_version || null, max_app_version: f.max_app_version || null,
    audience: f.audience,
    starts_at: toIso(f.starts_at) ?? undefined, ends_at: toIso(f.ends_at),
    priority: Number(f.priority) || 0, dismissible: f.dismissible,
    max_shows: f.max_shows ? Number(f.max_shows) : null,
  };
}

function status(a: AnnouncementRow): string {
  if (!a.is_active) return 'Ended';
  const now = Date.now();
  if (new Date(a.starts_at).getTime() > now) return 'Scheduled';
  if (a.ends_at && new Date(a.ends_at).getTime() <= now) return 'Ended';
  return 'Live';
}

export function Announcements() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await rpc.listAnnouncements());
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing === 'new') await rpc.createAnnouncement(toPatch(form));
      else if (editing) await rpc.updateAnnouncement(editing, toPatch(form));
      toast.success('Announcement saved.');
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function end(a: AnnouncementRow) {
    const res = await confirm({
      title: 'End this announcement?',
      body: <>“{a.title}” stops showing to everyone on their next app load.</>,
      confirmLabel: 'End it',
      destructive: true,
    });
    if (!res) return;
    try {
      await rpc.endAnnouncement(a.id);
      toast.success('Announcement ended.');
      await load();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="error">{error}</p>;

  if (editing) {
    return (
      <>
        <h1>{editing === 'new' ? 'New announcement' : 'Edit announcement'}</h1>
        <form className="card" onSubmit={save}>
          <label className="field"><span>Title (max 80)</span>
            <input value={form.title} maxLength={80} onChange={(e) => set('title', e.target.value)} required /></label>
          <label className="field"><span>Body (max 400)</span>
            <textarea value={form.body} maxLength={400} onChange={(e) => set('body', e.target.value)} /></label>
          <label className="field"><span>Image URL (Cloudinary, optional)</span>
            <input value={form.image_url} onChange={(e) => set('image_url', e.target.value.trim())} placeholder="https://res.cloudinary.com/…" /></label>
          <div className="row">
            <label className="field"><span>Button label (max 30)</span>
              <input value={form.cta_label} maxLength={30} onChange={(e) => set('cta_label', e.target.value)} /></label>
            <label className="field"><span>Button link (/tournament/… or https://…)</span>
              <input value={form.cta_url} onChange={(e) => set('cta_url', e.target.value.trim())} /></label>
          </div>
          <label className="field"><span>Where it shows</span>
            <select value={form.placement} onChange={(e) => set('placement', e.target.value as AnnouncementPlacement)}>
              {PLACEMENTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select></label>
          <div className="field"><span>Platforms (none ticked = all)</span>
            {(['android', 'ios', 'web'] as const).map((p) => (
              <label key={p} style={{ marginRight: 16 }}>
                <input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={form[p]} onChange={(e) => set(p, e.target.checked)} />{p}
              </label>
            ))}
          </div>
          <div className="row">
            <label className="field"><span>Min app version (optional)</span>
              <input value={form.min_app_version} onChange={(e) => set('min_app_version', e.target.value.trim())} placeholder="1.0.2" /></label>
            <label className="field"><span>Max app version (optional)</span>
              <input value={form.max_app_version} onChange={(e) => set('max_app_version', e.target.value.trim())} /></label>
          </div>
          <div className="row">
            <label className="field"><span>Starts</span>
              <input type="datetime-local" value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} /></label>
            <label className="field"><span>Ends (optional)</span>
              <input type="datetime-local" value={form.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></label>
          </div>
          <div className="row">
            <label className="field"><span>Audience</span>
              <select value={form.audience} onChange={(e) => set('audience', e.target.value as 'all' | 'new_users')}>
                <option value="all">Everyone</option><option value="new_users">New users (first 7 days)</option>
              </select></label>
            <label className="field"><span>Priority (higher shows first)</span>
              <input type="number" value={form.priority} onChange={(e) => set('priority', e.target.value)} /></label>
            <label className="field"><span>Max shows per device (optional)</span>
              <input type="number" min={1} value={form.max_shows} onChange={(e) => set('max_shows', e.target.value)} /></label>
          </div>
          <label className="field"><span>
            <input type="checkbox" style={{ width: 'auto', marginRight: 8 }} checked={form.dismissible} onChange={(e) => set('dismissible', e.target.checked)} />
            Users can dismiss it</span></label>
          <div className="preview">
            <strong>Preview</strong>
            {form.image_url && <img src={form.image_url} alt="" style={{ display: 'block', maxWidth: 320, borderRadius: 8, margin: '8px 0' }} />}
            <p style={{ margin: '4px 0', fontWeight: 700 }}>{form.title || '(title)'}</p>
            <p className="muted" style={{ margin: 0 }}>{form.body}</p>
            {form.cta_label && <button type="button" className="btn" style={{ marginTop: 8 }}>{form.cta_label}</button>}
          </div>
          <div className="row">
            <button className="btn btn-primary" disabled={busy || !form.title.trim()}>Save</button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      </>
    );
  }

  return (
    <>
      <h1>Announcements</h1>
      <p className="muted">Banners and pop-ups shown inside the app. Changes reach users on their next app load.</p>
      <button className="btn btn-primary" onClick={() => { setForm({ ...EMPTY, starts_at: toLocal(new Date().toISOString()) }); setEditing('new'); }}>
        New announcement
      </button>
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table>
          <thead><tr><th>Title</th><th>Where</th><th>Status</th><th>Views</th><th>Clicks</th><th>Dismissed</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No announcements yet.</td></tr>}
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{a.title}</td>
                <td>{PLACEMENTS.find((p) => p.value === a.placement)?.label}</td>
                <td>{status(a)}</td>
                <td>{a.views}</td><td>{a.clicks}</td><td>{a.dismissals}</td>
                <td>
                  <button className="btn" onClick={() => { setForm(fromRow(a)); setEditing(a.id); }}>Edit</button>{' '}
                  {status(a) !== 'Ended' && <button className="btn" onClick={() => void end(a)}>End</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
