/**
 * Viewport support-classification — pure, jsdom-free helpers for the "why can't this
 * stream decode?" overlay (Plan 088 Phase 6, T002 — DL-004).
 *
 * The Viewport itself is intentionally NOT unit-tested (jsdom has no WebCodecs), so the
 * branch logic lives here as plain functions over plain inputs and is unit-tested directly.
 *
 * The bug this fixes: `VideoDecoder`/`EncodedVideoChunk` are `undefined` in a NON-secure
 * context (plain http on a non-localhost host) even on the latest Chrome — so the old
 * single check mis-reported a secure-context problem as "use a recent Chromium browser".
 * We classify the real reason and prescribe the real fix.
 */

export type UnsupportedReason =
  | 'insecure-context' // WebCodecs is gated off because the page is not a secure context
  | 'no-webcodecs' //     genuinely missing API on a secure context (e.g. older Safari)
  | 'codec'; //           WebCodecs present, but this stream's codec/avcC isn't supported

/**
 * Classify the *environment* support for WebCodecs decoding. Order matters: an insecure
 * context ALSO makes `VideoDecoder` undefined, so secure-context is checked FIRST — otherwise
 * we'd blame the browser for a deployment problem (the exact DL-004 false negative).
 */
export function classifyEnvSupport(env: {
  isSecureContext: boolean;
  hasWebCodecs: boolean;
}): UnsupportedReason | null {
  if (!env.isSecureContext) return 'insecure-context';
  if (!env.hasWebCodecs) return 'no-webcodecs';
  return null; // environment is capable — any failure now is codec-specific (set separately)
}

/** Human-facing overlay copy per reason. Each reason yields a DISTINCT title + body so the
 *  user gets the real cause and the real fix (the test asserts the branches differ). */
export function unsupportedOverlayText(reason: UnsupportedReason): { title: string; body: string } {
  switch (reason) {
    case 'insecure-context':
      return {
        title: 'Secure context required',
        body: "This page isn't a secure context, so the browser disables WebCodecs video. Open Chainglass over https:// or http://localhost to stream (a plain http:// LAN address won't work).",
      };
    case 'no-webcodecs':
      return {
        title: 'Browser not supported',
        body: "Video playback isn't supported in this browser. Use a recent Chromium-based browser.",
      };
    case 'codec':
      return {
        title: 'Codec not supported',
        body: "This stream's video codec isn't supported by your browser.",
      };
  }
}
