/**
 * How full a window's agent context is: the pij seat's used tokens over its context window,
 * drawn as a thin vertical bar on the window strip's buttons and in the window overview
 * (Jordan, 2026-11-11). pij reports both numbers on each seat's state card (`/v1/cards`); a seat
 * without both draws no bar at all, never an empty one. A window tiled into several agent panes
 * shows its fullest seat (Jordan, 2026-11-12).
 */

/** A seat's context use, in tokens. */
export interface SeatContext {
  usedTokens: number;
  windowTokens: number;
}

/** A window's context: its fullest seat's, and how many of the window's seats report one. */
export interface WindowContext extends SeatContext {
  /** The seat with the fullest context (not necessarily the window's identity seat). */
  seatId: string;
  /** Seats in the window that report context; 1 for a window with one agent. */
  seats: number;
}

export type ContextBand = 'green' | 'yellow' | 'orange' | 'red';

/** Band thresholds: a fill at or above `from` (0–1) takes that band. Ascending. */
export const CONTEXT_FILL_BANDS: ReadonlyArray<{ band: ContextBand; from: number }> = [
  { band: 'green', from: 0 },
  { band: 'yellow', from: 0.5 },
  { band: 'orange', from: 0.7 },
  { band: 'red', from: 0.85 },
];

/** `obj[key]` when `obj` is an object, else undefined (the seat roster is untyped JSON). */
function field(obj: unknown, key: string): unknown {
  return typeof obj === 'object' && obj !== null ? Reflect.get(obj, key) : undefined;
}

function tokenValue(tokens: unknown): number | null {
  const value = field(tokens, 'value');
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * A pij state card's context (`/v1/cards`), from `sessionStatus.status.contextUsedTokens.value`
 * and `contextWindowTokens.value`. `null` unless both are reported and the window is positive.
 */
export function seatContext(card: unknown): SeatContext | null {
  const status = field(field(card, 'sessionStatus'), 'status');
  const usedTokens = tokenValue(field(status, 'contextUsedTokens'));
  const windowTokens = tokenValue(field(status, 'contextWindowTokens'));
  if (usedTokens === null || windowTokens === null || windowTokens <= 0) return null;
  return { usedTokens, windowTokens };
}

/** Used over window, clamped to 0–1 (a seat can briefly report more than its window). */
export function contextFill(context: SeatContext): number {
  return Math.min(1, Math.max(0, context.usedTokens / context.windowTokens));
}

/**
 * The fullest of a window's seats, by fill. Seats without context are skipped; none reporting
 * gives `null`. A tie keeps the earlier seat.
 */
export function fullestContext(
  seats: ReadonlyArray<{ id: string; context: SeatContext | null }>
): WindowContext | null {
  let fullest: { id: string; context: SeatContext } | null = null;
  let reporting = 0;
  for (const { id, context } of seats) {
    if (!context) continue;
    reporting++;
    if (!fullest || contextFill(context) > contextFill(fullest.context)) fullest = { id, context };
  }
  return fullest && { ...fullest.context, seatId: fullest.id, seats: reporting };
}

export function contextBand(fill: number): ContextBand {
  let band: ContextBand = CONTEXT_FILL_BANDS[0].band;
  for (const threshold of CONTEXT_FILL_BANDS) {
    if (fill >= threshold.from) band = threshold.band;
  }
  return band;
}

/** 468_000 → "468k", 1_000_000 → "1.0M", 950 → "950". */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`;
  return String(Math.round(tokens));
}

/**
 * "context 46% (468k / 1.0M)", plus ", fullest of 3 agents: pij-foo" when several seats report.
 * Floored, so a fill just under a band edge never reads as on it.
 */
export function contextLabel(context: WindowContext): string {
  const label = `context ${Math.floor(contextFill(context) * 100)}% (${formatTokens(context.usedTokens)} / ${formatTokens(context.windowTokens)})`;
  return context.seats > 1
    ? `${label}, fullest of ${context.seats} agents: ${context.seatId}`
    : label;
}
