/**
 * How full a window's agent context is: the pij seat's used tokens over its context window,
 * drawn as a thin vertical bar on the window strip's buttons and in the window overview
 * (Jordan, 2026-11-11). pij reports both numbers on each seat's state card (`/v1/cards`); a seat
 * without both draws no bar at all, never an empty one.
 */

/** A seat's context use, in tokens. */
export interface SeatContext {
  usedTokens: number;
  windowTokens: number;
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

/** "context 46% (468k / 1.0M)". Floored, so a fill just under a band edge never reads as on it. */
export function contextLabel(context: SeatContext): string {
  return `context ${Math.floor(contextFill(context) * 100)}% (${formatTokens(context.usedTokens)} / ${formatTokens(context.windowTokens)})`;
}
