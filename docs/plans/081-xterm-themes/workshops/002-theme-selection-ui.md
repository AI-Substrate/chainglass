# Workshop: Terminal Theme Selection UI

**Type**: UI Design
**Plan**: 081-xterm-themes
**Spec**: [xterm-themes-spec.md](../xterm-themes-spec.md)
**Created**: 2026-04-10
**Status**: Draft

**Related Documents**:
- [Workshop 001 — Theme Catalog](001-terminal-theme-catalog.md) — data model, palettes, SDK integration
- [Theme Demo](../theme-demo.html) — visual preview of all 25 themes

**Domain Context**:
- **Primary Domain**: `terminal` — owns the theme selector UI
- **Related Domains**: `_platform/sdk` (setting persistence), `_platform/panel-layout` (PanelShell explorer slot)

---

## Purpose

Define where the terminal theme picker lives, how it looks, and how the selection persists. The spec said "SDK setting in Settings page" but the user wants it **directly above the terminal** as a button — not buried in settings. This workshop resolves the placement, interaction pattern, and persistence mechanism.

## Key Questions Addressed

- Q1: Where does the theme picker UI go? (Header above terminal — both page and overlay)
- Q2: What interaction pattern? (Compact Select dropdown triggered by a Palette icon button)
- Q3: How does the selection persist? (SDK setting via `useSDKSetting` — auto-persisted to workspace prefs)
- Q4: Does it also appear in the Settings page? (Yes — SDK contribution gives us both for free)

---

## Q1: Placement — Where Does the Picker Go?

### Current Terminal Header Layout

**Terminal Page** (`TerminalPageHeader`):
```
┌─────────────────────────────────────────────────────────────────────┐
│  🖥  session-name                              📋 ● connected      │
│  TerminalSquare  text                     CopyBuffer  StatusBadge  │
└─────────────────────────────────────────────────────────────────────┘
```

**Overlay Panel** (`TerminalOverlayPanel` header):
```
┌─────────────────────────────────────────────────────────────────────┐
│  🖥  session-name                         📋 ● ✕                   │
│  TerminalSquare  text               CopyBuffer  Status  Close      │
└─────────────────────────────────────────────────────────────────────┘
```

### New Layout — Theme Picker Added

**Terminal Page** (`TerminalPageHeader`):
```
┌─────────────────────────────────────────────────────────────────────┐
│  🖥  session-name                         🎨 📋 ● connected        │
│  TerminalSquare  text               Palette CopyBuf  StatusBadge   │
└─────────────────────────────────────────────────────────────────────┘
                                        ▲
                                        │
                                   ┌────┴────────────────────┐
                                   │  ── Dark Themes ──      │
                                   │  ✓ Auto                 │
                                   │    VS Code Dark         │
                                   │    Dracula              │
                                   │    Nord                 │
                                   │    Catppuccin Mocha     │
                                   │    ...                  │
                                   │  ── Light Themes ──     │
                                   │    VS Code Light        │
                                   │    Catppuccin Latte     │
                                   │    ...                  │
                                   └─────────────────────────┘
```

**Overlay Panel** — same position (between copy button and status badge):
```
┌─────────────────────────────────────────────────────────────────────┐
│  🖥  session-name                    🎨 📋 ● ✕                     │
│  TerminalSquare  text          Palette CopyBuf Status Close        │
└─────────────────────────────────────────────────────────────────────┘
```

### Placement Decision

**RESOLVED**: The theme picker is a **small icon button** in the header's right-side action group, positioned **before** the copy buffer button. It uses the `Palette` icon from lucide-react (artist's palette with colored dots — visually distinct, universally understood).

**Why before copy, not after?** Copy and status are "session actions" (per-session state). Theme is a "display preference" (global). Putting it first in the group creates a natural left-to-right flow: preference → action → status.

---

## Q2: Interaction Pattern — How Does the Picker Work?

### Option A: Radix Select (like Settings page) ❌
```tsx
<Select value={theme} onValueChange={setTheme}>
  <SelectTrigger className="w-40">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>...</SelectContent>
</Select>
```
**Problem**: `SelectTrigger` renders as a visible text box with a chevron — too wide for the compact header. It would dominate the header area.

### Option B: Popover with custom list ❌
```tsx
<Popover>
  <PopoverTrigger><Palette /></PopoverTrigger>
  <PopoverContent>
    {themes.map(t => <button .../>)}
  </PopoverContent>
</Popover>
```
**Problem**: Reinvents select behavior (keyboard nav, scroll, highlighting). More code, less accessible.

### Option C: Radix Select with icon-only trigger ✅
```tsx
<Select value={themeId} onValueChange={setThemeId}>
  <SelectTrigger className="w-auto p-1 border-0 bg-transparent" aria-label="Terminal theme">
    <Palette className="h-3.5 w-3.5 text-muted-foreground" />
  </SelectTrigger>
  <SelectContent align="end" className="w-56">
    <SelectGroup>
      <SelectLabel>Dark Themes</SelectLabel>
      <SelectItem value="auto">Auto (follow app theme)</SelectItem>
      <SelectItem value="dracula">🌙 Dracula</SelectItem>
      ...
    </SelectGroup>
    <SelectGroup>
      <SelectLabel>Light Themes</SelectLabel>
      <SelectItem value="catppuccin-latte">☀️ Catppuccin Latte</SelectItem>
      ...
    </SelectGroup>
  </SelectContent>
</Select>
```

**RESOLVED**: Option C. Benefits:
- **Compact trigger** — just the Palette icon, same size as the copy button
- **Full accessibility** — Radix Select handles keyboard nav, focus, screen readers
- **Grouped options** — `SelectGroup` + `SelectLabel` for dark/light categories
- **Aligned right** — `align="end"` prevents the dropdown from overflowing the viewport
- **Hover tooltip** — add `title="Terminal theme"` to the trigger for discoverability

### Color Preview Swatch

Each option can include a small inline color swatch showing the theme's background color, giving users a visual preview without opening each theme:

```tsx
<SelectItem value="dracula">
  <span className="flex items-center gap-2">
    <span className="inline-block w-3 h-3 rounded-sm border" style={{ background: '#282A36' }} />
    <span>Dracula</span>
  </span>
</SelectItem>
```

This makes the dropdown itself feel premium — you can see the background tone of each theme before selecting.

---

## Q3: Persistence — How Does the Setting Persist?

### The SDK Setting Path

The theme selection persists via the **SDK settings system**. This is the same infrastructure that persists `themes.iconTheme` and all other SDK settings.

**Flow**:
```
User selects theme in dropdown
  → useSDKSetting<string>('terminal.colorTheme') setValue('dracula')
    → SettingsStore.set('terminal.colorTheme', 'dracula')
      → onChange listeners fire (TerminalInner re-renders)
      → debounced persist (300ms) → updateSDKSettings server action
        → workspace preferences JSON on disk
```

**On page load**:
```
Server renders page
  → SDKProvider boots → SettingsStore created
    → SDKWorkspaceConnector hydrates from workspace prefs
      → SettingsStore has 'terminal.colorTheme' = 'dracula'
        → useSDKSetting returns 'dracula'
          → TerminalInner resolves Dracula ITheme
            → xterm renders with Dracula palette
```

### Why Not Local State?

- **LocalStorage**: Doesn't sync across devices/workspaces. Not the pattern this codebase uses.
- **WorktreeIdentity**: Per-worktree, but themes should be global. Also, this field is already typed as `'dark' | 'light' | 'system'` — changing it is a breaking schema change.
- **SDK Settings**: ✅ Already handles persistence, hydration, validation, and UI rendering. Zero new infrastructure.

### Where the Setting Lives on Disk

```
.chainglass/data/workspaces/<slug>/preferences.json
  → sdkSettings: { "terminal.colorTheme": "dracula" }
```

This file already exists and stores other SDK settings. The new key is just another entry.

---

## Q4: Settings Page — Do We Show It There Too?

**Yes** — for free. By registering `terminal.colorTheme` as an SDK contribution with `ui: 'select'`, it automatically appears in the Settings page under "Appearance". Users who prefer to configure via settings can do it there. Users who want quick access use the header button.

Both UI surfaces read/write the same `useSDKSetting('terminal.colorTheme')` — changes in one are instantly reflected in the other.

---

## Component Design

### TerminalThemeSelect Component

New component: `apps/web/src/features/064-terminal/components/terminal-theme-select.tsx`

```tsx
'use client';

import { Palette } from 'lucide-react';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger,
} from '@/components/ui/select';
import { useSDKSetting } from '@/lib/sdk/use-sdk-setting';
import { TERMINAL_THEMES } from '../lib/terminal-themes';

export function TerminalThemeSelect() {
  const [themeId, setThemeId] = useSDKSetting<string>('terminal.colorTheme');

  const darkThemes = TERMINAL_THEMES.filter(t => t.category === 'dark');
  const lightThemes = TERMINAL_THEMES.filter(t => t.category === 'light');

  return (
    <Select value={themeId ?? 'auto'} onValueChange={setThemeId}>
      <SelectTrigger
        className="w-auto h-auto p-1 border-0 bg-transparent shadow-none
                   text-muted-foreground hover:text-foreground hover:bg-accent rounded-sm"
        aria-label="Terminal color theme"
        title="Terminal color theme"
      >
        <Palette className="h-3.5 w-3.5" />
      </SelectTrigger>
      <SelectContent align="end" className="w-60 max-h-80">
        <SelectItem value="auto">
          <span className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm border border-border
                            bg-gradient-to-r from-[#1e1e1e] to-[#ffffff]" />
            Auto (follow app theme)
          </span>
        </SelectItem>

        <SelectGroup>
          <SelectLabel>Dark Themes</SelectLabel>
          {darkThemes.map(t => (
            <SelectItem key={t.id} value={t.id}>
              <span className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-sm border border-border"
                  style={{ background: t.theme.background }}
                />
                {t.name}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>

        <SelectGroup>
          <SelectLabel>Light Themes</SelectLabel>
          {lightThemes.map(t => (
            <SelectItem key={t.id} value={t.id}>
              <span className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-sm border border-border"
                  style={{ background: t.theme.background }}
                />
                {t.name}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
```

### Integration Points

**TerminalPageHeader** — add between session name and copy button:
```tsx
// terminal-page-header.tsx
import { TerminalThemeSelect } from './terminal-theme-select';

// In the right-side actions div:
<div className="flex items-center gap-2">
  <TerminalThemeSelect />     {/* NEW */}
  <button onClick={copyTmuxBuffer} ...>
    <ClipboardCopy ... />
  </button>
  <ConnectionStatusBadge ... />
</div>
```

**TerminalOverlayPanel** — same position in overlay header:
```tsx
// terminal-overlay-panel.tsx
import { TerminalThemeSelect } from './terminal-theme-select';

// In the right-side actions div:
<div className="flex items-center gap-2">
  <TerminalThemeSelect />     {/* NEW */}
  <button onClick={copyTmuxBuffer} ...>
    <ClipboardCopy ... />
  </button>
  <ConnectionStatusBadge ... />
  <button onClick={closeTerminal} ...>
    <X ... />
  </button>
</div>
```

---

## Open Questions

### Q1: Should the Palette icon change color to match the active theme?

**RESOLVED**: No. Keep it `text-muted-foreground` like the other header icons. The dropdown itself shows the active selection via the checkmark. Making the icon change color would be cute but inconsistent with the other header buttons.

### Q2: Should we show a preview of the terminal colors in the dropdown?

**RESOLVED**: Yes, but minimal — just a small color swatch (3×3 rounded square) showing the theme's background color next to each name. A full color strip (all 16 ANSI colors) would be too busy for a dropdown. The HTML demo serves as the full preview.

### Q3: What about the existing WorktreeIdentityPopover terminal theme picker?

**RESOLVED**: Leave it for now. It controls dark/light/system mode which is still relevant for `auto` mode (determines which direction `auto` resolves). Future cleanup can remove it if we add family-based auto modes (e.g., "auto-catppuccin"). Document the dual-control in the domain.md.

---

## Plan Impact

This workshop adds one new task and modifies two existing tasks:

**New Task** (add to plan):
- **T006b**: Create `TerminalThemeSelect` component + integrate into `TerminalPageHeader` and `TerminalOverlayPanel`

**Modified Tasks**:
- **T004**: SDK contribution default should be `'auto'` (confirmed by DYK #4)
- **T006**: TerminalInner now only needs to consume the SDK setting — the Select component is separate

**New File**:
- `apps/web/src/features/064-terminal/components/terminal-theme-select.tsx`

---

## Visual Mockup Reference

The dropdown will look similar to this (rendered in-app):

```
  ┌──────────────────────────────────┐
  │ ▓░ Auto (follow app theme)    ✓ │
  │──────────────────────────────────│
  │ Dark Themes                      │
  │ ▓  VS Code Dark                  │
  │ ▓  Dracula                       │
  │ ▓  Nord                          │
  │ ▓  Catppuccin Mocha              │
  │ ▓  Catppuccin Macchiato          │
  │ ▓  Catppuccin Frappé             │
  │ ▓  Gruvbox Dark                  │
  │ ▓  One Dark                      │
  │ ▓  Tokyo Night                   │
  │ ▓  Monokai                       │
  │ ▓  Night Owl                     │
  │ ▓  Solarized Dark                │
  │ ▓  Material Dark                 │
  │ ▓  GitHub Dark                   │
  │ ▓  Rosé Pine                     │
  │ ▓  Everforest Dark               │
  │ ▓  Kanagawa                      │
  │ ▓  Kimbie Dark                   │
  │──────────────────────────────────│
  │ Light Themes                     │
  │ ░  VS Code Light                 │
  │ ░  Catppuccin Latte              │
  │ ░  Gruvbox Light                 │
  │ ░  Solarized Light               │
  │ ░  GitHub Light                  │
  │ ░  Rosé Pine Dawn                │
  │ ░  Ayu Light (if added)          │
  │ ░  Kimbie Light                  │
  └──────────────────────────────────┘
```

Each ▓/░ is a small colored square showing the theme's background color.

---

## Next Steps

- Update the plan with the new task (T006b)
- Proceed to `/plan-6-v2-implement-phase`
