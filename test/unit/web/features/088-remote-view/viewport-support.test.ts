/**
 * Plan 088 Phase 6 — T002: secure-context-aware decode-support classification (DL-004).
 *
 * The Viewport is NOT unit-tested (jsdom has no WebCodecs), so the branch logic is extracted
 * into pure functions and asserted here. The bug being guarded: on a non-localhost http:// origin
 * `VideoDecoder` is undefined because the page isn't a secure context — the overlay must name THAT,
 * not "use a recent Chromium-based browser" (a false negative on the latest Chrome).
 */
import {
  classifyEnvSupport,
  unsupportedOverlayText,
} from '@/features/088-remote-view/components/viewport-support';
import { describe, expect, it } from 'vitest';

describe('classifyEnvSupport', () => {
  it('blames the insecure context FIRST — even though WebCodecs is also absent there', () => {
    // A non-localhost http:// origin: not secure → WebCodecs gated off. Secure-context is the
    // real cause and the real fix, so it must win over the (incidental) missing-API signal.
    expect(classifyEnvSupport({ isSecureContext: false, hasWebCodecs: false })).toBe(
      'insecure-context'
    );
    // Defensive: even if a browser exposed WebCodecs without a secure context, secure-context wins.
    expect(classifyEnvSupport({ isSecureContext: false, hasWebCodecs: true })).toBe(
      'insecure-context'
    );
  });

  it('reports a genuinely missing API only on a secure context (e.g. older Safari)', () => {
    expect(classifyEnvSupport({ isSecureContext: true, hasWebCodecs: false })).toBe('no-webcodecs');
  });

  it('returns null when the environment is capable (secure + WebCodecs present)', () => {
    expect(classifyEnvSupport({ isSecureContext: true, hasWebCodecs: true })).toBeNull();
  });
});

describe('unsupportedOverlayText', () => {
  it('insecure-context names the secure-context cause and prescribes https/localhost', () => {
    const { title, body } = unsupportedOverlayText('insecure-context');
    expect(title).toMatch(/secure context/i);
    expect(body).toMatch(/https/i);
    expect(body).toMatch(/localhost/i);
    // It must NOT tell the user to switch browsers — that was the DL-004 false negative.
    expect(body).not.toMatch(/chromium/i);
  });

  it('no-webcodecs keeps the "recent Chromium-based browser" copy (only here)', () => {
    const { body } = unsupportedOverlayText('no-webcodecs');
    expect(body).toMatch(/chromium-based browser/i);
    expect(body).not.toMatch(/secure context/i);
  });

  it('every reason renders a DISTINCT title + body', () => {
    const reasons = ['insecure-context', 'no-webcodecs', 'codec'] as const;
    const titles = reasons.map((r) => unsupportedOverlayText(r).title);
    const bodies = reasons.map((r) => unsupportedOverlayText(r).body);
    expect(new Set(titles).size).toBe(reasons.length);
    expect(new Set(bodies).size).toBe(reasons.length);
  });
});
