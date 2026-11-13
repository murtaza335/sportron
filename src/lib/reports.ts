/** Reporting: target/reason types, per-target reason lists and RPC error-code → copy (docs/reporting/PLAN.md §5). */

export type ReportTargetType =
  | 'session_message'
  | 'community_message'
  | 'community_post'
  | 'community_post_comment'
  | 'community_match'
  | 'community_match_comment'
  | 'profile'
  | 'community'
  | 'session'
  | 'tournament';

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate'
  | 'sexual'
  | 'violence'
  | 'impersonation'
  | 'fake_result'
  | 'scam'
  | 'other';

export const REPORT_REASONS: Record<ReportReason, { label: string; description: string }> = {
  spam: { label: 'Spam', description: 'Unwanted ads, repeated or irrelevant content' },
  harassment: { label: 'Harassment or bullying', description: 'Insults, threats or targeting a person' },
  hate: { label: 'Hate speech', description: 'Attacks a group because of who they are' },
  sexual: { label: 'Sexual or inappropriate content', description: 'Nudity or explicit material' },
  violence: { label: 'Violence or dangerous behaviour', description: 'Threats, self-harm or dangerous acts' },
  impersonation: { label: 'Impersonation', description: 'Pretending to be someone else' },
  fake_result: { label: 'Fake or wrong result', description: 'The recorded score is false or disputed' },
  scam: { label: 'Scam or fraud', description: 'Tries to get money or personal details' },
  other: { label: 'Something else', description: 'Tell us more below' },
};

const BASE: ReportReason[] = ['spam', 'harassment', 'hate', 'sexual', 'violence', 'scam', 'other'];

/** Which reasons apply to which target (e.g. `fake_result` only for matches). */
export function reasonsFor(type: ReportTargetType): ReportReason[] {
  switch (type) {
    case 'community_match':
      return ['fake_result', ...BASE];
    case 'profile':
    case 'community':
      return ['impersonation', ...BASE];
    default:
      return BASE;
  }
}

export type ReportTarget = {
  type: ReportTargetType;
  id: string;
  /** Noun shown in the sheet title: "Report <label>" (e.g. "message", "post", "profile"). */
  label: string;
};

const ERROR_COPY: Record<string, string> = {
  RATE_LIMITED: "You've sent a lot of reports today. Try again tomorrow.",
  NOT_FOUND: 'This content is no longer available.',
  CANNOT_REPORT_SELF: "You can't report your own content.",
  DETAILS_TOO_LONG: 'Please keep the details under 500 characters.',
  INVALID_REASON: 'Please pick a reason.',
  INVALID_TARGET: "This can't be reported.",
  NOT_ALLOWED: 'Please sign in again and retry.',
};

/** Maps a `submit_report` error (raw RPC message) to friendly copy. */
export function reportErrorMessage(err: unknown): string {
  const raw =
    err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '');
  for (const code of Object.keys(ERROR_COPY)) {
    if (raw.includes(code)) return ERROR_COPY[code];
  }
  return 'Could not send your report. Check your connection and try again.';
}
