/**
 * Relative time, in the doctrine's voice — Plan 089 Phase 2 (T005).
 *
 * "last heard 4m ago" is an observation. "stalled" is a verdict, and this feature does not render
 * verdicts — the same 4 minutes is a healthy long-running build or a wedged seat, and only the human
 * reading the row knows which. So this module formats elapsed time and says nothing about it.
 *
 * `now` is always a parameter. A component that reads the clock itself cannot be tested for the
 * boundary cases that matter, and every boundary here is a case that matters.
 */

/** An absent timestamp renders as this — an em dash, never "0s ago", which would claim freshness. */
export const NO_TIMESTAMP = '—';

/** Elapsed time in the POC's vocabulary: seconds, then minutes, then hours, then days. */
export function formatElapsed(iso: string | null | undefined, now: number): string {
  if (!iso) return NO_TIMESTAMP;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return NO_TIMESTAMP;

  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes}m ago`;
  const hours = Math.round(seconds / 3600);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

/** "last heard 4m ago" — the full phrase, so no caller has to invent its own wording. */
export function formatLastHeard(iso: string | null | undefined, now: number): string {
  const elapsed = formatElapsed(iso, now);
  return elapsed === NO_TIMESTAMP ? 'no events yet' : `last heard ${elapsed}`;
}
