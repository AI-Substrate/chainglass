'use client';

/**
 * KeyboardShortcutListener — Global keyboard shortcut listener.
 *
 * Mounts tinykeys on document to handle SDK-registered keyboard shortcuts.
 * DYK-P4-01: tinykeys owns chord resolution.
 * DYK-P4-05: isAvailable() checked at fire time, not registration time.
 *
 * Per Plan 047 Phase 4, Task T005.
 */

import { useEffect } from 'react';
import { tinykeys } from 'tinykeys';

import type { IUSDK } from '@chainglass/shared/sdk';

interface KeyboardShortcutListenerProps {
  sdk: IUSDK;
}

export function KeyboardShortcutListener({ sdk }: KeyboardShortcutListenerProps) {
  useEffect(() => {
    const map = sdk.keybindings.buildTinykeysMap(
      (commandId, args) => sdk.commands.execute(commandId, args),
      (commandId) => sdk.commands.isAvailable(commandId)
    );

    // tinykeys returns an unsubscribe function
    const unsubscribe = tinykeys(window, map);

    return () => {
      unsubscribe();
    };
  }, [sdk]);

  // Invisible — no UI
  return null;
}
