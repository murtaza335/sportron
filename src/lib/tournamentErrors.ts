/** Maps tournament RPC error codes (RAISE EXCEPTION 'CODE[:key]') to friendly copy (PLAN §10.3). */

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  cms_id: 'CMS ID',
  school: 'School',
  phone: 'Phone',
  email: 'Email',
  score: 'Score',
  winner: 'Winner',
};

function prettyKey(key: string, labels?: Record<string, string>): string {
  if (labels?.[key]) return labels[key];
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const spaced = key.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * @param labels optional map of field key → label (e.g. from the tournament's entry form)
 */
export function friendlyTournamentError(err: unknown, labels?: Record<string, string>): string {
  const raw =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : '';
  const message = raw.trim();

  const fieldRequired = message.match(/FIELD_REQUIRED:([a-z0-9_]+)/);
  if (fieldRequired) return `${prettyKey(fieldRequired[1], labels)} is required.`;
  const fieldInvalid = message.match(/FIELD_INVALID:([a-z0-9_]+)/);
  if (fieldInvalid) return `${prettyKey(fieldInvalid[1], labels)} looks invalid.`;

  if (message.includes('NOT_ALLOWED')) return "You don't have permission to do that.";
  if (message.includes('INVALID_STATUS')) return "That isn't possible at this stage.";
  if (message.includes('DUPLICATE_CMS_ID'))
    return 'An entry with this CMS ID already exists in this module.';
  if (message.includes('DUPLICATE_PROFILE')) return 'This user already has an entry in this module.';
  if (message.includes('DUPLICATE_FIELD_KEY')) return 'A field with this name already exists.';
  if (message.includes('MAX_ENTRIES')) return 'This module is full.';
  if (message.includes('TIE_NEEDS_WINNER')) return 'Scores are level — pick the winner.';
  if (message.includes('DOWNSTREAM_PLAYED'))
    return 'The next match has already been played. Reset it first.';
  if (message.includes('NOT_ENOUGH_ENTRIES')) return 'Add at least 2 entries first.';
  if (message.includes('CORE_FIELD_LOCKED')) return "Core fields can't be removed.";
  if (message.includes('NOT_FOUND')) return "We couldn't find that.";

  return message || 'Something went wrong. Please try again.';
}
