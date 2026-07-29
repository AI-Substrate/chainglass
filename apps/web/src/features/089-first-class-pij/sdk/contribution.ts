/**
 * pij SDK contribution manifest — Plan 089 Phase 4, repointed by Plan 090.
 *
 * Static declaration of the commands and keybindings this domain publishes to the USDK surface, per
 * ADR-0009. **Static is the requirement, not the style**: the tinykeys map is built ONCE at mount, so
 * a keybinding registered dynamically after that is never seen.
 *
 * `$mod+Shift+KeyF` was verified free against every existing contribution and the SDK bootstrap
 * before being claimed (in use elsewhere: Backquote, $mod+Shift+KeyR, $mod+Shift+KeyL,
 * $mod+Shift+KeyP, $mod+KeyP, $mod+Comma, $mod+Shift+KeyU, Shift+Escape).
 */

import type { SDKContribution } from '@chainglass/shared/sdk';
import { z } from 'zod';

export const pijContribution: SDKContribution = {
  domain: 'pij',
  domainLabel: 'pij fleet',
  commands: [
    {
      id: 'pij.toggleOverlay',
      title: 'Open pij rail',
      domain: 'pij',
      category: 'Navigation',
      params: z.object({}),
      icon: 'users',
    },
  ],
  settings: [],
  keybindings: [{ key: '$mod+Shift+KeyF', command: 'pij.toggleOverlay' }],
};
