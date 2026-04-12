# xterm.js Terminal Color Themes

**Mode**: Simple

📚 This specification incorporates findings from `research-dossier.md` and workshop `001-terminal-theme-catalog.md`.

## Research Context

The terminal currently has two hardcoded color palettes (VS Code Dark / VS Code Light) in `terminal-inner.tsx`. Theme selection is limited to `dark | light | system` via workspace preferences. Research identified 25 community-standard terminal themes with verified canonical color palettes. The existing SDK settings pattern (`themes.iconTheme`) provides a proven integration path. No new dependencies are needed — xterm.js `ITheme` is a flat 30-field object, and themes are simply TypeScript constant objects.

## Summary

**WHAT**: Add a catalog of 25 popular terminal color themes (Dracula, Nord, Catppuccin, Solarized, Gruvbox, Kimbie, etc.) that users can select from to personalize the terminal emulator's appearance.

**WHY**: The terminal is one of the most-used surfaces in the app, but its current look is limited to generic VS Code dark/light. Users expect the same visual customization they get in VS Code, iTerm2, and Terminus. A themed terminal makes the app feel polished and personal — it's the kind of detail power users notice and appreciate.

## Goals

- Users can select from 25 popular terminal color themes via a settings dropdown
- Theme changes apply instantly to all open terminal instances (no refresh needed)
- An "Auto" mode follows the app's dark/light toggle and uses the appropriate VS Code default theme
- Light and dark themes are clearly categorized so users can quickly find themes matching their preference
- Theme selection persists across sessions
- The terminal preview in the [HTML demo](theme-demo.html) matches the actual rendered terminal

## Non-Goals

- Custom/user-defined themes (editing individual color values)
- Theme import/export (e.g., importing `.itermcolors` files)
- Per-worktree theme selection (theme is app-wide via SDK settings)
- 256-color extended ANSI palette (standard 16 ANSI colors only)
- Terminal font selection (separate future feature)
- Visual theme preview grid in settings (Phase 1 uses a simple `<select>` dropdown)

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `terminal` | existing | **modify** | Theme catalog, theme resolution, theme application in TerminalInner |
| `_platform/themes` | existing | **consume** | Follow the SDK contribution pattern (reference only — no code changes) |
| `_platform/sdk` | existing | **consume** | Settings contribution and persistence infrastructure |

No new domains are needed. The terminal domain owns all theme-related code (definitions, resolution, rendering). The SDK infrastructure is consumed for settings registration but not modified.

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=0, D=1, N=0, F=0, T=1
- **Confidence**: 0.95
- **Assumptions**:
  - xterm.js v6 `options.theme` assignment triggers a re-render (confirmed by research — PL-01)
  - SDK settings `select` UI renders without custom components
  - All 25 theme palettes are accurate from canonical sources
- **Dependencies**: None external. Internal: `@xterm/xterm` ITheme interface (already installed)
- **Risks**:
  - Some theme palettes from Perplexity/deep research may have minor color inaccuracies vs canonical source — low impact, easy to patch
  - Existing `worktreeIdentity.terminalTheme` (`dark | light | system`) coexistence — need clean migration path
- **Phases**: Single implementation phase (theme catalog + SDK setting + wiring + tests)

### Complexity Rationale
- **S=1**: Multiple files modified (terminal-inner, new catalog file, SDK contribution, types) but all within one domain
- **I=0**: No external dependencies, pure internal work
- **D=1**: Minor state addition — new SDK setting persisted to workspace preferences
- **N=0**: Well-specified from deep research + workshop with verified palettes
- **F=0**: Standard — no performance, security, or compliance concerns
- **T=1**: Theme shape validation tests + SDK integration test

## Acceptance Criteria

1. **AC-01: Theme catalog exists** — A file exports 25 terminal theme entries, each containing a unique ID, display name, category (dark/light), and a complete xterm.js `ITheme` object with all 16 ANSI colors plus background, foreground, cursor, cursorAccent, and selectionBackground.

2. **AC-02: SDK setting registered** — A `terminal.colorTheme` setting appears in the Settings page under "Appearance" as a `<select>` dropdown listing all 25 themes plus an "Auto" option, with "Auto" as the default.

3. **AC-03: Theme applies on selection** — When the user selects a theme from the dropdown, the terminal re-renders with the new color palette within the same page session (no refresh needed). Both the terminal page and the overlay panel update.

4. **AC-04: Auto mode works** — When `terminal.colorTheme` is set to `auto`, the terminal uses VS Code Dark when the app is in dark mode and VS Code Light when in light mode. Toggling the app's dark/light mode switches the terminal theme accordingly.

5. **AC-05: Theme persists** — After selecting a theme (e.g., Dracula), closing and reopening the browser shows the same theme without re-selecting.

6. **AC-06: All themes render correctly** — Each of the 25 themes displays distinct, readable terminal output with proper contrast between foreground text and background. ANSI colors are visually distinguishable.

7. **AC-07: Theme categories labeled** — In the settings dropdown, each theme option indicates whether it's a dark or light theme (via emoji prefix or grouping).

8. **AC-08: Tests pass** — Unit tests validate that all 25 theme objects have the required ITheme fields and that the theme resolution function returns correct themes for all IDs including the `auto` fallback.

9. **AC-09: Existing behavior preserved** — The existing `worktreeIdentity.terminalTheme` (dark/light/system) continues to work as the dark/light mode override. The new color theme setting is independent — it determines WHICH palette, while the existing setting determines WHEN to apply dark vs light variants.

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Theme palette inaccuracy | Low | Low | Palettes from canonical sources; visual review via HTML demo; easy to patch individual colors |
| xterm v6 theme update quirk | Low | Medium | Known gotcha (PL-01): must assign new object reference, not mutate. Each theme is a frozen const. |
| SDK setting coexistence with worktreeIdentity | Medium | Medium | Keep both: SDK setting = which color theme, worktreeIdentity = dark/light mode. `auto` bridges them. |
| CanvasAddon compatibility | Very Low | Low | Research confirmed (IA-09): CanvasAddon has no special theme handling, uses standard `options.theme` |

## Open Questions

None — all key questions were resolved in the workshop:
- Q1 (which themes): 25 themes selected ✅
- Q2 (data model): `TerminalThemeEntry` with id, name, category, family?, theme ✅
- Q3 (dark/light interaction): `auto` mode + independent SDK setting ✅
- Q4 (categorization): Dark/light badges in select options ✅
- Q5 (metadata): id, name, category, optional family ✅

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Terminal Theme Catalog | Data Model | **COMPLETED** — [Workshop 001](workshops/001-terminal-theme-catalog.md) | Theme selection, palettes, data model, integration design |

All workshop opportunities have been addressed. Proceed directly to architecture.
