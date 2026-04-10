import type { ITheme } from '@xterm/xterm';

/** Unique identifier for a terminal theme (kebab-case slug) */
export type TerminalThemeId = string;

/** Category determines grouping in the theme picker */
export type TerminalThemeCategory = 'dark' | 'light';

/** Complete metadata for a terminal theme */
export interface TerminalThemeEntry {
  readonly id: TerminalThemeId;
  readonly name: string;
  readonly category: TerminalThemeCategory;
  readonly family?: string;
  readonly theme: ITheme;
}

/** Registry of all available terminal themes */
export type TerminalThemeRegistry = readonly TerminalThemeEntry[];
