import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { rpc } from '../lib/rpc';
import { errorText } from '../lib/errors';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';

const SEMVER = /^\d+\.\d+\.\d+$/;

function cmp(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

export function Settings() {
  const toast = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mEnabled, setMEnabled] = useState(false);
  const [mMessage, setMMessage] = useState('');
  const [mSaved, setMSaved] = useState({ enabled: false, message: '' });

  const [vMin, setVMin] = useState('');
  const [vUrl, setVUrl] = useState('');
  const [vMsg, setVMsg] = useState('');
  const [vSavedMin, setVSavedMin] = useState('');

  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await rpc.getSiteConfig();
      const m = rows.find((r) => r.key === 'maintenance')?.value ?? {};
      const v = rows.find((r) => r.key === 'min_app_version')?.value ?? {};
      const enabled = m.enabled === true;
      const message = typeof m.message === 'string' ? m.message : '';
      setMEnabled(enabled);
      setMMessage(message);
      setMSaved({ enabled, message });
      const minV = typeof v.min_version === 'string' ? v.min_version : '';
      setVMin(minV);
      setVSavedMin(minV);
      setVUrl(typeof v.store_url === 'string' ? v.store_url : '');
      setVMsg(typeof v.message === 'string' ? v.message : '');
      setLoadError(null);
    } catch (e) {
      setLoadError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveMaintenance(e: FormEvent) {
    e.preventDefault();
    const turningOn = mEnabled && !mSaved.enabled;
    const res = await confirm({
      title: mEnabled ? (turningOn ? 'Turn maintenance ON?' : 'Update maintenance message?') : 'Turn maintenance OFF?',
      body: mEnabled
        ? 'Every app user will see the maintenance screen on their next launch and cannot use the app.'
        : 'App users can use the app again on their next launch.',
      confirmLabel: mEnabled ? 'Save' : 'Turn off',
      destructive: mEnabled,
      typeToConfirm: turningOn ? 'MAINTENANCE' : undefined,
      askNote: true,
    });
    if (!res) return;
    setBusy(true);
    try {
      await rpc.setMaintenance(mEnabled, mMessage, res.note);
      toast.success(mEnabled ? 'Maintenance is on.' : 'Maintenance is off.');
      await load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveVersion(e: FormEvent) {
    e.preventDefault();
    const raising = SEMVER.test(vMin) && SEMVER.test(vSavedMin) && cmp(vMin, vSavedMin) > 0;
    const res = await confirm({
      title: 'Save minimum app version?',
      body: (
        <>
          Users below <strong>{vMin || '…'}</strong> are locked out until they update.
          {raising && ' You are raising the minimum, so make sure the Play Store update is live first.'}
        </>
      ),
      confirmLabel: 'Save',
      destructive: raising,
      typeToConfirm: raising ? vMin : undefined,
      askNote: true,
    });
    if (!res) return;
    setBusy(true);
    try {
      await rpc.setMinAppVersion(vMin, vUrl, vMsg, res.note);
      toast.success('Minimum version saved.');
      await load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (loadError) return <p className="error">{loadError}</p>;

  const appVersion = __APP_VERSION__;
  const aboveCurrent = SEMVER.test(vMin) && appVersion && SEMVER.test(appVersion) && cmp(vMin, appVersion) > 0;

  return (
    <>
      <h1>Settings</h1>
      <p className="muted">Changes reach app users on their next launch (the app only checks at startup).</p>

      <h2>Maintenance</h2>
      <form className="card" onSubmit={saveMaintenance}>
        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={mEnabled}
              onChange={(e) => setMEnabled(e.target.checked)}
              style={{ width: 'auto', marginRight: 8 }}
            />
            Maintenance mode is {mEnabled ? 'ON' : 'off'}
          </span>
        </label>
        <label className="field">
          <span>Message shown to users (required when on, max 300)</span>
          <textarea value={mMessage} maxLength={300} onChange={(e) => setMMessage(e.target.value)} />
        </label>
        {mEnabled && (
          <div className="preview">
            <strong>Users will see:</strong>
            <p style={{ margin: '4px 0 0' }}>{mMessage.trim() || '(empty: a message is required)'}</p>
          </div>
        )}
        <button
          className="btn btn-primary"
          disabled={busy || (mEnabled === mSaved.enabled && mMessage === mSaved.message) || (mEnabled && !mMessage.trim())}
        >
          Save maintenance
        </button>
      </form>

      <h2>Minimum app version</h2>
      <form className="card" onSubmit={saveVersion}>
        <p className="muted" style={{ marginTop: 0 }}>
          Current in this repo&apos;s app.json: <strong>{appVersion || 'unknown'}</strong>. Saved minimum:{' '}
          <strong>{vSavedMin || 'none'}</strong>.
        </p>
        <div className="row">
          <label className="field">
            <span>Minimum version (x.y.z)</span>
            <input value={vMin} onChange={(e) => setVMin(e.target.value.trim())} placeholder="1.0.1" />
          </label>
          <label className="field">
            <span>Store link (https://…, optional)</span>
            <input value={vUrl} onChange={(e) => setVUrl(e.target.value.trim())} placeholder="https://play.google.com/…" />
          </label>
        </div>
        <label className="field">
          <span>Message (max 300)</span>
          <textarea value={vMsg} maxLength={300} onChange={(e) => setVMsg(e.target.value)} />
        </label>
        {aboveCurrent && (
          <div className="banner banner-warn">
            This is higher than the version in this repo ({appVersion}). Users below {vMin} are locked out until the
            Play Store update is live.
          </div>
        )}
        <button className="btn btn-primary" disabled={busy || !SEMVER.test(vMin)}>
          Save minimum version
        </button>
      </form>
    </>
  );
}
