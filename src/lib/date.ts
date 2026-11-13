export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function ordinalSuffix(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]);
}

export function formatSessionDisplayName(
  purpose: string,
  dateTime: string,
  title?: string | null,
): string {
  if (title) return title;
  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) return `${purpose} session`;
  const day = ordinalSuffix(d.getDate());
  const month = d.toLocaleDateString(undefined, { month: 'long' });
  return `${purpose} ${day} ${month} session`;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatChatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (messageDate.getTime() === today.getTime()) return 'Today';
  if (messageDate.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Username changes are limited to once every 30 days (migration 131). */
export const USERNAME_CHANGE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The date the user may change their username again, or null if they can change it now. */
export function nextUsernameChangeDate(changedAt: string | null | undefined, now: number = Date.now()): Date | null {
  if (!changedAt) return null;
  const t = new Date(changedAt).getTime();
  if (Number.isNaN(t)) return null;
  const next = t + USERNAME_CHANGE_WINDOW_DAYS * DAY_MS;
  return next > now ? new Date(next) : null;
}

/** "2 Dec 2026" (UTC, matching the server's message). */
export function formatLongDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
