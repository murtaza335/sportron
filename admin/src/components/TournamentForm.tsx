import { useState, type FormEvent } from 'react';
import type { TournamentPatch } from '../lib/rpc';
import { cloudinaryConfigured, uploadImage } from '../lib/cloudinary';
import { errorText } from '../lib/errors';

export interface TournamentFormValues {
  name: string;
  description: string;
  organization: string;
  location: string;
  image_url: string;
  starts_at: string; // datetime-local value or ''
  ends_at: string;
}

export const EMPTY_FORM: TournamentFormValues = {
  name: '', description: '', organization: '', location: '', image_url: '', starts_at: '', ends_at: '',
};

export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toPatch(v: TournamentFormValues): TournamentPatch {
  return {
    name: v.name.trim(),
    description: v.description.trim() || null,
    organization: v.organization.trim() || null,
    location: v.location.trim() || null,
    image_url: v.image_url.trim() || null,
    starts_at: v.starts_at ? new Date(v.starts_at).toISOString() : null,
    ends_at: v.ends_at ? new Date(v.ends_at).toISOString() : null,
  };
}

export function TournamentForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
}: {
  initial: TournamentFormValues;
  submitLabel: string;
  busy: boolean;
  onSubmit: (v: TournamentFormValues) => void;
}) {
  const [v, setV] = useState(initial);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const set = (k: keyof TournamentFormValues) => (e: { target: { value: string } }) =>
    setV((cur) => ({ ...cur, [k]: e.target.value }));

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadImage(file);
      setV((cur) => ({ ...cur, image_url: url }));
    } catch (e) {
      setUploadError(errorText(e));
    } finally {
      setUploading(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit(v);
  }

  const nameOk = v.name.trim().length >= 3 && v.name.trim().length <= 80;

  return (
    <form className="card" onSubmit={submit}>
      <label className="field">
        <span>Name (3–80)</span>
        <input value={v.name} onChange={set('name')} maxLength={80} required />
      </label>
      <label className="field">
        <span>Description (max 2000)</span>
        <textarea value={v.description} onChange={set('description')} maxLength={2000} />
      </label>
      <div className="row">
        <label className="field">
          <span>Organization (max 80)</span>
          <input value={v.organization} onChange={set('organization')} maxLength={80} />
        </label>
        <label className="field">
          <span>Location (max 120)</span>
          <input value={v.location} onChange={set('location')} maxLength={120} />
        </label>
      </div>
      <div className="row">
        <label className="field">
          <span>Starts</span>
          <input type="datetime-local" value={v.starts_at} onChange={set('starts_at')} />
        </label>
        <label className="field">
          <span>Ends</span>
          <input type="datetime-local" value={v.ends_at} onChange={set('ends_at')} />
        </label>
      </div>
      <div className="field">
        <span>Cover image</span>
        {v.image_url && <img className="cover" src={v.image_url} alt="Cover" />}
        {cloudinaryConfigured ? (
          <input type="file" accept="image/*" disabled={uploading} onChange={(e) => void onFile(e.target.files?.[0])} />
        ) : (
          <span className="muted">Uploads are disabled: set VITE_CLOUDINARY_* in admin/.env.</span>
        )}
        {uploading && <span className="muted">Uploading…</span>}
        {uploadError && <span className="error">{uploadError}</span>}
        {v.image_url && (
          <button type="button" className="btn btn-sm" onClick={() => setV((c) => ({ ...c, image_url: '' }))}>
            Remove cover
          </button>
        )}
      </div>
      <button className="btn btn-primary" disabled={busy || uploading || !nameOk}>
        {submitLabel}
      </button>
    </form>
  );
}
