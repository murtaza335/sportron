/**
 * A ready-made username for the onboarding form, derived from the Google account, so most people just tap
 * Continue (guest mode, step 4). It only has to satisfy the CLIENT rule (3-20 of a-z 0-9 . _ -, ProfileForm) and
 * the server rule (migration 116: 3-30 of the same set, minus a few reserved words). Availability is still
 * checked live by the form, and the person can edit it freely. Pure; no React.
 */

const RESERVED = new Set(['admin', 'administrator', 'sportron', 'support', 'moderator', 'system', 't3s']);
const MAX = 20;

function slug(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents: "Zoë" -> "Zoe"
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/[._-]{2,}/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');
}

export function suggestUsername(meta: { full_name?: unknown; name?: unknown; email?: unknown } | null | undefined): string {
  const pick = (v: unknown) => (typeof v === 'string' ? v : '');
  const email = pick(meta?.email);
  const sources = [pick(meta?.full_name), pick(meta?.name), email.split('@')[0] ?? ''];

  let base = '';
  for (const src of sources) {
    const s = slug(src);
    if (s.length >= 3) {
      base = s;
      break;
    }
  }
  if (!base) base = 'player';
  base = base.slice(0, MAX).replace(/[._-]+$/g, '');
  if (base.length < 3) base = 'player';
  if (RESERVED.has(base)) base = `${base}_1`.slice(0, MAX);
  return base;
}
