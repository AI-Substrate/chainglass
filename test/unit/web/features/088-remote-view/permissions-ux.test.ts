/**
 * Plan 088 Phase 6 — T004: the permissions-UX mapping (AC-14).
 *
 * Pure over plain inputs (no jsdom, no daemon). Proves the daemon's `/health.permissions` grant
 * state → the named missing-grant list the preflight card + CLI render: both `denied` and
 * `not-determined` count as missing, each grant deep-links to its EXACT System Settings pane, and
 * order is stable. A regression that treated `not-determined` as "fine" would silently black-frame.
 */
import { SETTINGS_URL, missingGrants } from '@/features/088-remote-view/components/permissions-ux';
import { describe, expect, it } from 'vitest';

describe('missingGrants (T004, AC-14)', () => {
  it('returns [] when both grants are granted', () => {
    expect(missingGrants({ screenRecording: 'granted', accessibility: 'granted' })).toEqual([]);
  });

  it('names Screen Recording when its grant is denied, with the capture deep-link', () => {
    const out = missingGrants({ screenRecording: 'denied', accessibility: 'granted' });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      grant: 'screenRecording',
      label: 'Screen Recording',
      settingsUrl: SETTINGS_URL.screenRecording,
    });
    expect(out[0].why).toMatch(/capture/i);
  });

  it('treats `not-determined` as missing (it still needs the user to act)', () => {
    const out = missingGrants({ screenRecording: 'granted', accessibility: 'not-determined' });
    expect(out.map((m) => m.grant)).toEqual(['accessibility']);
    expect(out[0].settingsUrl).toBe(SETTINGS_URL.accessibility);
    expect(out[0].why).toMatch(/input|keyboard|mouse/i);
  });

  it('lists both grants in a stable order (screenRecording first) when both are missing', () => {
    const out = missingGrants({ screenRecording: 'not-determined', accessibility: 'denied' });
    expect(out.map((m) => m.grant)).toEqual(['screenRecording', 'accessibility']);
  });

  it('deep-links to the two distinct Privacy & Security panes via the macOS scheme', () => {
    expect(SETTINGS_URL.screenRecording).toContain('x-apple.systempreferences:');
    expect(SETTINGS_URL.screenRecording).toContain('Privacy_ScreenCapture');
    expect(SETTINGS_URL.accessibility).toContain('Privacy_Accessibility');
    expect(SETTINGS_URL.screenRecording).not.toBe(SETTINGS_URL.accessibility);
  });
});
