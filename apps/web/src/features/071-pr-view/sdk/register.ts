/**
 * PR View SDK registration.
 *
 * Binds handlers to the static contribution manifest and registers
 * commands + keybindings with the SDK.
 *
 * Per ADR-0009: registerXxxSDK(sdk) pattern.
 * Plan 071: PR View & File Notes — Phase 5, T010
 */

import type { IUSDK } from '@chainglass/shared/sdk';

import { prViewContribution } from './contribution';

export function registerPRViewSDK(sdk: IUSDK): void {
  const toggleCmd = prViewContribution.commands.find((c) => c.id === 'prView.toggleOverlay');
  if (toggleCmd) {
    sdk.commands.register({
      ...toggleCmd,
      handler: async () => {
        window.dispatchEvent(new CustomEvent('pr-view:toggle'));
      },
    });
  }

  for (const binding of prViewContribution.keybindings) {
    sdk.keybindings.register(binding);
  }
}
