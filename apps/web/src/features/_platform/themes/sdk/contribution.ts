import type { SDKContribution } from '@chainglass/shared/sdk';
import { z } from 'zod';

export const themesContribution: SDKContribution = {
  domain: 'themes',
  domainLabel: 'Themes',
  commands: [],
  settings: [
    {
      key: 'themes.iconTheme',
      domain: 'themes',
      label: 'File Icon Theme',
      description: 'Icon theme used for file and folder icons in the file browser',
      schema: z.string().default('material-icon-theme'),
      ui: 'select',
      options: [{ label: 'Material Icon Theme', value: 'material-icon-theme' }],
      section: 'Appearance',
    },
  ],
  keybindings: [],
};
