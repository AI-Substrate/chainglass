/**
 * Permissions UX helpers (Plan 088 Phase 6, T004 — AC-14).
 *
 * Pure, jsdom-free mapping from the daemon's `/health.permissions` grant state to the
 * "what's missing and how to fix it" copy the preflight card AND the viewport E_PERMISSION
 * card render. Keeping it a plain function over plain inputs means the branch logic is
 * unit-tested directly while the components stay thin (the `viewport-support.ts` pattern).
 *
 * The streamer needs two macOS TCC grants on the host Mac:
 *   - Screen Recording → capture the window's pixels (without it: no frames, the daemon
 *     closes the stream with E_PERMISSION).
 *   - Accessibility    → synthesize the mouse/keyboard CGEvents (without it: input is dropped).
 * Each grant deep-links to its exact System Settings → Privacy & Security pane.
 */
import type { PermissionGrant } from '../server/daemon-manager';

export type RemoteViewGrant = 'screenRecording' | 'accessibility';

/** The host-Mac TCC permissions the streamer needs, as reported by `/health.permissions`. */
export interface RemoteViewPermissions {
  screenRecording: PermissionGrant;
  accessibility: PermissionGrant;
}

export interface MissingGrant {
  grant: RemoteViewGrant;
  /** Short human label — the exact System Settings pane name. */
  label: string;
  /** Why the stream needs it — names the concrete failure without it. */
  why: string;
  /** Deep-link straight to the grant's System Settings → Privacy & Security pane. */
  settingsUrl: string;
}

/** System Settings → Privacy & Security deep-links (macOS `x-apple.systempreferences:` scheme). */
export const SETTINGS_URL: Record<RemoteViewGrant, string> = {
  screenRecording: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
};

const GRANT_META: Record<RemoteViewGrant, { label: string; why: string }> = {
  screenRecording: {
    label: 'Screen Recording',
    why: 'Required to capture the window — without it the stream stays black (E_PERMISSION).',
  },
  accessibility: {
    label: 'Accessibility',
    why: 'Required to send mouse and keyboard input — without it your clicks and keys are dropped.',
  },
};

/**
 * The grants the host Mac is still missing. A grant counts as missing unless it is explicitly
 * `granted` — both `denied` and `not-determined` need the user to act, so both surface here.
 * Order is stable (screenRecording first) so the card and any snapshot stay deterministic.
 */
export function missingGrants(permissions: RemoteViewPermissions): MissingGrant[] {
  const order: RemoteViewGrant[] = ['screenRecording', 'accessibility'];
  return order
    .filter((grant) => permissions[grant] !== 'granted')
    .map((grant) => ({ grant, settingsUrl: SETTINGS_URL[grant], ...GRANT_META[grant] }));
}
