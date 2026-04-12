import type { SDKContribution } from '@chainglass/shared/sdk';
import { z } from 'zod';
import { DEFAULT_TERMINAL_THEME, TERMINAL_THEMES } from '../lib/terminal-themes';

export const terminalContribution: SDKContribution = {
  domain: 'terminal',
  domainLabel: 'Terminal',
  commands: [],
  settings: [
    {
      key: 'terminal.colorTheme',
      domain: 'terminal',
      label: 'Terminal Color Theme',
      description: 'Color theme for the terminal emulator',
      schema: z.string().default(DEFAULT_TERMINAL_THEME),
      ui: 'select',
      options: [
        { label: 'Auto (follow app theme)', value: 'auto' },
        ...TERMINAL_THEMES.filter((t) => t.category === 'dark').map((t) => ({
          label: `🌙 ${t.name}`,
          value: t.id,
        })),
        ...TERMINAL_THEMES.filter((t) => t.category === 'light').map((t) => ({
          label: `☀️ ${t.name}`,
          value: t.id,
        })),
      ],
      section: 'Appearance',
    },
  ],
  keybindings: [],
};
