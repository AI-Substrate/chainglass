import {
  DEFAULT_TERMINAL_THEME,
  TERMINAL_THEMES,
  getThemesByCategory,
  resolveTerminalTheme,
} from '@/features/064-terminal/lib/terminal-themes';
import type { ITheme } from '@xterm/xterm';
import { describe, expect, it } from 'vitest';

const REQUIRED_THEME_FIELDS: (keyof ITheme)[] = [
  'background',
  'foreground',
  'cursor',
  'cursorAccent',
  'selectionBackground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
];

describe('Terminal Theme Catalog', () => {
  it('contains exactly 25 themes', () => {
    expect(TERMINAL_THEMES).toHaveLength(25);
  });

  it('all theme IDs are unique', () => {
    const ids = TERMINAL_THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all theme names are unique', () => {
    const names = TERMINAL_THEMES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all theme IDs are kebab-case', () => {
    for (const theme of TERMINAL_THEMES) {
      expect(theme.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it.each(TERMINAL_THEMES.map((t) => [t.id, t] as const))(
    '%s has all required ITheme fields',
    (_id, theme) => {
      for (const field of REQUIRED_THEME_FIELDS) {
        expect(theme.theme[field], `${theme.id} missing ${field}`).toBeDefined();
        expect(typeof theme.theme[field]).toBe('string');
      }
    }
  );

  it.each(TERMINAL_THEMES.map((t) => [t.id, t] as const))(
    '%s has valid hex color values',
    (_id, theme) => {
      for (const field of REQUIRED_THEME_FIELDS) {
        const value = theme.theme[field] as string;
        expect(value, `${theme.id}.${field} = ${value}`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  );

  it('has valid category for every theme', () => {
    for (const theme of TERMINAL_THEMES) {
      expect(['dark', 'light']).toContain(theme.category);
    }
  });

  it('includes both dark and light themes', () => {
    const dark = TERMINAL_THEMES.filter((t) => t.category === 'dark');
    const light = TERMINAL_THEMES.filter((t) => t.category === 'light');
    expect(dark.length).toBeGreaterThan(0);
    expect(light.length).toBeGreaterThan(0);
  });
});

describe('resolveTerminalTheme', () => {
  it('resolves a known dark theme by ID', () => {
    const result = resolveTerminalTheme('dracula');
    expect(result.id).toBe('dracula');
    expect(result.name).toBe('Dracula');
  });

  it('resolves a known light theme by ID', () => {
    const result = resolveTerminalTheme('catppuccin-latte');
    expect(result.id).toBe('catppuccin-latte');
    expect(result.category).toBe('light');
  });

  it('auto resolves to vscode-dark in dark mode', () => {
    const result = resolveTerminalTheme('auto', 'dark');
    expect(result.id).toBe('vscode-dark');
  });

  it('auto resolves to vscode-light in light mode', () => {
    const result = resolveTerminalTheme('auto', 'light');
    expect(result.id).toBe('vscode-light');
  });

  it('unknown ID falls back to vscode-dark by default', () => {
    const result = resolveTerminalTheme('nonexistent-theme');
    expect(result.id).toBe('vscode-dark');
  });

  it('unknown ID falls back to vscode-light when app is light', () => {
    const result = resolveTerminalTheme('nonexistent-theme', 'light');
    expect(result.id).toBe('vscode-light');
  });

  it('resolves every theme in the catalog', () => {
    for (const theme of TERMINAL_THEMES) {
      const result = resolveTerminalTheme(theme.id);
      expect(result.id).toBe(theme.id);
    }
  });
});

describe('getThemesByCategory', () => {
  it('returns only dark themes when filtering dark', () => {
    const dark = getThemesByCategory('dark');
    expect(dark.length).toBeGreaterThan(0);
    for (const t of dark) {
      expect(t.category).toBe('dark');
    }
  });

  it('returns only light themes when filtering light', () => {
    const light = getThemesByCategory('light');
    expect(light.length).toBeGreaterThan(0);
    for (const t of light) {
      expect(t.category).toBe('light');
    }
  });

  it('dark + light count equals total', () => {
    const dark = getThemesByCategory('dark');
    const light = getThemesByCategory('light');
    expect(dark.length + light.length).toBe(TERMINAL_THEMES.length);
  });
});

describe('DEFAULT_TERMINAL_THEME', () => {
  it('is "auto"', () => {
    expect(DEFAULT_TERMINAL_THEME).toBe('auto');
  });
});
