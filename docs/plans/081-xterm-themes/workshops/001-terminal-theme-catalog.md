# Workshop: Terminal Theme Catalog

**Type**: Data Model
**Plan**: 081-xterm-themes
**Spec**: (pre-spec — research-driven workshop)
**Created**: 2026-04-09
**Status**: Draft

**Related Documents**:
- [Research Dossier](../research-dossier.md)
- [Theme Demo](../theme-demo.html) — open in browser to preview all themes

**Domain Context**:
- **Primary Domain**: `terminal` — owns xterm.js theming (theme definitions, resolution, rendering)
- **Related Domains**: `_platform/themes` (SDK contribution pattern), `_platform/sdk` (settings registration)

---

## Purpose

Define the complete terminal theme catalog: which themes to ship, their exact color palettes, metadata model, categorization, and how theme selection integrates with the existing dark/light system. This workshop drives the implementation data model.

## Key Questions Addressed

- Q1: Which themes should we ship and why those specific ones?
- Q2: What's the exact TypeScript data model for a terminal theme entry?
- Q3: How do named themes interact with the existing dark/light/system toggle?
- Q4: How should themes be categorized and presented in the UI?
- Q5: What metadata do we need beyond the color palette itself?

---

## Theme Selection Criteria

Themes were selected based on:

1. **Community adoption** — GitHub stars across all ports (5000+)
2. **Cross-platform presence** — Available in VS Code, iTerm2, Alacritty, Windows Terminal
3. **Visual distinctiveness** — Each theme offers a meaningfully different aesthetic
4. **Light/dark coverage** — Ensuring good options for both modes
5. **Canonical source availability** — Official palette specs exist

### Theme Catalog (23 themes)

| # | ID | Display Name | Category | Origin | Stars (approx) |
|---|-----|-------------|----------|--------|----------------|
| 1 | `vscode-dark` | VS Code Dark | dark | Microsoft | Built-in |
| 2 | `vscode-light` | VS Code Light | light | Microsoft | Built-in |
| 3 | `dracula` | Dracula | dark | Zeno Rocha | 25k+ |
| 4 | `nord` | Nord | dark | Arctic Ice Studio | 17k+ |
| 5 | `catppuccin-mocha` | Catppuccin Mocha | dark | Catppuccin | 15k+ |
| 6 | `catppuccin-macchiato` | Catppuccin Macchiato | dark | Catppuccin | 15k+ |
| 7 | `catppuccin-frappe` | Catppuccin Frappé | dark | Catppuccin | 15k+ |
| 8 | `catppuccin-latte` | Catppuccin Latte | light | Catppuccin | 15k+ |
| 9 | `gruvbox-dark` | Gruvbox Dark | dark | morhetz | 13k+ |
| 10 | `gruvbox-light` | Gruvbox Light | light | morhetz | 13k+ |
| 11 | `one-dark` | One Dark | dark | Atom | 12k+ |
| 12 | `tokyo-night` | Tokyo Night | dark | enkia/folke | 10k+ |
| 13 | `monokai` | Monokai | dark | Sublime Text | Classic |
| 14 | `night-owl` | Night Owl | dark | Sarah Drasner | 8k+ |
| 15 | `solarized-dark` | Solarized Dark | dark | Ethan Schoonover | 16k+ |
| 16 | `solarized-light` | Solarized Light | light | Ethan Schoonover | 16k+ |
| 17 | `material-dark` | Material Dark | dark | Material Theme | 12k+ |
| 18 | `github-dark` | GitHub Dark | dark | GitHub Primer | 10k+ |
| 19 | `github-light` | GitHub Light | light | GitHub Primer | 10k+ |
| 20 | `rose-pine` | Rosé Pine | dark | Rosé Pine | 8k+ |
| 21 | `rose-pine-dawn` | Rosé Pine Dawn | light | Rosé Pine | 8k+ |
| 22 | `everforest-dark` | Everforest Dark | dark | sainnhe | 7k+ |
| 23 | `kanagawa` | Kanagawa | dark | rebelot | 6k+ |

| 24 | `kimbie-dark` | Kimbie Dark | dark | Jan T. Sott | Classic |
| 25 | `kimbie-light` | Kimbie Light | light | Jan T. Sott | Classic |

**Totals**: 17 dark themes, 8 light themes

---

## TypeScript Data Model

### Theme Entry Type

```typescript
import type { ITheme } from '@xterm/xterm';

/** Unique identifier for a terminal theme */
export type TerminalThemeId = string;

/** Category determines which themes appear in dark vs light mode */
export type TerminalThemeCategory = 'dark' | 'light';

/** Complete metadata for a terminal theme */
export interface TerminalThemeEntry {
  /** Unique slug identifier (e.g., 'dracula', 'catppuccin-mocha') */
  readonly id: TerminalThemeId;
  /** Human-readable display name */
  readonly name: string;
  /** Theme category — dark or light */
  readonly category: TerminalThemeCategory;
  /** Theme family for grouping in UI (e.g., 'Catppuccin', 'Solarized') */
  readonly family?: string;
  /** The actual xterm.js ITheme color palette */
  readonly theme: ITheme;
}

/** Registry of all available terminal themes */
export type TerminalThemeRegistry = readonly TerminalThemeEntry[];
```

### Theme Resolution Function

```typescript
/**
 * Resolve a terminal theme by ID.
 * Falls back to VS Code Dark/Light if the ID is not found.
 */
export function resolveTerminalTheme(
  themeId: TerminalThemeId,
  fallbackCategory: 'dark' | 'light' = 'dark'
): TerminalThemeEntry {
  const entry = TERMINAL_THEMES.find(t => t.id === themeId);
  if (entry) return entry;
  
  // Fallback to default for the given category
  return fallbackCategory === 'light'
    ? TERMINAL_THEMES.find(t => t.id === 'vscode-light')!
    : TERMINAL_THEMES.find(t => t.id === 'vscode-dark')!;
}

/**
 * Get themes filtered by category.
 * Used to populate the theme picker — shows only dark themes when app is dark, etc.
 */
export function getThemesByCategory(
  category: TerminalThemeCategory
): TerminalThemeEntry[] {
  return TERMINAL_THEMES.filter(t => t.category === category);
}
```

### SDK Setting Definition

```typescript
// In terminal SDK contribution (or themes contribution)
{
  key: 'terminal.colorTheme',
  schema: z.string().default('auto'),
  label: 'Terminal Color Theme',
  description: 'Color theme for the terminal emulator',
  section: 'Appearance',
  ui: 'select',
  options: TERMINAL_THEMES.map(t => ({
    value: t.id,
    label: `${t.name} ${t.category === 'light' ? '☀️' : '🌙'}`,
  })),
}
```

---

## Dark/Light Integration Design

### Current System
```
User picks: dark | light | system
  → resolvedTheme from next-themes
  → maps to DARK_THEME or LIGHT_THEME constant
```

### New System
```
User picks: terminal color theme (e.g., 'dracula')
  → stored as SDK setting: terminal.colorTheme = 'dracula'
  → TerminalInner looks up theme by ID
  → If 'auto': picks default theme for current dark/light mode
  → If specific theme: uses that theme regardless of app mode
```

### Auto Mode Behavior

The special value `'auto'` means "follow the app's dark/light mode":
- App is dark → use `vscode-dark`
- App is light → use `vscode-light`

This preserves backward compatibility with the current behavior.

### Theme Override Hierarchy

```
1. SDK Setting: terminal.colorTheme (e.g., 'dracula')
   ↓ if 'auto'
2. App Theme: resolvedTheme from next-themes (dark/light)
   ↓ maps to
3. Default: vscode-dark or vscode-light
```

**Why not per-worktree?** The existing `worktreeIdentity.terminalTheme` (`dark | light | system`) controls which mode the terminal runs in. The new `terminal.colorTheme` is app-wide — you want Dracula everywhere, not just in one worktree. The per-worktree override can still force dark/light mode.

---

## UI Presentation Design

### Theme Picker in Settings Page

The SDK setting renders automatically as a `<select>` in the Settings page. But for a premium feel, we could later upgrade to a visual grid.

### Grouping Strategy

Themes grouped by family in the select dropdown:

```
── Dark Themes ──────────────
VS Code Dark
Dracula
Nord
─ Catppuccin ─
  Catppuccin Mocha
  Catppuccin Macchiato
  Catppuccin Frappé
─ Gruvbox ─
  Gruvbox Dark
One Dark
Tokyo Night
Monokai
Night Owl
Solarized Dark
Material Dark
─ GitHub ─
  GitHub Dark
─ Rosé Pine ─
  Rosé Pine
Everforest Dark
Kanagawa

── Light Themes ─────────────
VS Code Light
Catppuccin Latte
Gruvbox Light
Solarized Light
GitHub Light
Rosé Pine Dawn
```

### Phase 1: Simple Select
Just a flat `<select>` with all themes listed, category prefix icon (🌙/☀️).

### Phase 2 (Future): Visual Grid
Color swatches showing bg/fg/accent preview. Not in scope for this plan.

---

## Complete Color Palettes

All palettes verified from canonical sources (see research dossier for source URLs).

### VS Code Dark (Current Default)
```typescript
{
  id: 'vscode-dark', name: 'VS Code Dark', category: 'dark',
  theme: {
    background: '#1e1e1e', foreground: '#d4d4d4',
    cursor: '#d4d4d4', cursorAccent: '#1e1e1e',
    selectionBackground: '#264f78',
    black: '#1e1e1e', red: '#f44747', green: '#6a9955', yellow: '#d7ba7d',
    blue: '#569cd6', magenta: '#c586c0', cyan: '#4ec9b0', white: '#d4d4d4',
    brightBlack: '#808080', brightRed: '#f44747', brightGreen: '#6a9955',
    brightYellow: '#d7ba7d', brightBlue: '#569cd6', brightMagenta: '#c586c0',
    brightCyan: '#4ec9b0', brightWhite: '#e8e8e8',
  }
}
```

### VS Code Light (Current Default)
```typescript
{
  id: 'vscode-light', name: 'VS Code Light', category: 'light',
  theme: {
    background: '#ffffff', foreground: '#1e1e1e',
    cursor: '#1e1e1e', cursorAccent: '#ffffff',
    selectionBackground: '#add6ff',
    black: '#1e1e1e', red: '#cd3131', green: '#008000', yellow: '#795e26',
    blue: '#0451a5', magenta: '#af00db', cyan: '#0598bc', white: '#d4d4d4',
    brightBlack: '#808080', brightRed: '#cd3131', brightGreen: '#008000',
    brightYellow: '#795e26', brightBlue: '#0451a5', brightMagenta: '#af00db',
    brightCyan: '#0598bc', brightWhite: '#1e1e1e',
  }
}
```

### Dracula
```typescript
{
  id: 'dracula', name: 'Dracula', category: 'dark',
  theme: {
    background: '#282A36', foreground: '#F8F8F2',
    cursor: '#F8F8F2', cursorAccent: '#282A36',
    selectionBackground: '#44475A',
    black: '#21222C', red: '#FF5555', green: '#50FA7B', yellow: '#F1FA8C',
    blue: '#BD93F9', magenta: '#FF79C6', cyan: '#8BE9FD', white: '#F8F8F2',
    brightBlack: '#6272A4', brightRed: '#FF6E6E', brightGreen: '#69FF94',
    brightYellow: '#FFFFA5', brightBlue: '#D6ACFF', brightMagenta: '#FF92DF',
    brightCyan: '#A4FFFF', brightWhite: '#FFFFFF',
  }
}
```

### Nord
```typescript
{
  id: 'nord', name: 'Nord', category: 'dark',
  theme: {
    background: '#2E3440', foreground: '#D8DEE9',
    cursor: '#D8DEE9', cursorAccent: '#2E3440',
    selectionBackground: '#434C5E',
    black: '#3B4252', red: '#BF616A', green: '#A3BE8C', yellow: '#EBCB8B',
    blue: '#81A1C1', magenta: '#B48EAD', cyan: '#88C0D0', white: '#E5E9F0',
    brightBlack: '#4C566A', brightRed: '#D08770', brightGreen: '#A3BE8C',
    brightYellow: '#EBCB8B', brightBlue: '#81A1C1', brightMagenta: '#B48EAD',
    brightCyan: '#8FBCBB', brightWhite: '#ECEFF4',
  }
}
```

### Catppuccin Mocha
```typescript
{
  id: 'catppuccin-mocha', name: 'Catppuccin Mocha', category: 'dark',
  family: 'Catppuccin',
  theme: {
    background: '#1E1E2E', foreground: '#CDD6F4',
    cursor: '#CDD6F4', cursorAccent: '#1E1E2E',
    selectionBackground: '#45475A',
    black: '#45475A', red: '#F38BA8', green: '#A6E3A1', yellow: '#F9E2AF',
    blue: '#89B4FA', magenta: '#F5C2E7', cyan: '#94E2D5', white: '#BAC2DE',
    brightBlack: '#585B70', brightRed: '#F38BA8', brightGreen: '#A6E3A1',
    brightYellow: '#F9E2AF', brightBlue: '#89B4FA', brightMagenta: '#F5C2E7',
    brightCyan: '#94E2D5', brightWhite: '#A6ADC8',
  }
}
```

### Catppuccin Macchiato
```typescript
{
  id: 'catppuccin-macchiato', name: 'Catppuccin Macchiato', category: 'dark',
  family: 'Catppuccin',
  theme: {
    background: '#24273A', foreground: '#CAD3F5',
    cursor: '#CAD3F5', cursorAccent: '#24273A',
    selectionBackground: '#5B6078',
    black: '#494D64', red: '#ED8796', green: '#A6DA95', yellow: '#EED49F',
    blue: '#8AADF4', magenta: '#F5BDE6', cyan: '#8BD5CA', white: '#B8C0E0',
    brightBlack: '#5B6078', brightRed: '#ED8796', brightGreen: '#A6DA95',
    brightYellow: '#EED49F', brightBlue: '#8AADF4', brightMagenta: '#F5BDE6',
    brightCyan: '#8BD5CA', brightWhite: '#A5ADCB',
  }
}
```

### Catppuccin Frappé
```typescript
{
  id: 'catppuccin-frappe', name: 'Catppuccin Frappé', category: 'dark',
  family: 'Catppuccin',
  theme: {
    background: '#303446', foreground: '#C6D0F5',
    cursor: '#C6D0F5', cursorAccent: '#303446',
    selectionBackground: '#626880',
    black: '#51576D', red: '#E78284', green: '#A6D189', yellow: '#E5C890',
    blue: '#8CAAEE', magenta: '#F4B8E4', cyan: '#81C8BE', white: '#B5BFE2',
    brightBlack: '#626880', brightRed: '#E78284', brightGreen: '#A6D189',
    brightYellow: '#E5C890', brightBlue: '#8CAAEE', brightMagenta: '#F4B8E4',
    brightCyan: '#81C8BE', brightWhite: '#A5ADCE',
  }
}
```

### Catppuccin Latte
```typescript
{
  id: 'catppuccin-latte', name: 'Catppuccin Latte', category: 'light',
  family: 'Catppuccin',
  theme: {
    background: '#EFF1F5', foreground: '#4C4F69',
    cursor: '#DC8A78', cursorAccent: '#EFF1F5',
    selectionBackground: '#ACB0BE',
    black: '#5C5F77', red: '#D20F39', green: '#40A02B', yellow: '#DF8E1D',
    blue: '#1E66F5', magenta: '#EA76CB', cyan: '#04A5E5', white: '#ACB0BE',
    brightBlack: '#6C6F85', brightRed: '#D20F39', brightGreen: '#40A02B',
    brightYellow: '#DF8E1D', brightBlue: '#1E66F5', brightMagenta: '#EA76CB',
    brightCyan: '#04A5E5', brightWhite: '#BCC0CC',
  }
}
```

### Gruvbox Dark
```typescript
{
  id: 'gruvbox-dark', name: 'Gruvbox Dark', category: 'dark',
  family: 'Gruvbox',
  theme: {
    background: '#282828', foreground: '#EBDBB2',
    cursor: '#EBDBB2', cursorAccent: '#282828',
    selectionBackground: '#504945',
    black: '#282828', red: '#CC241D', green: '#98971A', yellow: '#D79921',
    blue: '#458588', magenta: '#B16286', cyan: '#689D6A', white: '#A89984',
    brightBlack: '#928374', brightRed: '#FB4934', brightGreen: '#B8BB26',
    brightYellow: '#FABD2F', brightBlue: '#83A598', brightMagenta: '#D3869B',
    brightCyan: '#8EC07C', brightWhite: '#EBDBB2',
  }
}
```

### Gruvbox Light
```typescript
{
  id: 'gruvbox-light', name: 'Gruvbox Light', category: 'light',
  family: 'Gruvbox',
  theme: {
    background: '#FBF1C7', foreground: '#3C3836',
    cursor: '#3C3836', cursorAccent: '#FBF1C7',
    selectionBackground: '#D5C4A1',
    black: '#FBF1C7', red: '#CC241D', green: '#98971A', yellow: '#D79921',
    blue: '#458588', magenta: '#B16286', cyan: '#689D6A', white: '#7C6F64',
    brightBlack: '#928374', brightRed: '#9D0006', brightGreen: '#79740E',
    brightYellow: '#B57614', brightBlue: '#076678', brightMagenta: '#8F3F71',
    brightCyan: '#427B58', brightWhite: '#3C3836',
  }
}
```

### One Dark
```typescript
{
  id: 'one-dark', name: 'One Dark', category: 'dark',
  theme: {
    background: '#282C34', foreground: '#ABB2BF',
    cursor: '#528BFF', cursorAccent: '#282C34',
    selectionBackground: '#3E4451',
    black: '#282C34', red: '#E06C75', green: '#98C379', yellow: '#D19A66',
    blue: '#61AFEF', magenta: '#C678DD', cyan: '#56B6C2', white: '#ABB2BF',
    brightBlack: '#5C6370', brightRed: '#E06C75', brightGreen: '#98C379',
    brightYellow: '#D19A66', brightBlue: '#61AFEF', brightMagenta: '#C678DD',
    brightCyan: '#56B6C2', brightWhite: '#FFFFFF',
  }
}
```

### Tokyo Night
```typescript
{
  id: 'tokyo-night', name: 'Tokyo Night', category: 'dark',
  theme: {
    background: '#1A1B26', foreground: '#C0CAF5',
    cursor: '#C0CAF5', cursorAccent: '#1A1B26',
    selectionBackground: '#283457',
    black: '#15161E', red: '#F7768E', green: '#9ECE6A', yellow: '#E0AF68',
    blue: '#7AA2F7', magenta: '#BB9AF7', cyan: '#7DCFFF', white: '#A9B1D6',
    brightBlack: '#414868', brightRed: '#F7768E', brightGreen: '#9ECE6A',
    brightYellow: '#E0AF68', brightBlue: '#7AA2F7', brightMagenta: '#BB9AF7',
    brightCyan: '#7DCFFF', brightWhite: '#C0CAF5',
  }
}
```

### Monokai
```typescript
{
  id: 'monokai', name: 'Monokai', category: 'dark',
  theme: {
    background: '#272822', foreground: '#F8F8F2',
    cursor: '#F8F8F0', cursorAccent: '#272822',
    selectionBackground: '#49483E',
    black: '#272822', red: '#F92672', green: '#A6E22E', yellow: '#E6DB74',
    blue: '#66D9EF', magenta: '#AE81FF', cyan: '#A1EFE4', white: '#F8F8F2',
    brightBlack: '#75715E', brightRed: '#F92672', brightGreen: '#A6E22E',
    brightYellow: '#E6DB74', brightBlue: '#66D9EF', brightMagenta: '#AE81FF',
    brightCyan: '#A1EFE4', brightWhite: '#F9F8F5',
  }
}
```

### Night Owl
```typescript
{
  id: 'night-owl', name: 'Night Owl', category: 'dark',
  theme: {
    background: '#011627', foreground: '#D6DEEB',
    cursor: '#80A4C2', cursorAccent: '#011627',
    selectionBackground: '#1D3B53',
    black: '#011627', red: '#EF5350', green: '#22DA6E', yellow: '#ADDB67',
    blue: '#82AAFF', magenta: '#C792EA', cyan: '#21C7A8', white: '#D6DEEB',
    brightBlack: '#575656', brightRed: '#EF5350', brightGreen: '#22DA6E',
    brightYellow: '#FFEB95', brightBlue: '#82AAFF', brightMagenta: '#C792EA',
    brightCyan: '#7FDBCA', brightWhite: '#FFFFFF',
  }
}
```

### Solarized Dark
```typescript
{
  id: 'solarized-dark', name: 'Solarized Dark', category: 'dark',
  family: 'Solarized',
  theme: {
    background: '#002B36', foreground: '#839496',
    cursor: '#839496', cursorAccent: '#002B36',
    selectionBackground: '#073642',
    black: '#073642', red: '#DC322F', green: '#859900', yellow: '#B58900',
    blue: '#268BD2', magenta: '#D33682', cyan: '#2AA198', white: '#EEE8D5',
    brightBlack: '#002B36', brightRed: '#CB4B16', brightGreen: '#586E75',
    brightYellow: '#657B83', brightBlue: '#839496', brightMagenta: '#6C71C4',
    brightCyan: '#93A1A1', brightWhite: '#FDF6E3',
  }
}
```

### Solarized Light
```typescript
{
  id: 'solarized-light', name: 'Solarized Light', category: 'light',
  family: 'Solarized',
  theme: {
    background: '#FDF6E3', foreground: '#657B83',
    cursor: '#657B83', cursorAccent: '#FDF6E3',
    selectionBackground: '#EEE8D5',
    black: '#EEE8D5', red: '#DC322F', green: '#859900', yellow: '#B58900',
    blue: '#268BD2', magenta: '#D33682', cyan: '#2AA198', white: '#073642',
    brightBlack: '#FDF6E3', brightRed: '#CB4B16', brightGreen: '#93A1A1',
    brightYellow: '#839496', brightBlue: '#657B83', brightMagenta: '#6C71C4',
    brightCyan: '#586E75', brightWhite: '#002B36',
  }
}
```

### Material Dark
```typescript
{
  id: 'material-dark', name: 'Material Dark', category: 'dark',
  theme: {
    background: '#212121', foreground: '#EEFFFF',
    cursor: '#FFCC00', cursorAccent: '#212121',
    selectionBackground: '#404040',
    black: '#212121', red: '#F07178', green: '#C3E88D', yellow: '#FFCB6B',
    blue: '#82AAFF', magenta: '#C792EA', cyan: '#89DDFF', white: '#EEFFFF',
    brightBlack: '#545454', brightRed: '#F07178', brightGreen: '#C3E88D',
    brightYellow: '#FFCB6B', brightBlue: '#82AAFF', brightMagenta: '#C792EA',
    brightCyan: '#89DDFF', brightWhite: '#FFFFFF',
  }
}
```

### GitHub Dark
```typescript
{
  id: 'github-dark', name: 'GitHub Dark', category: 'dark',
  family: 'GitHub',
  theme: {
    background: '#0D1117', foreground: '#C9D1D9',
    cursor: '#58A6FF', cursorAccent: '#0D1117',
    selectionBackground: '#3B5070',
    black: '#0D1117', red: '#FF7B72', green: '#3FB950', yellow: '#D29922',
    blue: '#58A6FF', magenta: '#BC8CFF', cyan: '#39C5CF', white: '#C9D1D9',
    brightBlack: '#484F58', brightRed: '#FFA198', brightGreen: '#56D364',
    brightYellow: '#E3B341', brightBlue: '#79C0FF', brightMagenta: '#D2A8FF',
    brightCyan: '#56D4DD', brightWhite: '#F0F6FC',
  }
}
```

### GitHub Light
```typescript
{
  id: 'github-light', name: 'GitHub Light', category: 'light',
  family: 'GitHub',
  theme: {
    background: '#FFFFFF', foreground: '#24292F',
    cursor: '#0969DA', cursorAccent: '#FFFFFF',
    selectionBackground: '#BBDFFF',
    black: '#24292F', red: '#CF222E', green: '#116329', yellow: '#4D2D00',
    blue: '#0969DA', magenta: '#8250DF', cyan: '#1B7C83', white: '#6E7781',
    brightBlack: '#57606A', brightRed: '#A40E26', brightGreen: '#1A7F37',
    brightYellow: '#633C01', brightBlue: '#218BFF', brightMagenta: '#8250DF',
    brightCyan: '#3192AA', brightWhite: '#8C959F',
  }
}
```

### Rosé Pine
```typescript
{
  id: 'rose-pine', name: 'Rosé Pine', category: 'dark',
  family: 'Rosé Pine',
  theme: {
    background: '#191724', foreground: '#E0DEF4',
    cursor: '#524F67', cursorAccent: '#E0DEF4',
    selectionBackground: '#403D52',
    black: '#26233A', red: '#EB6F92', green: '#31748F', yellow: '#F6C177',
    blue: '#9CCFD8', magenta: '#C4A7E7', cyan: '#EBBCBA', white: '#E0DEF4',
    brightBlack: '#6E6A86', brightRed: '#EB6F92', brightGreen: '#31748F',
    brightYellow: '#F6C177', brightBlue: '#9CCFD8', brightMagenta: '#C4A7E7',
    brightCyan: '#EBBCBA', brightWhite: '#E0DEF4',
  }
}
```

### Rosé Pine Dawn
```typescript
{
  id: 'rose-pine-dawn', name: 'Rosé Pine Dawn', category: 'light',
  family: 'Rosé Pine',
  theme: {
    background: '#FAF4ED', foreground: '#575279',
    cursor: '#9893A5', cursorAccent: '#575279',
    selectionBackground: '#F2E9DE',
    black: '#575279', red: '#B4637A', green: '#286983', yellow: '#EA9D34',
    blue: '#56949F', magenta: '#907AA9', cyan: '#D7827E', white: '#F2E9DE',
    brightBlack: '#9893A5', brightRed: '#B4637A', brightGreen: '#286983',
    brightYellow: '#EA9D34', brightBlue: '#56949F', brightMagenta: '#907AA9',
    brightCyan: '#D7827E', brightWhite: '#FAF4ED',
  }
}
```

### Everforest Dark
```typescript
{
  id: 'everforest-dark', name: 'Everforest Dark', category: 'dark',
  theme: {
    background: '#2D353B', foreground: '#D3C6AA',
    cursor: '#D3C6AA', cursorAccent: '#2D353B',
    selectionBackground: '#543A48',
    black: '#343F44', red: '#E67E80', green: '#A7C080', yellow: '#DBBC7F',
    blue: '#7FBBB3', magenta: '#D699B6', cyan: '#83C092', white: '#D3C6AA',
    brightBlack: '#475258', brightRed: '#E67E80', brightGreen: '#A7C080',
    brightYellow: '#DBBC7F', brightBlue: '#7FBBB3', brightMagenta: '#D699B6',
    brightCyan: '#83C092', brightWhite: '#D3C6AA',
  }
}
```

### Kanagawa
```typescript
{
  id: 'kanagawa', name: 'Kanagawa', category: 'dark',
  theme: {
    background: '#1F1F28', foreground: '#DCD7BA',
    cursor: '#C8C093', cursorAccent: '#1F1F28',
    selectionBackground: '#2D4F67',
    black: '#16161D', red: '#C34043', green: '#76946A', yellow: '#C0A36E',
    blue: '#7E9CD8', magenta: '#957FB8', cyan: '#6A9589', white: '#C8C093',
    brightBlack: '#727169', brightRed: '#E82424', brightGreen: '#98BB6C',
    brightYellow: '#E6C384', brightBlue: '#7FB4CA', brightMagenta: '#938AA9',
    brightCyan: '#7AA89F', brightWhite: '#DCD7BA',
  }
}
```

### Kimbie Dark
```typescript
{
  id: 'kimbie-dark', name: 'Kimbie Dark', category: 'dark',
  family: 'Kimbie',
  theme: {
    background: '#221A0F', foreground: '#D3AF86',
    cursor: '#D3AF86', cursorAccent: '#221A0F',
    selectionBackground: '#84613D',
    black: '#221A0F', red: '#DC3958', green: '#889B4A', yellow: '#F79A32',
    blue: '#719190', magenta: '#98676A', cyan: '#4C96A8', white: '#D3AF86',
    brightBlack: '#5E452B', brightRed: '#F14A68', brightGreen: '#A3B95A',
    brightYellow: '#FCAC51', brightBlue: '#8AB1B0', brightMagenta: '#AD7E81',
    brightCyan: '#73B3B2', brightWhite: '#F6E6CB',
  }
}
```

### Kimbie Light
```typescript
{
  id: 'kimbie-light', name: 'Kimbie Light', category: 'light',
  family: 'Kimbie',
  theme: {
    background: '#FBEBD4', foreground: '#84613D',
    cursor: '#84613D', cursorAccent: '#FBEBD4',
    selectionBackground: '#D9C2A0',
    black: '#84613D', red: '#DC3958', green: '#889B4A', yellow: '#F79A32',
    blue: '#719190', magenta: '#98676A', cyan: '#4C96A8', white: '#E0C8A8',
    brightBlack: '#A57A4C', brightRed: '#CC2649', brightGreen: '#6E843A',
    brightYellow: '#D88628', brightBlue: '#5B7A79', brightMagenta: '#7E5053',
    brightCyan: '#418292', brightWhite: '#3B2A14',
  }
}
```

---

## Open Questions

### Q1: Should we add `'auto'` as a special theme ID?

**RESOLVED**: Yes. `'auto'` means "follow the app's dark/light mode and use the corresponding VS Code theme." This is the default value for the SDK setting and preserves backward compatibility.

### Q2: Where to contribute the SDK setting — terminal domain or themes domain?

**RESOLVED**: Terminal domain contributes its own setting via `terminal/sdk/contribution.ts`. The themes domain is infrastructure for icon themes specifically. Terminal themes are terminal-internal. The setting key will be `terminal.colorTheme` (not `themes.terminalTheme`).

### Q3: Should the Ayu themes be included?

**RESOLVED**: No. The deep research provided palettes, but Ayu has lower community adoption than the 23 selected themes and some color values were uncertain. Can be added later.

### Q4: How many Catppuccin flavors to include?

**RESOLVED**: All 4 (Mocha, Macchiato, Frappé, Latte). Catppuccin is one of the most popular theme families and users expect all flavors.

---

## Validation Rules

1. **Every theme MUST have all 16 ANSI colors** — no optional fields for ANSI palette
2. **Every theme MUST have background, foreground, cursor, cursorAccent, selectionBackground** — these 5 are required for a good UX
3. **Theme IDs are kebab-case** — lowercase letters, numbers, hyphens only
4. **Theme IDs are unique** — enforced by TypeScript const assertion
5. **Category must match visual intent** — light themes have light backgrounds, dark themes have dark backgrounds
6. **Each theme object is frozen** — xterm v6 requires new object references for updates (PL-01)

---

## Next Steps

- Review theme palettes in the [HTML demo](../theme-demo.html)
- Proceed to `/plan-1b-specify` to write the feature specification
- Then `/plan-3-architect` to plan implementation phases
