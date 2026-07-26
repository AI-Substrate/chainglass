/**
 * pij SDK contribution + registration — Plan 089 Phase 4, T003 (AC-12).
 *
 * Test Doc (suite-level):
 * - Why: AC-12 requires three ways to toggle the overlay — sidebar button, palette command,
 *   keybinding. The panel test covers what happens once the event fires; the sidebar's dispatch is
 *   asserted in `page-wiring.test.ts`. This file covers the other two, and it runs them through a
 *   REAL `IUSDK` assembled from the actual services rather than a cast, so `commands.execute` and the
 *   keybinding registry are genuinely exercised.
 * - Contract: ADR-0009; the static manifest; `pij.toggleOverlay` dispatches `pij:toggle`.
 * - Usage Notes: `window` is provided by the jsdom environment; no `vi.mock()`.
 * - Quality Contribution: proves two of AC-12's three paths behaviourally rather than by inspection.
 * - Worked Example: executing `pij.toggleOverlay` fires exactly one `pij:toggle` event.
 */
import { pijContribution } from '@/features/089-first-class-pij/sdk/contribution';
import { registerPijSDK } from '@/features/089-first-class-pij/sdk/register';
import { CommandRegistry } from '@/lib/sdk/command-registry';
import { ContextKeyService } from '@/lib/sdk/context-key-service';
import { KeybindingService } from '@/lib/sdk/keybinding-service';
import { SettingsStore } from '@/lib/sdk/settings-store';
import type { IUSDK } from '@chainglass/shared/sdk';
import { describe, expect, it } from 'vitest';

function makeSdk(): IUSDK {
  const context = new ContextKeyService();
  const commands = new CommandRegistry(context, () => {});
  const settings = new SettingsStore();
  const keybindings = new KeybindingService(context);
  const toast = {
    success: () => {},
    error: () => {},
    info: () => {},
    warning: () => {},
  };
  return { commands, settings, context, keybindings, toast };
}

describe('the pij SDK manifest', () => {
  it('declares one overlay command under the pij domain', () => {
    /*
    Test Doc:
    - Why: the manifest is what surfaces the verb in the palette. One command, because the overlay is
      the only thing this domain exposes to the SDK — the observatory itself is a page, not a verb.
    - Contract: domain 'pij'; exactly one command, `pij.toggleOverlay`, domain-tagged.
    - Usage Notes: —
    - Quality Contribution: pins the published surface.
    - Worked Example: ids === ['pij.toggleOverlay'].
    */
    expect(pijContribution.domain).toBe('pij');
    expect(pijContribution.commands.map((command) => command.id)).toEqual(['pij.toggleOverlay']);
    for (const command of pijContribution.commands) expect(command.domain).toBe('pij');
  });

  it('binds the keybinding to that command, statically', () => {
    /*
    Test Doc:
    - Why: the tinykeys map is built ONCE at mount. A binding declared anywhere but the static
      manifest is registered too late to ever fire, and nothing reports it.
    - Contract: one keybinding, `$mod+Shift+KeyF`, pointing at the declared command id.
    - Usage Notes: `page-wiring.test.ts` separately proves no other contribution claims the key.
    - Quality Contribution: keeps the shortcut real rather than declared.
    - Worked Example: [{ key: '$mod+Shift+KeyF', command: 'pij.toggleOverlay' }].
    */
    expect(pijContribution.keybindings).toEqual([
      { key: '$mod+Shift+KeyF', command: 'pij.toggleOverlay' },
    ]);
  });
});

describe('registerPijSDK', () => {
  it('executes into exactly one `pij:toggle` event', async () => {
    /*
    Test Doc:
    - Why: AC-12's command path, end to end. The handler cannot call the overlay directly — the SDK
      is registered at app bootstrap, outside the workspace layout's providers — so the CustomEvent
      is the only route, and it must be the SAME event the sidebar and keybinding use or the three
      paths are three behaviours.
    - Contract: executing the command dispatches one `pij:toggle`.
    - Usage Notes: run through a real CommandRegistry, so a malformed registration fails here.
    - Quality Contribution: proves the palette path works rather than that it was written.
    - Worked Example: execute → 1 event.
    */
    const sdk = makeSdk();
    registerPijSDK(sdk);

    const fired: Event[] = [];
    const listener = (event: Event) => fired.push(event);
    window.addEventListener('pij:toggle', listener);

    try {
      await sdk.commands.execute('pij.toggleOverlay');
    } finally {
      window.removeEventListener('pij:toggle', listener);
    }

    expect(fired).toHaveLength(1);
  });

  it('registers the keybinding with the SDK, not just in the manifest', () => {
    /*
    Test Doc:
    - Why: a manifest entry nobody hands to the keybinding service is a comment. The registration
      loop is one line and its absence is invisible until someone presses the key.
    - Contract: after registration the service holds a binding for `$mod+Shift+KeyF`.
    - Usage Notes: read back from the real KeybindingService.
    - Quality Contribution: closes the gap between declaring and registering.
    - Worked Example: the service lists the pij binding.
    */
    const sdk = makeSdk();
    registerPijSDK(sdk);

    const bindings = sdk.keybindings.getBindings();

    expect(bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: '$mod+Shift+KeyF', command: 'pij.toggleOverlay' }),
      ])
    );
  });
});
