# Mobile Experience

**Mode**: Full
**Complexity**: CS-3 (medium)

📚 This specification incorporates findings from `exploration.md` and authoritative design decisions from workshops `001-mobile-swipeable-panel-experience.md` and `002-xterm-mobile-touch-first.md`.

## Research Context

Exploration (2026-04-12) confirmed: workspace pages using `PanelShell` have zero mobile adaptation — the three-panel desktop layout (explorer + left + main) renders at all viewport widths. The responsive infrastructure exists (`useResponsive`, `BottomTabBar`, container queries, harness mobile viewport testing) but is not wired into workspace panel layout. Two workshops resolved the core design tensions: swipeable views use a top-strip gesture zone to avoid xterm.js conflicts, and the terminal uses CanvasAddon with 12px font on phone for ~54 columns.

Prototype validated on physical device at `http://192.168.1.134:9191` — order confirmed as Files → Content → Terminal (left to right), with segmented control tabs and Lucide icons matching the production app.

## Summary

On phone viewports (`<768px`), transform the workspace panel layout from a squished three-panel desktop view into **full-screen swipeable views** — each panel (file browser, content viewer, terminal) occupies 100% of the screen. Users switch views by tapping a segmented control or swiping on a top navigation strip. The terminal runs xterm.js with mobile-optimized font size and a modifier key toolbar (Esc/Tab/Ctrl/Alt/arrows) above the virtual keyboard. iPads and tablets continue using the existing desktop layout unchanged.

## Goals

- **Usable workspace on phone**: A user on an iPhone/Android phone can browse files, read code, and use the terminal without pinching, scrolling sideways, or fighting the layout
- **Full-screen views**: Each workspace panel (files, content, terminal) takes 100% width and height on phone, eliminating the squished split-pane experience
- **View switching without conflicts**: Swiping or tapping to switch views never interferes with terminal scrolling, text selection, copy/paste, or TUI interaction (Copilot CLI, vim, htop)
- **Terminal that works**: Users can type commands, navigate TUI menus, scroll output, and copy text on a phone with a virtual keyboard
- **Zero iPad changes**: Tablets (≥768px) continue using the desktop layout — `useResponsive.useMobilePatterns` is false for tablets
- **Harness-verifiable**: The mobile experience can be tested via the existing harness mobile viewport tooling and the mobile-ux-audit agent

## Non-Goals

- **No tablet-specific layout**: iPads use desktop. No intermediate tablet layout.
- **No mobile layout for non-PanelShell pages**: Workflow editor, work unit editor, agents page, and settings use their own layout components — they are out of scope for V1.
- **No PWA / standalone mode**: No app install prompts, splash screens, or offline support.
- **No gesture library**: No hammer.js, @use-gesture, or framer-motion. Use pointer events and CSS transforms.
- **No mobile code editing**: CodeMirror editor is desktop-only. Mobile shows read-only file viewer.
- **No landscape-specific layout**: Landscape mode works (FitAddon refits terminal), but no special layout optimizations.
- **No new URL params for mobile view state**: The active view (files/content/terminal) is component state, not URL state — simplifies V1.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `_platform/panel-layout` | existing | **modify** | Add `MobilePanelShell`, `MobileSwipeStrip`, `MobileView` components; modify `PanelShell` to branch on `useMobilePatterns` |
| `terminal` | existing | **modify** | Mobile font size (12px on phone), responsive copy modal, `touch-action` CSS, modifier key toolbar, focus management on view switch |
| `file-browser` | existing | **modify** | Touch-friendly file list (48px rows), file-tap navigates to content view, mobile-aware `BrowserClient` composition |
| `_platform/viewer` | existing | **consume** | FileViewer/MarkdownViewer render in content view (no viewer changes needed) |
| `_platform/sdk` | existing | **consume** | Existing keybinding system (no changes) |

No new domains required. Mobile layout is an extension of `_platform/panel-layout`'s existing responsibility ("Layout constants — widths, breakpoints, z-indexes for panel composition").

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=0, D=0, N=1, F=1, T=1
  - **Surface Area (S=2)**: Multiple files across 3 domains — panel-layout components, terminal-inner, browser-client, file-tree, terminal-page-client
  - **Integration (I=0)**: All internal; no new external dependencies
  - **Data/State (D=0)**: No schema changes, no migrations, no new URL params
  - **Novelty (N=1)**: Core pattern is well-specified by workshops, but touch gesture disambiguation has some discovery risk
  - **Non-Functional (F=1)**: Performance matters (3 mounted views, xterm on mobile GPU), touch targets must meet 48px accessibility minimum
  - **Testing/Rollout (T=1)**: Unit tests for responsive branching + harness mobile viewport integration tests; no feature flags needed
- **Total P**: 5 → **CS-3 (medium)**
- **Confidence**: 0.85
- **Assumptions**:
  - xterm.js CanvasAddon performs acceptably on modern phones (iPhone 12+, Pixel 6+)
  - The existing `visualViewport` keyboard handling in terminal-inner.tsx works correctly when the terminal is in a mobile view
  - The user's primary use case is iOS Safari (iPhone); Android Chrome is secondary
- **Dependencies**: None external. All infrastructure (`useResponsive`, `BottomTabBar`, `FakeMatchMedia`) already exists.
- **Risks**:
  - xterm.js touch scrolling on iOS has known bugs — CanvasAddon mitigates but may not eliminate
  - Android IME (predictive keyboard) can cause unexpected text in terminal — acceptable for V1
  - Multiple mounted views with xterm.js WebSocket may increase memory on low-end phones
- **Phases**: 3-4 phases — mobile panel shell, terminal mobile UX, browser mobile UX, polish/testing

## Acceptance Criteria

### Mobile Panel Layout

1. **AC-01**: On a phone viewport (`<768px`), `PanelShell` renders `MobilePanelShell` instead of the desktop three-panel layout
2. **AC-02**: On tablet viewport (768-1023px) and desktop (≥1024px), `PanelShell` renders the existing desktop layout — zero behavior change
3. **AC-03**: On the browser page, the mobile shell shows two swipeable full-screen views: **Files** and **Content**
4. **AC-04**: On the terminal page, the mobile shell shows a single full-screen **Terminal** view (no session list panel — tmux sessions managed via tmux status bar/keybindings)
5. **AC-05**: A segmented control at the top of the screen allows tapping to switch views, with a sliding pill indicator showing the active view
6. **AC-06**: Swiping left/right on the segmented control strip switches views with a smooth CSS transition (≤350ms)
7. **AC-07**: Off-screen views remain mounted (preserving terminal WebSocket, scroll positions, expanded tree nodes) but are hidden via `visibility: hidden` and `pointer-events: none`
8. **AC-08**: Lucide icons in the segmented control match the icons used in the production app (`FolderOpen`, `FileText`, `TerminalSquare`)

### File Browser Mobile

9. **AC-09**: On the Files view, file/folder rows have a minimum height of 48px for touch targets
10. **AC-10**: Tapping a file in the Files view sets the `file` URL param and auto-switches to the Content view
11. **AC-11**: Tapping a folder in the Files view expands/navigates into it (existing file-tree behavior)
12. **AC-12**: The Content view shows the file viewer (code, markdown, diff, binary) for the currently selected file
13. **AC-13**: When no file is selected, the Content view shows an empty state with a button to switch to Files view

### Terminal Mobile

14. **AC-14**: On the Terminal view, xterm.js renders with 12px font size (instead of 14px desktop)
15. **AC-15**: The terminal container has `touch-action: manipulation` preventing double-tap zoom
16. **AC-16**: When the virtual keyboard opens, the terminal refits to the reduced viewport height via the existing `visualViewport` handler + `FitAddon.fit()`
17. **AC-17**: When the terminal view becomes active (swiped to), the terminal receives focus so the virtual keyboard can be opened by tapping
18. **AC-18**: The copy modal uses responsive sizing (`width: 100%; max-width: 95vw`) instead of the hard-coded 800px
19. **AC-19**: A modifier key toolbar appears when the virtual keyboard is open on the terminal page, providing: Esc, Tab, Ctrl (toggle), Alt (toggle), ←, ↑, ↓, → keys. Smart show/hide — auto-appears when keyboard opens, auto-hides when keyboard closes. Exact interaction (auto vs toggle) to be refined during implementation.
20. **AC-20**: Pressing Ctrl then a letter key on the virtual keyboard sends the appropriate ASCII control character (e.g., Ctrl+C → `\x03`). Ctrl state toggles on tap and auto-resets after one keypress.

### Navigation

21. **AC-21**: The existing `BottomTabBar` remains visible at the bottom on phone viewports, providing global navigation (Home, Workflows, etc.)
22. **AC-22**: The workspace sidebar (when opened via the menu button) renders as a bottom sheet (existing Radix Sheet behavior)
23. **AC-23**: The ExplorerPanel (path bar, search, command palette) is hidden by default on mobile but accessible via a toggle button in the segmented control or a floating action — opens as an overlay without permanently consuming vertical space

### Quality

24. **AC-24**: All existing `useResponsive` and `BottomTabBar` tests continue to pass
25. **AC-25**: New components (`MobilePanelShell`, `MobileSwipeStrip`, modifier toolbar) have unit tests
26. **AC-26**: The harness `mobile-ux-audit` agent can run against the mobile layout and produce a report with no `critical` severity findings

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| xterm.js touch scrolling fails on iOS text areas | Medium | High | CanvasAddon avoids this DOM bug; verified in workshop research |
| Android predictive keyboard injects unexpected text | Medium | Low | Acceptable for V1; power users disable autocorrect |
| Three mounted views cause memory pressure on low-end phones | Low | Medium | CSS `contain: layout style paint` + `visibility: hidden`; xterm virtual rendering limits DOM nodes |
| Modifier toolbar overlaps with keyboard on some Android devices | Medium | Medium | Use `visualViewport` to position; test on multiple devices |
| `BrowserClient` composition is complex to re-slot for mobile | Low | Medium | Workshop 001 designed Option B (infer from existing props) — minimal API change |

**Assumptions**:
- Users accessing Chainglass on phone are power users checking status or running quick commands — not doing extended development sessions
- iOS Safari and Chrome Android are the only mobile browsers that need to work (no Firefox mobile, no Samsung Internet)
- The existing `BottomTabBar` items (Home, Workflows, Kanban) remain appropriate for mobile workspace navigation — no new items needed

## Open Questions

*All resolved — see Clarifications below.*

## Testing Strategy

- **Approach**: Hybrid — TDD for component logic, lightweight for CSS/config
- **TDD targets**: `MobilePanelShell`, `MobileSwipeStrip`, `MobileView`, modifier key toolbar, view-switch callbacks
- **Lightweight targets**: Font size branching, `touch-action` CSS, copy modal responsive sizing, CSS containment
- **Mock policy**: Avoid mocks — use `FakeMatchMedia`, `FakeResizeObserver`, real DOM. No xterm.js mocking.
- **Harness**: Use existing mobile-ux-audit agent + `just harness test --viewport mobile` for integration verification. Current harness (L3) is sufficient — no enhancements needed.
- **Excluded**: No e2e Playwright tests in V1. Harness agent serves as the integration gate.

## Documentation Strategy

- **Location**: `docs/how/` only
- **Deliverable**: `docs/how/mobile-workspace-ux.md` — guide covering the mobile panel system, view switching, terminal toolbar, and how to extend for new workspace pages
- **Updates**: Update `docs/how/responsive-patterns.md` to reference the new mobile workspace patterns

## Clarifications

### Session 2026-04-12

**Q1 — Workflow Mode**: Full. Multi-phase plan with required dossiers and all gates.

**Q2 — Testing Strategy**: Hybrid. TDD for MobilePanelShell/SwipeStrip/toolbar, lightweight for CSS/config changes.

**Q3 — Mock Usage**: Avoid mocks. Use existing FakeMatchMedia, FakeResizeObserver, real DOM.

**Q4 — Documentation**: docs/how/ only. Add `mobile-workspace-ux.md`.

**Q5 — Terminal session list**: The terminal page no longer has a session list panel on desktop. Terminal page mobile = single full-screen terminal view. tmux sessions are managed via tmux itself (status bar, keybindings), not a separate UI panel.

**Q6 — Explorer bar on mobile**: Hidden by default to save vertical space. Accessible via a toggle/button (e.g., search icon in the segmented control or a floating action button). When opened, it overlays or pushes down the content temporarily. Exact interaction to be workshopped in implementation.

**Q7 — Harness readiness**: Current harness (L3) is sufficient. No enhancements to viewport emulation needed for V1.

**Q8 — Modifier toolbar scope & UX**: Terminal page only. Needs a smart show/hide mechanism since it takes vertical space from the terminal. Workshop topic for implementation: auto-show when keyboard opens, auto-hide when keyboard closes, or user-toggleable via a small button. Ctrl key included alongside Esc/Tab/Alt/arrows.

## Workshop Opportunities

Both core workshops completed. One additional workshop identified during clarification:

| Topic | Type | Status | Document |
|-------|------|--------|----------|
| Mobile Swipeable Panel Experience | Integration Pattern | ✅ Complete | [Workshop 001](workshops/001-mobile-swipeable-panel-experience.md) |
| xterm.js in Mobile/Touch-First World | Integration Pattern | ✅ Complete | [Workshop 002](workshops/002-xterm-mobile-touch-first.md) |
| Modifier Toolbar Show/Hide UX | UX Pattern | 📋 Needed during implementation | How does the toolbar appear/disappear without wasting space? Auto-show on keyboard open vs user toggle vs hybrid. |
| Explorer Bar Mobile Overlay | UX Pattern | 📋 Needed during implementation | How does the path bar/command palette appear on mobile? Floating button? Swipe-down? Sheet? |
