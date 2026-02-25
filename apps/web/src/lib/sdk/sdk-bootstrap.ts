'use client';

/**
 * bootstrapSDK — Creates and configures an IUSDK instance.
 *
 * Instantiates ContextKeyService, CommandRegistry, SettingsStore and wires
 * them into an IUSDK-shaped object. Calls domain registration functions.
 *
 * DYK-P2-02: Toast methods import sonner directly. The toast.show command
 * won't be registered until Phase 6, so routing through execute() would throw.
 *
 * Per Plan 047 Phase 2, Task T005. Phase 6: domain registrations.
 */

import { toast } from 'sonner';
import { z } from 'zod';

import type { IUSDK } from '@chainglass/shared/sdk';

import { CommandRegistry } from './command-registry';
import { ContextKeyService } from './context-key-service';
import { KeybindingService } from './keybinding-service';
import { SettingsStore } from './settings-store';

export function bootstrapSDK(): IUSDK {
  const context = new ContextKeyService();
  const commands = new CommandRegistry(context, (id, error) => {
    console.error(`[SDK] Command '${id}' failed:`, error);
    toast.error(`Command failed: ${id}`);
  });
  const settings = new SettingsStore();
  const keybindings = new KeybindingService(context);

  // DYK-P4-05: Default bindings are static key→commandId maps.
  // Commands may not exist yet — isAvailable() checked at fire time.
  keybindings.register({ key: '$mod+Shift+KeyP', command: 'sdk.openCommandPalette' });
  keybindings.register({ key: '$mod+KeyP', command: 'file-browser.goToFile' });

  // Register sdk.listShortcuts command (Phase 4, T008)
  commands.register({
    id: 'sdk.listShortcuts',
    title: 'List Keyboard Shortcuts',
    domain: 'sdk',
    params: z.object({}),
    handler: async () => {
      const bindings = keybindings.getBindings();
      const lines = bindings.map((b) => `${b.key} → ${b.command}`);
      console.info('[SDK Shortcuts]', lines.join('\n'));
      toast.info(`${bindings.length} shortcut${bindings.length === 1 ? '' : 's'} registered`);
    },
  });

  // Demo setting — appearance.theme stays as platform demo
  settings.contribute({
    key: 'appearance.theme',
    domain: 'appearance',
    label: 'Dark Mode',
    description: 'Enable dark mode for the application',
    schema: z.boolean().default(false),
    ui: 'toggle',
    section: 'Appearance',
  });

  // DYK-P5-03: openSettings — parse slug from URL at execution time
  // FT-005: Use custom event for SPA navigation (avoids full page reload)
  commands.register({
    id: 'sdk.openSettings',
    title: 'Open Settings',
    domain: 'sdk',
    params: z.object({}),
    handler: async () => {
      const match = window.location.pathname.match(/\/workspaces\/([^/]+)/);
      if (match) {
        window.dispatchEvent(
          new CustomEvent('sdk:navigate', {
            detail: { path: `/workspaces/${match[1]}/settings` },
          })
        );
      } else {
        toast.info('Open a workspace first');
      }
    },
    icon: 'settings',
  });

  // Ctrl+, opens settings
  keybindings.register({ key: '$mod+Comma', command: 'sdk.openSettings' });

  const sdk: IUSDK = {
    commands,
    settings,
    context,
    keybindings,
    toast: {
      success: (message: string) => toast.success(message),
      error: (message: string) => toast.error(message),
      info: (message: string) => toast.info(message),
      warning: (message: string) => toast.warning(message),
    },
  };

  return sdk;
}
