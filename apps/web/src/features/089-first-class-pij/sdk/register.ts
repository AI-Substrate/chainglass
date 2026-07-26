/**
 * pij SDK registration — Plan 089 Phase 4 (T003).
 *
 * Binds handlers to the static manifest and registers commands + keybindings, per ADR-0009's
 * `registerXxxSDK(sdk)` pattern.
 *
 * The handler dispatches a CustomEvent rather than calling the overlay directly, for the same reason
 * the sidebar button does: the SDK is registered at app bootstrap, outside the workspace layout's
 * provider tree, so it has no route to the context. The event is the seam, and it is the SAME seam
 * all three trigger paths use — button, command, keybinding — which is why AC-12 can test them as
 * three inputs to one behaviour.
 */

import type { IUSDK } from '@chainglass/shared/sdk';

import { pijContribution } from './contribution';

export function registerPijSDK(sdk: IUSDK): void {
  const toggleCmd = pijContribution.commands.find((c) => c.id === 'pij.toggleOverlay');
  if (toggleCmd) {
    sdk.commands.register({
      ...toggleCmd,
      handler: async () => {
        window.dispatchEvent(new CustomEvent('pij:toggle'));
      },
    });
  }

  for (const binding of pijContribution.keybindings) {
    sdk.keybindings.register(binding);
  }
}
