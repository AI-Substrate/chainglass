/**
 * pij SDK registration — Plan 089 Phase 4, repointed by Plan 090.
 *
 * Binds handlers to the static manifest and registers commands + keybindings, per ADR-0009's
 * `registerXxxSDK(sdk)` pattern.
 *
 * The handler dispatches the same CustomEvent as the explorer and sidebar buttons. The workspace
 * route listener owns the navigation decision: switch to `panel=pij` in the browser, or navigate to
 * the browser rail from another workspace route. The command id stays stable for SDK callers.
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
