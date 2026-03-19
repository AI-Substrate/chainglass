/**
 * KeybindingService — Real implementation of IKeybindingService.
 *
 * Thin registration and when-clause layer over tinykeys.
 * DYK-P4-01: tinykeys owns chord resolution — no custom state machine.
 * DYK-P4-05: Bindings are static key→commandId maps. Command existence
 * is NOT checked at registration — checked at fire time via isAvailable().
 *
 * Per Plan 047 Phase 4, Task T002.
 */

import type { IContextKeyService, IKeybindingService } from '@chainglass/shared/sdk';
import type { SDKKeybinding } from '@chainglass/shared/sdk';

export class KeybindingService implements IKeybindingService {
  private readonly bindings = new Map<string, SDKKeybinding>();
  private readonly contextKeys: IContextKeyService;

  constructor(contextKeys: IContextKeyService) {
    this.contextKeys = contextKeys;
  }

  register(binding: SDKKeybinding): { dispose: () => void } {
    if (this.bindings.has(binding.key)) {
      throw new Error(
        `SDK keybinding '${binding.key}' is already registered. Each key combination must have a single owner.`
      );
    }
    this.bindings.set(binding.key, binding);
    return {
      dispose: () => {
        this.bindings.delete(binding.key);
      },
    };
  }

  getBindings(): SDKKeybinding[] {
    return [...this.bindings.values()];
  }

  buildTinykeysMap(
    execute: (commandId: string, args?: Record<string, unknown>) => Promise<void>,
    isAvailable: (commandId: string) => boolean
  ): Record<string, (event: KeyboardEvent) => void> {
    const map: Record<string, (event: KeyboardEvent) => void> = {};
    for (const binding of this.bindings.values()) {
      map[binding.key] = (event: KeyboardEvent) => {
        // Skip when user is typing in an editable element (input, textarea, CodeMirror, etc.)
        // Global bindings bypass this guard (e.g. Shift+Escape to close terminal)
        if (!binding.global) {
          const el = event.target as HTMLElement;
          if (
            el?.tagName === 'INPUT' ||
            el?.tagName === 'TEXTAREA' ||
            el?.isContentEditable ||
            el?.closest?.('.cm-editor')
          ) {
            return;
          }
        }
        // When-clause check
        if (binding.when && !this.contextKeys.evaluate(binding.when)) return;
        // Command availability check (DYK-P4-05)
        if (!isAvailable(binding.command)) return;
        event.preventDefault();
        execute(binding.command, binding.args).catch(() => {});
      };
    }
    return map;
  }
}
