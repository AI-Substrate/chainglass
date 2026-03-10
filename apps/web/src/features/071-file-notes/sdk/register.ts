/**
 * File Notes SDK registration.
 *
 * Binds handlers to the static contribution manifest and registers
 * commands + keybindings with the SDK.
 *
 * Per ADR-0009: registerXxxSDK(sdk) pattern.
 * Plan 071: PR View & File Notes — Phase 2
 */

import type { IUSDK } from '@chainglass/shared/sdk';

import { fileNotesContribution } from './contribution';

export function registerFileNotesSDK(sdk: IUSDK): void {
  // Register toggle overlay command
  const toggleCmd = fileNotesContribution.commands.find((c) => c.id === 'notes.toggleOverlay');
  if (toggleCmd) {
    sdk.commands.register({
      ...toggleCmd,
      handler: async () => {
        window.dispatchEvent(new CustomEvent('notes:toggle'));
      },
    });
  }

  // Register keybindings
  for (const binding of fileNotesContribution.keybindings) {
    sdk.keybindings.register(binding);
  }
}
