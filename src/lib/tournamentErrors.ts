/** Maps tournament RPC error codes (RAISE EXCEPTION 'CODE[:key]') to friendly copy (PLAN §10.3). */

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  cms_id: 'CMS ID',
  school: 'School',
  phone: 'Phone',
  email: 'Email',
  score: 'Score',
  winner: 'Winner',
  custom_sport_name: 'Sport name',
  sport_key: 'Sport',
  scoring_mode: 'Scoring',
};

/** "@2" → "Player 3: " (the server index is 0-based). */
function playerPrefix(index: string | undefined): string {
  return index === undefined ? '' : `Player ${Number(index) + 1}: `;
}

/** Extracts the 0-based player index from an `@i` suffix, or null. */
export function playerIndexFromError(err: unknown): number | null {
  const raw =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : '';
  const m = raw.match(/@(\d+)/);
  return m ? Number(m[1]) : null;
}

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

  if (message.includes('PGRST202') || message.includes('Could not find the function'))
    return 'This action needs a server update. Please try again later.';

  // Roster errors may carry a 0-based player index: FIELD_REQUIRED:cms_id@2 → "Player 3: CMS ID is required."
  const fieldRequired = message.match(/FIELD_REQUIRED:([a-z0-9_]+)(?:@(\d+))?/);
  if (fieldRequired) {
    return `${playerPrefix(fieldRequired[2])}${prettyKey(fieldRequired[1], labels)} is required.`;
  }
  const fieldInvalid = message.match(/FIELD_INVALID:([a-z0-9_]+)(?:@(\d+))?/);
  if (fieldInvalid) {
    return `${playerPrefix(fieldInvalid[2])}${prettyKey(fieldInvalid[1], labels)} looks invalid.`;
  }
  const dupCms = message.match(/DUPLICATE_MEMBER_CMS_ID(?:@(\d+))?/);
  if (dupCms) {
    return `${playerPrefix(dupCms[1])}A player with this CMS ID is already on a team in this module.`;
  }
  const dupProfile = message.match(/DUPLICATE_MEMBER_PROFILE(?:@(\d+))?/);
  if (dupProfile) {
    return `${playerPrefix(dupProfile[1])}This user is already on a team in this module.`;
  }
  if (message.includes('WRONG_PARTICIPANT_TYPE'))
    return "This module's players don't match that entry type (teams vs individuals).";
  if (message.includes('ROSTER_INCOMPLETE')) return "Some teams don't have enough players yet.";
  if (message.includes('ROSTER_TOO_LARGE')) return 'This team has more players than allowed.';
  if (message.includes('DUPLICATE_SQUAD_NUMBER')) return 'Two players have the same squad number.';

  if (message.includes('PROMO_CODE_INVALID')) return 'The discount code must be exactly 6 digits.';
  if (message.includes('CUSTOM_SPORT_REQUIRED')) return 'Enter the exact sport name.';
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
  if (message.includes('NOT_ENOUGH_ENTRIES')) return 'Not enough entries for this format yet.';
  if (message.includes('TOO_MANY_ENTRIES')) return 'Too many entries for this format.';
  if (message.includes('GROUPS_NOT_FINISHED')) return 'Finish all group matches first.';
  if (message.includes('STAGE_LOCKED'))
    return 'The knockout has been built — group results are locked. Undo the knockout first.';
  if (message.includes('CORE_FIELD_LOCKED')) return "Core fields can't be removed.";
  if (message.includes('NOT_FOUND')) return "We couldn't find that.";

  return message || 'Something went wrong. Please try again.';
}
