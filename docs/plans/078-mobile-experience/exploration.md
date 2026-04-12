# Plan 078 — Mobile Experience: Exploration Report

**Branch**: `078-mobile-experience`
**Date**: 2026-04-12
**Status**: Research complete — ready for specification

---

## Executive Summary

The Chainglass workspace UI is **desktop-only on workspace pages**. While a responsive infrastructure exists (three-tier breakpoints, `useResponsive` hook, `BottomTabBar` for global nav), the workspace panel layout — `PanelShell` composing `ExplorerPanel` + `LeftPanel` + `MainPanel` — has **zero mobile adaptation**. On phone viewports, users see a squished three-panel desktop layout where the terminal consumes most of the screen and file tree/viewer panels are unusable.

The user's vision: **swipeable full-screen views** — Terminal → Content Viewer → File Browser — with a pop-out sidebar menu. Swipe gestures must coexist with xterm.js touch/scroll/copy-paste. iPads continue using the desktop layout.

---

## Research Findings

### What Already Exists

| Component | Status | Notes |
|-----------|--------|-------|
| `useResponsive()` hook | ✅ Ready | Three-tier: phone `<768px` / tablet / desktop. `useMobilePatterns` flag |
| `BottomTabBar` | ✅ Ready | Phone-only bottom nav for global navigation (Home/Workflow/Kanban) |
| `NavigationWrapper` | ✅ Ready | Switches between sidebar and BottomTabBar based on viewport |
| Sidebar mobile fallback | ✅ Ready | `SidebarProvider` uses Radix `Sheet` on mobile (via `useIsMobile`) |
| Container query utils | ✅ Ready | `cq-container`, `cq-hide-*`, progressive enhancement |
| `FakeMatchMedia` test fake | ✅ Ready | For testing responsive hooks at any viewport |
| Harness mobile viewport | ✅ Ready | `just harness test --viewport mobile`, screenshot-all viewports |
| `visualViewport` handling | ⚠️ Partial | Terminal uses it for keyboard offset, but not for layout |
| Touch detection | ⚠️ Partial | Terminal detects `ontouchstart`/`maxTouchPoints` for keyboard chrome only |

### What's Missing (The Gap)

| Gap | Impact | Where |
|-----|--------|-------|
| **No mobile layout for PanelShell workspace pages** | Critical | `PanelShell` (browser, terminal) renders fixed 3-panel desktop layout at all sizes. Other workspace pages (workflows, agents, work-units) use their own layouts. Terminal `layout.tsx` has some mobile CSS (`fixed inset-0 bottom-[65px]`). |
| **No swipe/gesture system** | Critical | No touch gesture handling for panel switching |
| **No panel stacking** | Critical | Left/Main panels never collapse to single-column |
| **No mobile terminal UX** | Major | Terminal fills its panel box; no full-screen mobile mode |
| **No view switching UI** | Major | No tab bar or swipe indicators for workspace content views |
| **Terminal copy modal too wide** | Minor | Hard-codes 800px width (capped at 95vw) |
| **Touch targets too small** | Minor | Sidebar buttons 28px (h-7), file viewer buttons use p-1 |
| **`!important` in CSS** | Minor | `globals.css` and viewer CSS use `!important`, complicating overrides |

### Architecture: Where Mobile Layout Belongs

Based on domain analysis (DB-01 through DB-08):

| Responsibility | Domain | Rationale |
|---------------|--------|-----------|
| Mobile panel switching (swipe, stacking) | `_platform/panel-layout` | Already owns `PanelShell`, layout constants, breakpoints |
| Terminal mobile adaptations (keyboard, gestures) | `terminal` | Owns terminal surfaces and interaction |
| File browser mobile view | `file-browser` | Owns the browser page composition |
| Mobile view mode URL param | `_platform/panel-layout` | URL-driven state fits existing `nuqs` pattern |
| Global mobile detection | Existing `useResponsive` | Already provides `useMobilePatterns` |

**Recommendation**: Extend `_platform/panel-layout` — no new domain needed.

---

## Implementation Landscape

### PanelShell (The Core Target)

```tsx
// Current: apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx
export interface PanelShellProps {
  explorer: ReactNode;
  left: ReactNode;
  main: ReactNode;
  autoSaveId?: string;
}
```

PanelShell is prop-slot composition with CSS `resize: horizontal` for the left pane. It renders a horizontal flex layout with a fixed-width (280px) left panel and flex-1 main panel. **No breakpoint logic, no collapse, no touch UX.**

### Consumers of PanelShell

| Consumer | Explorer | Left | Main |
|----------|----------|------|------|
| `BrowserClient` | ExplorerPanel (path bar, search, palette) | FileTree, ChangesView | FileViewerPanel |
| `TerminalPageClient` | TerminalPageHeader | Session list | TerminalView |

> **Note**: Other workspace pages (workflows, agents, work-units, settings) use their own layout components (`WorkflowEditorLayout`, `WorkunitEditorLayout`) — not `PanelShell`. Mobile treatment for those pages would be separate from the panel-layout approach.

### Terminal Stack

```
TerminalPageClient → PanelShell
  ├── LeftPanel → session list
  └── MainPanel → TerminalView (dynamic, SSR:false)
       └── TerminalInner → xterm.js + FitAddon + CanvasAddon + WebSocket
```

- Uses `visualViewport` for soft keyboard offset
- Detects touch devices for keyboard chrome toggle
- `FitAddon` resizes terminal to container — so fixing the container fixes the terminal
- Copy uses server-side `tmux show-buffer` (not OSC 52) — clipboard flow is already mobile-safe

### File Browser Stack

```
BrowserClient → PanelShell
  ├── ExplorerPanel → path bar + command palette
  ├── LeftPanel → FileTree | ChangesView (mode-switched)
  └── MainPanel → FileViewerPanel → FileViewer | MarkdownViewer | DiffViewer | BinaryViewers
```

### Key Dependencies

- **xterm.js**: `@xterm/xterm` + `@xterm/addon-canvas`, `@xterm/addon-clipboard`, `@xterm/addon-fit`, `@xterm/addon-web-links`
- **UI**: Radix primitives, `lucide-react`, `sonner`, `next-themes`, `react-resizable-panels` (installed but not used by PanelShell)
- **CSS**: Tailwind v4 (CSS-first, no config file), container queries in `globals.css`
- **State**: `nuqs` for URL-driven params, React context for workspace/SDK/terminal overlay

---

## Deep Research: Mobile Swipeable Views (Perplexity)

### Recommended Approach

1. **CSS Scroll-Snap + gesture disambiguation** (hybrid):
   - Use `scroll-snap-type: x mandatory` for the swipeable view container
   - Native momentum scrolling, good battery life, no library needed
   - Add pointer event listeners for intelligent gesture disambiguation with xterm

2. **Gesture conflict resolution for xterm.js**:
   - Swipe detection at the **container level**, not on `.xterm` itself
   - Differentiate horizontal (view switch) vs vertical (terminal scroll) early
   - Edge-based swipes (from screen edges) or dedicated swipe zone (top strip)
   - `touch-action: manipulation` on the swipe area to prevent double-tap zoom

3. **iPad detection**: Use CSS `@media (max-width: 768px)` — tablets keep desktop. The existing `useResponsive` hook already handles this perfectly.

4. **Performance**: Keep all three views mounted but use `contain: layout style paint` and `visibility: hidden` for off-screen views. xterm's `FitAddon` will refit when the view becomes visible.

5. **Menu pattern**: Bottom tab bar (already exists as `BottomTabBar`) or modal overlay for sidebar — don't use horizontal slide-out that conflicts with view swiping.

### xterm.js Mobile Gotchas

| Issue | Workaround |
|-------|------------|
| Virtual keyboard reshapes viewport | Use `visualViewport` API (already implemented) |
| Long-press text selection | `user-select: none` + explicit copy button (already have `tmux show-buffer`) |
| Scroll conflicts | `{ passive: false }` on touch listeners, disambiguate direction |
| Double-tap zoom | `touch-action: manipulation` on terminal container |
| IME composition (Android) | Use `compositionend` not `keypress` |

---

## Prior Learnings (From Plans 064, 075, 041)

| Learning | Source | Implication |
|----------|--------|-------------|
| No phone UX for terminal; keyboard required | 064-tmux spec | Don't invest in touch-first terminal UI; keep keyboard-focused |
| Terminal overlay must stay mounted in workspace layout | 064-tmux spec | Persistent provider placement keeps WS alive across navigation |
| Resize tolerates tiny panels; tmux "smallest client wins" | 064-tmux spec | Refit on resize; don't fight tmux sizing |
| Use `viewport-fit: cover` + `env(safe-area-inset-*)` | 064 PWA workshop | Critical for notch/safe-area handling on mobile |
| Clipboard: use `tmux show-buffer` + user-gesture button | 064 copy workshop | Primary copy path; OSC 52 via ClipboardAddon also loaded as fallback |
| Layout/page split matters for worktree-aware state | 041 review | Resolve searchParams in page, pass from layout |

---

## Existing Test & Quality Infrastructure

- **Unit tests**: `useResponsive` hook tested at 7 breakpoints; `BottomTabBar` tested for phone-only render, ARIA, touch targets
- **Harness**: Mobile viewport support via `just harness test --viewport mobile` and `just harness screenshot-all`
- **Mobile UX audit agent**: `harness/agents/mobile-ux-audit/` — ready to run for baseline capture
- **Test fakes**: `FakeMatchMedia`, `FakeResizeObserver` for testing responsive hooks
- **Gap**: Harness doesn't set `isMobile`/`hasTouch`/`deviceScaleFactor` — viewport-only testing misses some mobile behaviors

---

## Risks & Constraints

| Risk | Severity | Mitigation |
|------|----------|------------|
| Swipe gestures conflict with xterm touch events | High | Dedicated swipe zone or edge-based gestures; pointer event disambiguation |
| Multiple heavy views mounted (xterm + syntax highlighter + file tree) | Medium | CSS containment, lazy init, xterm already SSR-disabled |
| `!important` CSS overrides in globals.css | Low | Targeted overrides; consider refactoring in follow-up |
| tmux "smallest client wins" when terminal panel is tiny | Low | Mobile shows terminal full-screen, never tiny |
| Copy/paste workflow on mobile | Medium | `tmux show-buffer` already works; need visible copy button |

---

## Questions for Specification

1. **View order**: Terminal → Content → File Browser (as described), or should it be configurable?
2. **Swipe zone**: Top quarter of screen only, or edge-based swipes, or full-screen with xterm exception?
3. **Terminal keyboard**: When terminal is active and virtual keyboard is open, should swipe be disabled entirely?
4. **Session list on mobile**: The terminal's LeftPanel shows session list — should this become a dropdown/sheet on mobile, or is it hidden?
5. **Explorer bar on mobile**: The top ExplorerPanel (path bar, search, command palette) — should it be visible on all views or only on file browser?
6. **Workflow/Agent pages**: Are these in scope for V1, or just the workspace browser + terminal?
7. **URL state**: Should the active mobile view (terminal/content/browser) be persisted in URL?
8. **Orientation**: Should landscape mode on phone use a different layout?

---

## Suggested Next Steps

1. **Run the mobile UX audit agent** to capture baseline screenshots and evidence of current state
2. **Proceed to `/plan-1b-v2-specify`** to write the feature specification, incorporating this research
3. Consider a **workshop** on gesture disambiguation with xterm.js — this is the highest-risk technical challenge
