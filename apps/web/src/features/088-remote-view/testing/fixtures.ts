/**
 * Shared remote-view test fixtures (pure data — no `ws`, no fs).
 *
 * `FAKE_WINDOW` is the single pinned window descriptor the frame-replay fake
 * (T005), the FakeRemoteViewService (T009), and the Phase 3 picker all share.
 * The Phase 1 manifest has no window fields, so the descriptor is pinned here
 * once. pixelWidth/Height come from the captured manifest (800×656); scale 2.
 *
 * Plan 088 Phase 2 — T005.
 */
import type { WindowDescriptor } from '../protocol/messages';

/** The one window descriptor every remote-view fake/test shares. */
export const FAKE_WINDOW: WindowDescriptor = {
  id: 34202,
  app: 'Godot',
  title: 'spike-target',
  pixelWidth: 800,
  pixelHeight: 656,
  scale: 2,
};

/** A canonical fake session id (12 base32 chars, `ses_` prefix per Workshop 002). */
export const FAKE_SESSION_ID = 'ses_fake00000001';
