# Mobile Experience Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-04-12
**Spec**: [mobile-experience-spec.md](mobile-experience-spec.md)
**Status**: DRAFT
**Mode**: Full
**Complexity**: CS-3 (medium)

## Summary

The Chainglass workspace UI is desktop-only on workspace pages. `PanelShell` renders a fixed three-panel layout (explorer + left + main) at all viewport widths. This plan transforms workspace pages into full-screen swipeable views on phone viewports (`<768px`) while preserving the desktop layout unchanged for tablets and desktops. The approach: modify `PanelShell` to branch on `useResponsive().useMobilePatterns`, add new mobile layout components to `_platform/panel-layout`, optimize the terminal for touch/keyboard, and increase file browser touch targets. No new domains, no external dependencies, no gesture libraries.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `_platform/panel-layout` | existing | **modify** | Add `MobilePanelShell`, `MobileSwipeStrip`, `MobileView`; modify `PanelShell` to branch |
| `terminal` | existing | **modify** | Mobile font size, touch-action CSS, responsive copy modal, modifier toolbar, focus management |
| `file-browser` | existing | **modify** | Touch-friendly file rows (48px), file-tap→content view switch |
| `_platform/viewer` | existing | **consume** | FileViewer/MarkdownViewer render in content view (no changes) |
| `_platform/sdk` | existing | **consume** | Existing keybinding system (no changes) |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx` | `_platform/panel-layout` | contract | Add `useResponsive` branch to render `MobilePanelShell` on phone |
| `apps/web/src/features/_platform/panel-layout/components/mobile-panel-shell.tsx` | `_platform/panel-layout` | contract | New: swipeable full-screen view container |
| `apps/web/src/features/_platform/panel-layout/components/mobile-swipe-strip.tsx` | `_platform/panel-layout` | contract | New: segmented control with swipe + tap navigation (exported for consumer customization) |
| `apps/web/src/features/_platform/panel-layout/components/mobile-view.tsx` | `_platform/panel-layout` | internal | New: wrapper for each view — internal to MobilePanelShell (not exported) |
| `apps/web/src/features/_platform/panel-layout/components/mobile-explorer-sheet.tsx` | `_platform/panel-layout` | internal | New: search icon → bottom sheet with ExplorerPanel |
| `apps/web/src/features/_platform/panel-layout/index.ts` | `_platform/panel-layout` | contract | Update barrel export with new mobile components |
| `apps/web/src/features/064-terminal/components/terminal-inner.tsx` | `terminal` | internal | Mobile font size, responsive copy modal, touch-action CSS |
| `apps/web/src/features/064-terminal/components/terminal-modifier-toolbar.tsx` | `terminal` | internal | New: Esc/Tab/Ctrl/Alt/arrows toolbar, auto-show on keyboard open |
| `apps/web/src/features/064-terminal/hooks/use-keyboard-open.ts` | `terminal` | internal | New: reusable hook wrapping visualViewport keyboard detection |
| `apps/web/src/features/064-terminal/components/terminal-page-client.tsx` | `terminal` | internal | Simplify mobile layout: single full-screen terminal view |
| `apps/web/app/(dashboard)/workspaces/[slug]/terminal/layout.tsx` | `terminal` | cross-domain | Remove conflicting mobile CSS (MobilePanelShell owns sizing now) |
| `apps/web/src/features/041-file-browser/components/file-tree.tsx` | `file-browser` | internal | Increase row height to 48px on mobile for touch targets |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | `file-browser` | internal | Pass mobile view-switch callback for file-tap→content navigation |
| `test/unit/web/features/_platform/panel-layout/mobile-panel-shell.test.tsx` | `_platform/panel-layout` | internal | TDD tests for mobile shell |
| `test/unit/web/features/_platform/panel-layout/mobile-swipe-strip.test.tsx` | `_platform/panel-layout` | internal | TDD tests for swipe strip |
| `test/unit/web/features/064-terminal/terminal-modifier-toolbar.test.tsx` | `terminal` | internal | TDD tests for modifier toolbar |
| `test/unit/web/features/064-terminal/use-keyboard-open.test.tsx` | `terminal` | internal | Tests for keyboard detection hook |
| `apps/web/src/features/041-file-browser/components/content-empty-state.tsx` | `file-browser` | internal | New: empty state shown when no file selected on mobile |
| `docs/how/mobile-workspace-ux.md` | — | documentation | Mobile workspace guide |
| `docs/how/responsive-patterns.md` | — | documentation | Update to reference mobile workspace patterns |
| `docs/domains/_platform/panel-layout/domain.md` | `_platform/panel-layout` | documentation | Add MobilePanelShell to contracts table |
| `docs/domains/terminal/domain.md` | `terminal` | documentation | Add TerminalModifierToolbar, useKeyboardOpen |

## Consumed Domain Contracts

| Domain | Contract(s) Used |
|--------|-----------------|
| `_platform/viewer` | `FileViewer`, `MarkdownViewer`, `DiffViewer`, `ViewerFile` — rendered inside mobile Content view |
| `_platform/sdk` | `registerCommand`, `registerKeybinding` — existing commands continue to work; no new registrations |

## Deviation Ledger

The constitution mandates TDD (RED-GREEN-REFACTOR) for all implementation. This plan uses a **Hybrid** testing approach per spec clarification Q2 — TDD for component logic, lightweight verification for CSS/config-only changes.

| Deviation | Scope | Rationale | Follow-up |
|-----------|-------|-----------|-----------|
| CSS/config tasks use test-after instead of test-first | Tasks 2.2, 2.3, 2.4, 2.8, 3.1 | These are 1-line CSS property or value changes with no branching logic. Writing a test-first for `touch-action: manipulation` or changing `fontSize: 14` to `fontSize: 12` adds test overhead without reducing risk. Visual verification + harness screenshot diff is more effective. | Each task includes a harness verification step. If any CSS change causes a regression, add a targeted test. |
| No `.interface.ts` files for new component props | MobilePanelShell, MobileSwipeStrip, TerminalModifierToolbar | These are internal React components with TypeScript interfaces co-located in the component file (standard React/Next.js pattern). The project's Interface-First rule targets service/adapter boundaries, not presentational React components. | If any component's props interface is consumed by 3+ files, extract to a shared types file. |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Terminal `layout.tsx` has existing mobile CSS (`fixed inset-0 bottom-[65px]`) that will conflict with `MobilePanelShell`'s own sizing. Two owners for mobile positioning. | Phase 1: Remove mobile CSS from `terminal/layout.tsx`; `MobilePanelShell` becomes the single owner of mobile sizing. |
| 02 | High | CSS `contain: layout style paint` on off-screen views creates new stacking contexts, which can break popovers, dropdowns, and modals that use `position: absolute/fixed`. Known overlay-prone components: `worktree-identity-popover`, `paste-upload-modal`. | Phase 1: Use `visibility: hidden` + `pointer-events: none` without `contain` initially. Add `contain` as a perf optimization in Phase 4 after testing overlays. |
| 03 | High | `BrowserClient` is ~900 lines of shared behavior (URL sync, tree expansion, command registration). Adding mobile branching inside it risks regressing desktop. | Phase 3: Keep mobile concerns in `MobilePanelShell` wrapper layer. `BrowserClient` passes a view-switch callback but doesn't branch internally. |
| 04 | High | Terminal overlay anchor (`[data-terminal-overlay-anchor]`) is on PanelShell's main div. MobilePanelShell changes DOM structure — overlay may mis-position. | Phase 1: Preserve `data-terminal-overlay-anchor` on the terminal's MobileView wrapper. |
| 05 | High | File tree rows use `px-2 py-1` with no `min-h-*` — well below 48px touch targets. | Phase 3: Add conditional `min-h-12` class on phone viewport. |
| 06 | High | `useResponsive` is only used by 2 components currently. Adding it to `PanelShell` is safe — no import cycles. | Phase 1: Safe to import directly. |
| 07 | High | BottomTabBar is injected by `(dashboard)/layout.tsx`, not workspace layout. Workspace pages inherit it. The 50-65px bottom offset needs to be accounted for in MobilePanelShell height calculation. | Phase 1: Use `calc(100% - var(--bottom-nav-h))` or measure dynamically. |

## Harness Strategy

- **Current Maturity**: L3 — Boot + Browser Interaction + Structured Evidence + CLI SDK
- **Target Maturity**: L3 (no changes needed)
- **Boot Command**: `just harness dev` → `just harness doctor --wait`
- **Health Check**: `just harness health`
- **Interaction Model**: Browser automation (CDP/Playwright) + CLI (`just harness screenshot`, `just harness test --viewport mobile`)
- **Evidence Capture**: Screenshots at mobile viewport, mobile-ux-audit agent reports
- **Pre-Phase Validation**: Run `just harness screenshot-all` before and after each phase to capture visual diff

## Harness Coverage

Per ADR-0014, each phase must be harness-verifiable. Mobile UI changes are verified via viewport-scoped screenshots and the mobile-ux-audit agent.

| AC | Phase | Harness Verification | Command/Method |
|----|-------|---------------------|----------------|
| AC-01 | 1 | Screenshot at 375px shows MobilePanelShell (segmented control visible) | `just harness screenshot mobile-shell --viewport mobile` |
| AC-02 | 1 | Screenshot at 1024px shows desktop layout (no segmented control) | `just harness screenshot desktop-check --viewport desktop` |
| AC-03 | 1 | Browser page at 375px shows Files/Content tabs | Screenshot of `/workspaces/<slug>/browser` at mobile viewport |
| AC-04 | 1 | Terminal page at 375px shows full-screen terminal | Screenshot of `/workspaces/<slug>/terminal` at mobile viewport |
| AC-05 | 1 | Segmented control pill indicator visible | Visual in mobile screenshots |
| AC-14 | 2 | Terminal font visibly smaller at 375px vs 1024px | Compare mobile vs desktop terminal screenshots |
| AC-18 | 2 | Copy modal fits within mobile viewport | Screenshot of copy modal at 375px |
| AC-09 | 3 | File rows visibly taller at 375px | Screenshot of file tree at mobile viewport |
| AC-23 | 3 | Explorer sheet opens from search icon | Harness interaction test or manual verification |
| AC-26 | 4 | Full mobile-ux-audit agent run | `just agent-run mobile-ux-audit` — report has zero `critical` findings |

### Per-Phase Harness Tasks

Each phase includes a harness verification step as its final task:

## Phases

### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Mobile Panel Shell | `_platform/panel-layout` | Create `MobilePanelShell` with segmented control, swipeable views, and `PanelShell` branching | None |
| 2 | Terminal Mobile UX | `terminal` | Optimize terminal for phone: font size, touch-action, responsive copy modal, modifier toolbar, keyboard hook | Phase 1 |
| 3 | Browser Mobile UX | `file-browser` | Touch-friendly file tree, file-tap→content view switch, explorer bar sheet | Phase 1 |
| 4 | Polish & Verification | all | Documentation, harness verification, edge case fixes | Phases 2, 3 |

---

### Phase 1: Mobile Panel Shell

**Objective**: Create the mobile layout infrastructure — `MobilePanelShell` with segmented control and swipeable views — and wire it into `PanelShell` via `useResponsive`.
**Domain**: `_platform/panel-layout`
**Delivers**:
- `MobilePanelShell` component with transform-based view switching
- `MobileSwipeStrip` segmented control with sliding pill indicator, pointer event swipe, Lucide icons
- `MobileView` wrapper with visibility hiding for off-screen views
- Modified `PanelShell` that branches on `useMobilePatterns`
- Resolved conflict: terminal `layout.tsx` mobile CSS removed
- Preserved `data-terminal-overlay-anchor` on mobile
**Depends on**: None
**Key risks**: Finding 01 (terminal layout conflict), Finding 04 (overlay anchor)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Create `MobileView` wrapper component | `_platform/panel-layout` | Component renders children full-width, sets `visibility: hidden` + `pointer-events: none` when not active | TDD — test active/inactive states |
| 1.2 | Create `MobileSwipeStrip` segmented control | `_platform/panel-layout` | Renders tab labels with Lucide icons; sliding pill indicator animates on view change; pointer-event swipe detection with 50px/0.3 velocity threshold | TDD — test tap switching, swipe left/right, pill position |
| 1.3 | Create `MobilePanelShell` container | `_platform/panel-layout` | Composes `MobileSwipeStrip` + `MobileView` children; CSS `transform: translateX` with 350ms transition; accepts `views` array of `{ label, icon, content }` | TDD — test view count, transform position, active view state |
| 1.4 | Modify `PanelShell` to branch on mobile | `_platform/panel-layout` | When `useMobilePatterns` is true, renders `MobilePanelShell`; desktop layout unchanged; `data-terminal-overlay-anchor` preserved on mobile main view | Test: PanelShell at 375px → MobilePanelShell; at 1024px → desktop |
| 1.5 | Remove conflicting mobile CSS from `terminal/layout.tsx` | `terminal` | Remove `fixed inset-0 bottom-[65px] z-10` mobile styles; keep `md:relative md:bottom-0 md:z-auto md:h-full` desktop styles; MobilePanelShell owns mobile sizing | Per finding 01 |
| 1.6 | Update barrel export | `_platform/panel-layout` | Export `MobilePanelShell`, `MobileSwipeStrip` from `index.ts` (`MobileView` is internal — not exported, per domain manifest) | |
| 1.7 | Wire `BrowserClient` for mobile views | `file-browser` | `BrowserClient`'s `PanelShell` usage now auto-branches on mobile; browser page shows 2 views (Files + Content) with correct slot mapping: `left` → Files view, `main` → Content view | Visual verification at 375px viewport |
| 1.8 | Wire `TerminalPageClient` for mobile | `terminal` | Terminal page shows single full-screen terminal view on mobile; sessions list hidden (tmux manages sessions) | Visual verification at 375px viewport |
| 1.9 | Harness verification — Phase 1 | — | Run `just harness screenshot-all phase1-mobile` at mobile + desktop viewports; verify MobilePanelShell renders at 375px, desktop layout at 1024px; browser page shows 2 views; terminal page shows 1 view | Per ADR-0014 harness coverage |

### Acceptance Criteria

- [ ] AC-01: Phone viewport → MobilePanelShell renders
- [ ] AC-02: Tablet/desktop → desktop layout unchanged
- [ ] AC-03: Browser page mobile → 2 views (Files, Content)
- [ ] AC-04: Terminal page mobile → 1 full-screen terminal view
- [ ] AC-05: Segmented control with tap switching + pill indicator
- [ ] AC-06: Swipe on strip switches views with ≤350ms transition
- [ ] AC-07: Off-screen views remain mounted, hidden via visibility
- [ ] AC-08: Lucide icons match production app

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Terminal overlay breaks on mobile DOM | Medium | High | Preserve `data-terminal-overlay-anchor` in task 1.4 |
| Removing terminal layout.tsx CSS breaks desktop terminal | Low | High | Only remove the mobile-first class; keep `md:` prefixed desktop classes |

---

### Phase 2: Terminal Mobile UX

**Objective**: Optimize the terminal for phone use — smaller font, touch-safe CSS, responsive copy modal, modifier key toolbar with auto-show on keyboard open.
**Domain**: `terminal`
**Delivers**:
- 12px font size on phone (14px tablet/desktop unchanged)
- `touch-action: manipulation` on xterm container
- Responsive copy modal (no more 800px hard-code)
- `useKeyboardOpen` hook (reusable visualViewport wrapper)
- `TerminalModifierToolbar` — Esc/Tab/Ctrl/Alt/arrows, auto-docked above keyboard
- Terminal focus management on mobile view switch
**Depends on**: Phase 1 (MobilePanelShell provides the view-switch callback)
**Key risks**: Modifier toolbar positioning across iOS/Android keyboard variants

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Create `useKeyboardOpen` hook | `terminal` | Returns `{ isOpen: boolean, keyboardHeight: number }` using `visualViewport` API; 150px threshold; no-op on desktop | TDD — test with mock visualViewport |
| 2.2 | Mobile font size in `terminal-inner.tsx` | `terminal` | When phone viewport detected, `Terminal({ fontSize: 12 })`; tablet/desktop stays at 14 | Deviation: CSS-config change. Verified via harness screenshot at 375px viewport. |
| 2.3 | Add `touch-action: manipulation` to terminal container | `terminal` | `.xterm-screen` element gets `touch-action: manipulation` via CSS or style prop | Deviation: CSS-config change. Verified via harness screenshot + DOM inspection. |
| 2.4 | Responsive copy modal | `terminal` | Replace `width: '800px', height: '800px'` with `width: '100%', maxWidth: '95vw', maxHeight: '80vh'` | Deviation: CSS-config change. Verified via harness screenshot at 375px. |
| 2.5 | Create `TerminalModifierToolbar` component | `terminal` | Renders Esc/Tab/Ctrl(toggle)/Alt(toggle)/←/↑/↓/→ buttons; 36px height; sends key data via `onKey` callback; Ctrl auto-resets after one keypress | TDD — test key sends, Ctrl toggle, auto-reset |
| 2.6 | Wire toolbar to terminal with keyboard auto-show | `terminal` | Toolbar renders `position: fixed; bottom: <keyboardHeight>px` when `useKeyboardOpen().isOpen`; hidden when keyboard closed; sends keys via terminal's `send()` function | Integration test: keyboard open → toolbar visible |
| 2.7 | Terminal focus on view-switch | `terminal` | When MobilePanelShell switches to terminal view, call `terminalRef.current?.focus()` via an `onViewActive` callback | Deviation: integration wiring. Verified via harness interaction test. |
| 2.8 | Ensure hidden textarea has 16px font-size | `terminal` | Add CSS rule for `.xterm-helper-textarea { font-size: 16px !important; }` to prevent iOS auto-zoom on focus | Deviation: CSS-config change. Verified via harness screenshot on iOS viewport. |
| 2.9 | Harness verification — Phase 2 | — | Run `just harness screenshot-all phase2-terminal` at mobile viewport; verify terminal font is visibly smaller, copy modal fits viewport, modifier toolbar area reserved | Per ADR-0014 harness coverage |

### Acceptance Criteria

- [ ] AC-14: Terminal renders at 12px font on phone
- [ ] AC-15: Terminal container has `touch-action: manipulation`
- [ ] AC-16: Keyboard open → terminal refits
- [ ] AC-17: View-switch to terminal → terminal gets focus
- [ ] AC-18: Copy modal responsive sizing
- [ ] AC-19: Modifier toolbar auto-shows on keyboard open
- [ ] AC-20: Ctrl+C via toolbar sends `\x03`

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Toolbar position wrong on some Android keyboards | Medium | Medium | Use `visualViewport.height` not `window.innerHeight`; test on 2+ devices |
| 12px font too small for some users | Low | Low | V2: add font size +/- control |

---

### Phase 3: Browser Mobile UX

**Objective**: Make the file browser touch-friendly and wire file-tap→content view switching + explorer bar as bottom sheet.
**Domain**: `file-browser`, `_platform/panel-layout`
**Delivers**:
- 48px minimum row height for file tree items on phone
- File tap auto-switches to Content view
- Empty state in Content view when no file selected
- Explorer bar accessible via search icon → bottom Sheet
**Depends on**: Phase 1 (MobilePanelShell provides view-switch API)
**Key risks**: Finding 03 (BrowserClient complexity — keep mobile changes in wrapper layer)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Increase file tree row height on mobile | `file-browser` | When `useMobilePatterns`, file/folder rows have `min-h-12` (48px); touch targets meet accessibility minimum | Deviation: CSS-config change. Verified via harness screenshot at 375px. |
| 3.2 | Wire file-tap to view-switch callback | `file-browser` | When user taps a file on mobile, set `file` URL param AND call `onViewChange(contentViewIndex)` to switch to Content view | Wire via MobilePanelShell callback passed through BrowserClient |
| 3.3 | Create Content view empty state | `_platform/panel-layout` or `file-browser` | When no file is selected on mobile, Content view shows centered empty state with Lucide `FileText` icon + "Select a file" text + "Browse Files" button that switches to Files view | TDD — test render with/without file param |
| 3.4 | Create `MobileExplorerSheet` component | `_platform/panel-layout` | Search icon (Lucide `Search`) in swipe strip; tapping opens shadcn `Sheet` from bottom (60vh) containing `ExplorerPanel`; auto-closes on file select or command execute | TDD — test open/close, file select callback |
| 3.5 | Wire `MobileExplorerSheet` into `MobilePanelShell` | `_platform/panel-layout` | Search icon appears right-aligned in `MobileSwipeStrip`; sheet receives `ExplorerPanel` props from `PanelShell`'s `explorer` prop | Verify path bar, search, command palette work inside sheet |
| 3.6 | Harness verification — Phase 3 | — | Run `just harness screenshot-all phase3-browser` at mobile viewport; verify file rows are taller, content empty state renders, explorer sheet opens | Per ADR-0014 harness coverage |

### Acceptance Criteria

- [ ] AC-09: File rows ≥48px on mobile
- [ ] AC-10: File tap → content view auto-switch
- [ ] AC-11: Folder tap → expand/navigate (unchanged)
- [ ] AC-12: Content view shows selected file viewer
- [ ] AC-13: Empty state when no file selected
- [ ] AC-23: Explorer bar hidden by default, accessible via search icon → bottom sheet

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| BrowserClient regression from view-switch wiring | Low | High | Per finding 03 — don't add mobile branching inside BrowserClient; callback only |
| ExplorerPanel inside Sheet has focus/keyboard issues | Medium | Medium | Test command palette keyboard interaction inside Sheet |

---

### Phase 4: Polish & Verification

**Objective**: Documentation, harness-based verification, edge case fixes, and CSS containment optimization.
**Domain**: All
**Delivers**:
- `docs/how/mobile-workspace-ux.md` guide
- Updated `docs/how/responsive-patterns.md`
- Harness mobile-ux-audit agent run with zero `critical` findings
- CSS containment added to off-screen views (after overlay testing)
- Updated domain docs for `_platform/panel-layout` and `terminal`
**Depends on**: Phases 2, 3
**Key risks**: None — polish phase

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Write `docs/how/mobile-workspace-ux.md` | — | Guide covers: mobile panel system, view switching, terminal toolbar, extending for new workspace pages | Documentation deliverable from spec |
| 4.2 | Update `docs/how/responsive-patterns.md` | — | Add section referencing mobile workspace patterns and MobilePanelShell | |
| 4.3 | Run harness mobile-ux-audit agent | — | Agent produces report with zero `critical` severity findings; capture screenshots | AC-26 |
| 4.4 | Add CSS containment to off-screen views | `_platform/panel-layout` | Add `contain: layout style paint` to `MobileView` when inactive; verify popovers/modals/dropdowns still work | Per finding 02 — deferred to after overlay testing |
| 4.5 | Update `_platform/panel-layout` domain docs | `_platform/panel-layout` | Add MobilePanelShell, MobileSwipeStrip, MobileView to domain.md contracts and composition tables | Domain doc maintenance |
| 4.6 | Update `terminal` domain docs | `terminal` | Add TerminalModifierToolbar, useKeyboardOpen to domain.md | Domain doc maintenance |
| 4.7 | Verify BottomTabBar coexistence | — | BottomTabBar remains visible and functional at bottom on mobile workspace pages; no z-index or overlap issues | AC-21 |
| 4.8 | Verify sidebar sheet on mobile | — | Workspace sidebar opens as bottom sheet when triggered from menu | AC-22 |
| 4.9 | Verify desktop regression | — | Run `just fft` — all existing tests pass; manual check at 1024px+ viewport shows zero visual changes | AC-24 |

### Acceptance Criteria

- [ ] AC-21: BottomTabBar visible and functional
- [ ] AC-22: Sidebar renders as bottom sheet
- [ ] AC-24: All existing tests pass
- [ ] AC-25: New components have unit tests (completed in Phases 1-3)
- [ ] AC-26: Harness mobile-ux-audit agent — zero critical findings

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CSS containment breaks overlays | Medium | Medium | Test each overlay type before enabling; revert if issues found |
