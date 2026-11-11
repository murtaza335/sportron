// One place that maps database error codes (raised by the admin_* functions) to readable messages.

export class AdminError extends Error {
  code: string;
  field?: string;
  constructor(code: string, field?: string) {
    super(messageFor(code, field));
    this.code = code;
    this.field = field;
  }
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name must be 3–80 characters.',
  description: 'Description is too long (max 2000).',
  organization: 'Organization is too long (max 80).',
  location: 'Location is too long (max 120).',
  starts_at: 'Start date is not valid.',
  ends_at: 'End must be on or after the start.',
  status: 'Status cannot be changed here.',
  message: 'Message is required when enabling, and must be at most 300 characters.',
  min_version: 'Version must look like 1.2.3.',
  store_url: 'Store link must be empty or start with https://.',
  enabled: 'Invalid value.',
  settings: 'Invalid request.',
  title: 'Title is required (max 80).',
  body: 'Body is too long (max 400).',
  image_url: 'Image must be a Cloudinary (https://res.cloudinary.com/…) URL.',
  cta_label: 'Button label is too long (max 30).',
  cta_url: 'Button link must start with / (in-app) or https://.',
  placement: 'Invalid placement.',
  audience: 'Invalid audience.',
  platforms: 'Platforms must be android, ios or web.',
  max_shows: 'Max shows must be 1 or more.',
  data: 'Invalid request.',
  key: 'Key is not valid (lowercase letters, digits, underscore) or not allowed.',
  rollout_percent: 'Rollout must be 0–100.',
  value: 'Value is required.',
  sports: 'Sports list is invalid: each item needs key, label, kind (racket/team), tier (primary/more); keys must be unique and not "other".',
  tips: 'Tips must be a JSON object keyed by tip id.',
  whats_new: 'What\'s New must be {"version": "…", "items": [...]}.',
  limits: 'Limits must be a JSON object.',
  expire_options: 'Expire options must be a JSON array.',
  sport: 'Pick a sport.',
  community: 'Enter the id of an existing community.',
  session_purposes: 'Session purposes must be a JSON array.',
};

const CODES: Record<string, string> = {
  NOT_ALLOWED: 'You are not allowed to do this.',
  NOT_FOUND: 'Not found. It may have been removed.',
  INVALID_ROLE: 'Invalid role.',
  INVALID_STATUS: 'Invalid status.',
  INVALID_IMAGE_URL: 'The cover image must be uploaded through the site (Cloudinary).',
  CANNOT_CHANGE_SELF: 'You cannot change your own role. Ask another super admin.',
  NOT_COMPLETED: 'Only a completed module can be reopened.',
  TOURNAMENT_FINISHED: 'The tournament is completed or cancelled. Set it back to published or draft first.',
  AUDIENCE_EMPTY: 'Nobody matches that audience.',
  AUDIENCE_TOO_LARGE: 'That audience is over the 5,000 recipient limit. Narrow it down (a sport or a community).',
  CONFIRM_MISMATCH: 'The name you typed does not match.',
};

export function messageFor(code: string, field?: string): string {
  if (code === 'FIELD_INVALID') return (field && FIELD_LABELS[field]) || 'A field is not valid.';
  return CODES[code] ?? `Something went wrong (${code}).`;
}

/** Turns any thrown value from supabase.rpc into an AdminError with a readable message. */
export function toAdminError(err: { message?: string } | null | undefined): AdminError {
  const raw = (err?.message ?? '').trim();
  const [code, field] = raw.split(':');
  if (/^[A-Z_]+$/.test(code)) return new AdminError(code, field);
  return new AdminError(raw || 'UNKNOWN');
}

export function errorText(e: unknown): string {
  if (e instanceof AdminError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
