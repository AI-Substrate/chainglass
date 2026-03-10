/**
 * PR View SDK contribution manifest.
 *
 * Static declaration of commands and keybindings that the pr-view
 * domain publishes to the USDK surface.
 *
 * Plan 071: PR View & File Notes — Phase 5, T010
 */

import { z } from 'zod';

import type { SDKContribution } from '@chainglass/shared/sdk';

export const prViewContribution: SDKContribution = {
  domain: 'pr-view',
  domainLabel: 'PR View',
  commands: [
    {
      id: 'prView.toggleOverlay',
      title: 'Toggle PR View',
      domain: 'pr-view',
      category: 'Overlays',
      params: z.object({}),
      icon: 'git-pull-request',
    },
  ],
  settings: [],
  keybindings: [{ key: '$mod+Shift+KeyR', command: 'prView.toggleOverlay' }],
};
