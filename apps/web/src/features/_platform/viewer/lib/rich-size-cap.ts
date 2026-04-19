/**
 * rich-size-cap — Rich-mode size-gate constant + helper.
 *
 * Phase 4 / T005. Consumed by Phase 5.4 (Rich-button disable path + tooltip
 * copy) and Phase 5's integration tests. Pure, browser-safe, no Node APIs.
 *
 * AC-16a + Finding 12 (bundle budget).
 */

/**
 * 200_000 bytes (decimal kilobytes, NOT 204_800 KiB).
 *
 * Matches the spec's informal "200 KB" phrasing. Rich mode is disabled for
 * files whose UTF-8 byte length exceeds this threshold; users are nudged
 * toward Source mode via a tooltip composed against this constant.
 *
 * The named export is the authoritative source of truth — Phase 5.4
 * composes tooltip text (`"File too large for Rich mode — use Source"`)
 * against it so a future cap change updates both the gate and the copy.
 */
export const RICH_MODE_SIZE_CAP_BYTES = 200_000;

/**
 * Returns true iff the content's UTF-8 byte length is strictly greater than
 * {@link RICH_MODE_SIZE_CAP_BYTES}.
 *
 * Uses `TextEncoder` (universal in both DOM and Node lib targets) rather
 * than `Buffer.byteLength` (Node-only). Strict `>` — content at exactly
 * the cap is allowed through.
 */
export function exceedsRichSizeCap(content: string): boolean {
  return new TextEncoder().encode(content).length > RICH_MODE_SIZE_CAP_BYTES;
}
