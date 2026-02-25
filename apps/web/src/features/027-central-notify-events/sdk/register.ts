/**
 * Events/toast SDK registration.
 *
 * Binds handlers to the toast contribution manifest.
 * Both commands are bootstrap-safe (no React refs needed).
 *
 * DYK-P6-01: These handlers call sonner directly — same as IUSDK.toast
 * but discoverable via command palette.
 *
 * Per ADR-0009: registerXxxSDK(sdk) pattern.
 * Per Plan 047, Phase 6, Task T002.
 */

import { toast } from 'sonner';

import type { IUSDK } from '@chainglass/shared/sdk';

import { eventsContribution } from './contribution';

/**
 * Register events/toast SDK contributions.
 * Called from bootstrapSDK().
 */
export function registerEventsSDK(sdk: IUSDK): void {
  // Register toast.show
  const showCmd = eventsContribution.commands.find((c) => c.id === 'toast.show');
  if (showCmd) {
    sdk.commands.register({
      ...showCmd,
      handler: async (params: unknown) => {
        const { message, type } = params as {
          message: string;
          type: 'success' | 'error' | 'info' | 'warning';
        };
        toast[type](message);
      },
    });
  }

  // Register toast.dismiss
  const dismissCmd = eventsContribution.commands.find((c) => c.id === 'toast.dismiss');
  if (dismissCmd) {
    sdk.commands.register({
      ...dismissCmd,
      handler: async () => {
        toast.dismiss();
      },
    });
  }

  // Register keybindings (none for events)
  for (const binding of eventsContribution.keybindings) {
    sdk.keybindings.register(binding);
  }
}
