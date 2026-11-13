import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { rpc, type FeatureFlagRow, type RemoteConfigRow } from '../lib/rpc';
import { errorText } from '../lib/errors';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';

const CONFIG_KEYS = ['sports', 'expire_options', 'limits', 'whats_new', 'tips', 'session_purposes'] as const;
const SEMVER = /^\d+\.\d+\.\d+$/;

export function Config() {
  const toast = useToast();
  const confirm = useConfirm();
  const [flags, setFlags] = useState<FeatureFlagRow[]>([]);
  const [configs, setConfigs] = useState<RemoteConfigRow[]>([]);
  const [recommended, setRecommended] = useState({ version: '', storeUrl: '', message: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [fKey, setFKey] = useState('');
  const [fEnabled, setFEnabled] = useState(true);
  const [fRollout, setFRollout] = useState('100');
  const [fMin, setFMin] = useState('');
  const [fPlat, setFPlat] = useState('');
  const [fDesc, setFDesc] = useState('');

  const [cKey, setCKey] = useState<(typeof CONFIG_KEYS)[number]>('sports');
  const [cText, setCText] = useState('');

  const load = useCallback(async () => {
    try {
      const [f, c, s] = await Promise.all([rpc.listFlags(), rpc.getRemoteConfig(), rpc.getSiteConfig()]);
      setFlags(f);
      setConfigs(c);
      const r = s.find((x) => x.key === 'recommended_app_version')?.value ?? {};
      setRecommended({
        version: typeof r.version === 'string' ? r.version : '',
        storeUrl: typeof r.store_url === 'string' ? r.store_url : '',
        message: typeof r.message === 'string' ? r.message : '',
      });
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const row = configs.find((c) => c.key === cKey);
    setCText(row ? JSON.stringify(row.value, null, 2) : '');
  }, [cKey, configs]);

  async function saveFlag(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await rpc.upsertFlag({
        key: fKey, enabled: fEnabled, rollout: Number(fRollout), minVersion: fMin,
        platforms: fPlat.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean), description: fDesc,
      });
      toast.success('Flag saved.');
      await load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeFlag(f: FeatureFlagRow) {
    const res = await confirm({
      title: `Delete flag “${f.key}”?`,
      body: 'Apps fall back to the default built into the code for this flag.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!res) return;
    try {
      await rpc.deleteFlag(f.key);
      await load();
    } catch (err) {
      toast.error(errorText(err));
    }
  }

  async function saveConfig(e: FormEvent) {
    e.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cText);
    } catch {
      toast.error('That is not valid JSON.');
      return;
    }
    const res = await confirm({
      title: `Publish “${cKey}”?`,
      body: 'Apps pick this up the next time they start. Invalid shapes are rejected by the server.',
      confirmLabel: 'Publish',
      askNote: true,
    });
    if (!res) return;
    setBusy(true);
    try {
      await rpc.setRemoteConfig(cKey, parsed, res.note);
      toast.success('Published.');
      await load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveRecommended(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await rpc.setRecommendedVersion(recommended.version, recommended.storeUrl, recommended.message);
      toast.success('Recommended version saved.');
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="error">{error}</p>;

  return (
    <>
      <h1>Flags &amp; config</h1>
      <p className="muted">Server-driven behaviour. Apps read this at startup; every value has a built-in fallback.</p>

      <h2>Feature flags</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Key</th><th>On</th><th>Rollout</th><th>Min version</th><th>Platforms</th><th /></tr></thead>
          <tbody>
            {flags.map((f) => (
              <tr key={f.key}>
                <td title={f.description ?? ''}>{f.key}</td><td>{f.enabled ? 'Yes' : 'No'}</td>
                <td>{f.rollout_percent}%</td><td>{f.min_app_version ?? '—'}</td>
                <td>{f.platforms.length ? f.platforms.join(', ') : 'all'}</td>
                <td>
                  <button className="btn" onClick={() => { setFKey(f.key); setFEnabled(f.enabled); setFRollout(String(f.rollout_percent)); setFMin(f.min_app_version ?? ''); setFPlat(f.platforms.join(', ')); setFDesc(f.description ?? ''); }}>Edit</button>{' '}
                  <button className="btn" onClick={() => void removeFlag(f)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card" onSubmit={saveFlag} style={{ marginTop: 16 }}>
        <div className="row">
          <label className="field"><span>Key</span><input value={fKey} onChange={(e) => setFKey(e.target.value.trim())} placeholder="my_feature" required /></label>
          <label className="field"><span>Rollout %</span><input type="number" min={0} max={100} value={fRollout} onChange={(e) => setFRollout(e.target.value)} /></label>
          <label className="field"><span>Min app version</span><input value={fMin} onChange={(e) => setFMin(e.target.value.trim())} placeholder="optional" /></label>
          <label className="field"><span>Platforms (comma, empty = all)</span><input value={fPlat} onChange={(e) => setFPlat(e.target.value)} placeholder="android, web" /></label>
        </div>
        <label className="field"><span>Description</span><input value={fDesc} onChange={(e) => setFDesc(e.target.value)} /></label>
        <label className="field"><span>
          <input type="checkbox" style={{ width: 'auto', marginRight: 8 }} checked={fEnabled} onChange={(e) => setFEnabled(e.target.checked)} />Enabled</span></label>
        <button className="btn btn-primary" disabled={busy || !fKey}>Save flag</button>
      </form>

      <h2>Remote lists &amp; content</h2>
      <form className="card" onSubmit={saveConfig}>
        <label className="field"><span>Config</span>
          <select value={cKey} onChange={(e) => setCKey(e.target.value as (typeof CONFIG_KEYS)[number])}>
            {CONFIG_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select></label>
        <label className="field"><span>JSON</span>
          <textarea style={{ minHeight: 280, fontFamily: 'monospace' }} value={cText} onChange={(e) => setCText(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={busy || !cText.trim()}>Publish</button>
      </form>

      <h2>Soft update prompt</h2>
      <form className="card" onSubmit={saveRecommended}>
        <p className="muted" style={{ marginTop: 0 }}>Shows a dismissible “Update available” banner to users below this version. Does not block anyone.</p>
        <div className="row">
          <label className="field"><span>Recommended version (x.y.z)</span><input value={recommended.version} onChange={(e) => setRecommended({ ...recommended, version: e.target.value.trim() })} /></label>
          <label className="field"><span>Store link (https://…)</span><input value={recommended.storeUrl} onChange={(e) => setRecommended({ ...recommended, storeUrl: e.target.value.trim() })} /></label>
        </div>
        <label className="field"><span>Message</span><input value={recommended.message} maxLength={300} onChange={(e) => setRecommended({ ...recommended, message: e.target.value })} /></label>
        <button className="btn btn-primary" disabled={busy || !SEMVER.test(recommended.version)}>Save</button>
      </form>
    </>
  );
}
