'use client';

/**
 * bootstrapSDK — Creates and configures an IUSDK instance.
 *
 * Instantiates ContextKeyService, CommandRegistry, SettingsStore and wires
 * them into an IUSDK-shaped object. No domain registrations — Phase 6 adds those.
 *
 * DYK-P2-02: Toast methods import sonner directly. The toast.show command
 * won't be registered until Phase 6, so routing through execute() would throw.
 *
 * Per Plan 047 Phase 2, Task T005.
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

  // DYK-P5-01: Demo settings to dogfood the settings page (Phase 6 moves to domain contributions)
  settings.contribute({
    key: 'appearance.theme',
    domain: 'appearance',
    label: 'Dark Mode',
    description: 'Enable dark mode for the application',
    schema: z.boolean().default(false),
    ui: 'toggle',
    section: 'Appearance',
  });
  settings.contribute({
    key: 'editor.fontSize',
    domain: 'editor',
    label: 'Font Size',
    description: 'Editor font size in pixels',
    schema: z.number().min(8).max(32).default(14),
    ui: 'number',
    section: 'Editor',
  });
  settings.contribute({
    key: 'editor.wordWrap',
    domain: 'editor',
    label: 'Word Wrap',
    description: 'How lines should wrap in the editor',
    schema: z.string().default('off'),
    ui: 'select',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'on', label: 'On' },
      { value: 'wordWrapColumn', label: 'At Column' },
      { value: 'bounded', label: 'Bounded' },
    ],
    section: 'Editor',
  });
  settings.contribute({
    key: 'editor.tabSize',
    domain: 'editor',
    label: 'Tab Size',
    description: 'Number of spaces per tab stop',
    schema: z.number().min(1).max(8).default(2),
    ui: 'number',
    section: 'Editor',
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

  return {
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
}
