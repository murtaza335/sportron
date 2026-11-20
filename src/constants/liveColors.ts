/**
 * Side colours for live scoring — the SAME on the referee screen, the in-app live screens and the projector
 * (docs/live-match/PLAN.md §6.1): side A = blue, side B = orange. White text passes contrast on both.
 */
export const SideColors = {
  a: { fg: '#2563EB', pressed: '#1D4ED8', soft: 'rgba(37,99,235,0.12)', label: 'A' },
  b: { fg: '#EA580C', pressed: '#C2410C', soft: 'rgba(234,88,12,0.12)', label: 'B' },
} as const;

export const LiveStatus = {
  live: '#DC2626',
  synced: '#16A34A',
  syncing: '#D97706',
  offline: '#64748B',
} as const;
