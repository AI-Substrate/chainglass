/**
 * File Notes SDK contribution manifest.
 *
 * Static declaration of commands and keybindings that the file-notes
 * domain publishes to the USDK surface.
 *
 * Plan 071: PR View & File Notes — Phase 2
 */

import { z } from 'zod';

import type { SDKContribution } from '@chainglass/shared/sdk';

export const fileNotesContribution: SDKContribution = {
  domain: 'file-notes',
  domainLabel: 'File Notes',
  commands: [
    {
      id: 'notes.toggleOverlay',
      title: 'Toggle Notes',
      domain: 'file-notes',
      category: 'Overlays',
      params: z.object({}),
      icon: 'sticky-note',
    },
  ],
  settings: [],
  keybindings: [{ key: '$mod+Shift+KeyL', command: 'notes.toggleOverlay' }],
};
