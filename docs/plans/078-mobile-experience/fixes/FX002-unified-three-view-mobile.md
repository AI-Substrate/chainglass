# Fix FX002: Unified Three-View Mobile Page

**Created**: 2026-07-20
**Status**: Proposed
**Plan**: [mobile-experience-plan.md](../mobile-experience-plan.md)
**Source**: [Workshop 004 — Unified Three-View Mobile Page](../workshops/004-unified-three-view-mobile-page.md)
**Domain(s)**: `_platform/panel-layout` (modify), `file-browser` (modify), `terminal` (modify)

---

## Problem

The validated mobile prototype shows Files, Content, and Terminal as 3 swipeable views on a single browser page. The current implementation splits them across two routes:

- **Browser page** (`/workspaces/[slug]/browser`) — 2 mobile views: Files + Content
- **Terminal page** (`/workspaces/[slug]/terminal`) — 1 mobile view: Terminal

This forces mobile users to use the BottomTabBar to navigate to a separate terminal page, breaking the single-page prototype experience. Workshop 004 resolved five design questions to unify them.

Additionally, MobilePanelShell eagerly mounts all views. Terminal (xterm.js + WebSocket) allocates GPU memory and opens a socket even if the user never swipes to it — wasteful on low-end phones.

## Proposed Fix

Eight coordinated changes based on Workshop 004 resolved decisions and validation findings:

1. **BrowserClient adds TerminalView as 3rd mobileView** — Files (0) → Content (1) → Terminal (2). Uses `useTerminalSessions` hook with `sanitizeSessionName(worktreeBranch ?? '')` for auto-session selection, `TerminalView` for rendering. Desktop layout unchanged.

2. **MobilePanelShell gets `lazy` flag and `initialActiveIndex` on views** — `MobilePanelShellView` gains `lazy?: boolean`. `MobilePanelShellProps` gains `initialActiveIndex?: number` (used as initial value for `useState` instead of hardcoded `0` — not controlled mode). Lazy views render `null` until first activation. Non-lazy views mount immediately. Once activated, a view stays mounted (preserving WebSocket/scroll). Only Terminal uses `lazy: true`.

3. **TerminalPageClient redirects on mobile** — Restructure into a thin `TerminalMobileGate` wrapper that checks `useMobilePatterns` FIRST and redirects immediately before any other hooks mount. The wrapper renders either the redirect skeleton or the full `TerminalPageClient` (which calls `useTerminalSessions` and other hooks). This avoids mounting desktop-only hooks (WebSocket, session fetch) during the brief redirect. Redirect URL includes `?mobileView=2` so the browser page opens at the Terminal tab. Desktop terminal page unchanged.

4. **Swipe strip shows 3 tabs** — `FolderOpen`, `FileText`, `TerminalSquare` icons. MobileSwipeStrip already supports N views — no changes needed to the strip itself.

5. **Terminal re-focus on view-switch** — TerminalView gets `isActive?: boolean` prop, passes it as `isVisible` to TerminalInner. MobilePanelShell's `onViewChange` callback lets BrowserClient track `activeIndex` state and pass `isActive={activeIndex === 2}` to TerminalView. Without this, swiping away from Terminal and back won't refocus xterm.js.

6. **BottomTabBar Terminal nav on mobile** — The "Terminal" nav item on mobile navigates to `/browser?...&mobileView=2` instead of `/terminal`, so users land directly on the Terminal tab without a redirect hop.

7. **Spec AC updates** — AC-03 changes from "2 views" to "3 views (Files + Content + Terminal)". AC-04 changes from "terminal page shows terminal" to "terminal page redirects to browser on mobile". AC-07 adds lazy mount caveat.

8. **Plan updates** — Update tasks 1.7 and 1.8 descriptions to reflect the 3-view browser page and terminal redirect. Update Finding 03 note: BrowserClient now renders terminal as 3rd mobile view — this is an acceptable exception since it's a slot in `mobileViews`, not branching logic. Update AC-03 and AC-04 in the plan's Phase 1 checklist.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `_platform/panel-layout` | modify | `MobilePanelShellView` gets `lazy?: boolean`; `MobilePanelShellProps` gets `initialActiveIndex?: number`; `MobilePanelShell` tracks `activatedViews` set and uses `initialActiveIndex` as initial `useState` value; `MobileView` renders children conditionally based on activation state |
| `file-browser` | modify | `BrowserClient` adds `useTerminalSessions` hook, `TerminalView` component, `sanitizeSessionName` import, and 3rd mobileView entry with `lazy: true` + `isTerminal: true`; reads `mobileView` URL param to pass `initialActiveIndex` to PanelShell/MobilePanelShell; tracks `activeIndex` via `onViewChange` and passes `isActive` to TerminalView |
| `terminal` | modify | `TerminalPageClient` split into `TerminalMobileGate` wrapper (checks viewport first, redirects with `?mobileView=2`) + existing `TerminalPageClient` (only mounts hooks on desktop); `TerminalView` gets `isActive?: boolean` prop forwarded to `TerminalInner` as `isVisible` |
| `navigation` | modify | `BottomTabBar` Terminal nav item on mobile points to `/browser?...&mobileView=2` instead of `/terminal` |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX002-1 | Add `lazy` flag, `initialActiveIndex`, and `onViewChange` pass-through to MobilePanelShell + PanelShell | `_platform/panel-layout` | `apps/web/src/features/_platform/panel-layout/components/mobile-panel-shell.tsx`, `apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx` | `MobilePanelShellView` has `lazy?: boolean`; `MobilePanelShellProps` has `initialActiveIndex?: number` and `onViewChange?: (index: number) => void`; `MobilePanelShell` initializes `useState(initialActiveIndex ?? 0)` for activeIndex; initializes `activatedViews` set with all non-lazy view indices plus `initialActiveIndex`; `handleViewChange` adds index to set on activation; view content renders `null` when not in `activatedViews` set. **PanelShell** gets new pass-through props: `initialMobileActiveIndex?: number` and `onMobileViewChange?: (index: number) => void`, forwarded to `<MobilePanelShell initialActiveIndex={...} onViewChange={...} />`. | Initialize `activatedViews` via `useState(() => { const s = new Set<number>(); views.forEach((v, i) => { if (!v.lazy) s.add(i); }); if (initialActiveIndex != null) s.add(Math.max(0, Math.min(initialActiveIndex, views.length - 1))); return s; })`. Clamp `initialActiveIndex` to `0..views.length-1` — invalid/NaN values must not push the container off-screen. |
| [ ] | FX002-2 | Add TerminalView as 3rd mobileView in BrowserClient | `file-browser` | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | BrowserClient imports `TerminalView` and `sanitizeSessionName` from `@/features/064-terminal` (barrel export), `useTerminalSessions` from `@/features/064-terminal/hooks/use-terminal-sessions`, `TerminalSquare` from lucide-react; calls `useTerminalSessions({ currentBranch: sanitizeSessionName(worktreeBranch ?? '') })`; reads `mobileView` from URL search params and clamps to `0..2` (invalid/NaN → 0); passes `initialMobileActiveIndex` and `onMobileViewChange` to PanelShell; tracks `activeIndex` via `onMobileViewChange` callback; adds 3rd mobileView: `{ label: 'Terminal', icon: <TerminalSquare />, content: terminalContent, isTerminal: true, lazy: true }`; `terminalContent` wraps `TerminalView` in `MainPanel` with loading/empty fallback and passes `isActive={activeIndex === 2}`; zero-session state shows "No terminal sessions" message | TerminalView props: `sessionName`, `cwd` (worktreePath), `themeOverride` (terminalTheme), `isActive` (for refocus). Import `sanitizeSessionName` from `@/features/064-terminal` (barrel export). |
| [ ] | FX002-3 | Add mobile redirect in TerminalPageClient | `terminal` | `apps/web/src/features/064-terminal/components/terminal-page-client.tsx`, `apps/web/app/(dashboard)/workspaces/[slug]/terminal/page.tsx` | Split into two components: (1) `TerminalMobileGate` — thin wrapper that calls `useResponsive()` and `useRouter()` ONLY, checks `useMobilePatterns` FIRST, and if true returns `<TerminalSkeleton />` + fires `router.replace(/workspaces/${slug}/browser?worktree=...&mobileView=2)` via useEffect. If false, renders `<TerminalPageClient ...props />`. (2) Existing `TerminalPageClient` unchanged — only mounts its hooks on desktop. Update `terminal/page.tsx` to import and render `TerminalMobileGate` instead of `TerminalPageClient`. | This avoids React's unconditional hook rule. The gate never calls useTerminalSessions. |
| [ ] | FX002-3b | Add `isActive` prop to TerminalView | `terminal` | `apps/web/src/features/064-terminal/components/terminal-view.tsx` | `TerminalViewProps` gains `isActive?: boolean`; TerminalView passes `isVisible={isActive}` to TerminalInner; when user swipes away from Terminal and back, xterm.js refocuses correctly | Without this, TerminalInner has no way to know the view became visible again after being off-screen in the swipeable container. |
| [ ] | FX002-4 | Update spec ACs | — | `docs/plans/078-mobile-experience/mobile-experience-spec.md` | AC-03 updated to "3 views (Files + Content + Terminal)"; AC-04 updated to "terminal page redirects to browser page on mobile"; AC-07 adds "lazy views mount on first activation, then stay mounted" | Spec reflects Workshop 004 resolved decisions |
| [ ] | FX002-4b | Update plan tasks and findings | — | `docs/plans/078-mobile-experience/mobile-experience-plan.md` | Task 1.7 updated: browser page shows 3 views (Files + Content + Terminal) on mobile; Task 1.8 updated: terminal page redirects to browser on mobile; Finding 03 note updated: BrowserClient renders terminal as 3rd mobile view — acceptable exception since it's a slot in `mobileViews`, not branching logic; AC-03 checklist updated to "3 views (Files, Content, Terminal)"; AC-04 checklist updated to "Terminal page mobile → redirects to browser" | Keeps plan in sync with FX002 architectural change |
| [ ] | FX002-4c | Update BottomTabBar Terminal nav for mobile | `navigation` | `apps/web/src/components/navigation/bottom-tab-bar.tsx`, `apps/web/src/lib/navigation-utils.ts` | On mobile, Terminal nav item navigates to `/browser?...&mobileView=2` instead of `/terminal`; desktop sidebar unchanged. **Active-state check**: current BottomTabBar uses `pathname === item.href` for active highlighting — this will break for Terminal since the href now has query params. Fix by normalizing to pathname comparison OR by checking `pathname.includes('/browser') && searchParams.get('mobileView') === '2'` for Terminal active state. | Avoids the redirect hop: user taps Terminal → lands on browser page at Terminal tab. |
| [ ] | FX002-5 | Add lazy mount tests | `_platform/panel-layout` | `test/unit/web/features/_platform/panel-layout/mobile-panel-shell.test.tsx` | Tests: (1) non-lazy views render content immediately; (2) lazy views render null before activation; (3) lazy views render content after `handleViewChange` activates them; (4) activated lazy views stay mounted on subsequent view switches; (5) `initialActiveIndex` sets starting view and activates it | Extend existing test file. Use `FakeMatchMedia` for viewport simulation. |
| [ ] | FX002-6 | Update panel-shell-responsive tests for 3 views | `_platform/panel-layout` | `test/unit/web/features/_platform/panel-layout/panel-shell-responsive.test.tsx` | Existing "renders MobilePanelShell on phone" test updated to use 3 views; add test: PanelShell with 3 mobileViews at 375px shows MobilePanelShell with 3 tabs; add test: PanelShell passes `initialActiveIndex` through to MobilePanelShell | Extend existing test file |
| [ ] | FX002-7 | Verify no regression | — | — | `just fft` passes; desktop browser page unchanged; desktop terminal page unchanged; mobile browser shows 3-tab swipe strip; mobile terminal redirects to browser with `?mobileView=2`; BottomTabBar Terminal on mobile goes to browser page | Harness screenshots at mobile (390px) + desktop (1024px) for both routes |

## Workshops Consumed

- [Workshop 004 — Unified Three-View Mobile Page](../workshops/004-unified-three-view-mobile-page.md) — all 5 resolved decisions

## Acceptance

- [ ] Browser page mobile shows 3 swipeable views: Files → Content → Terminal
- [ ] Terminal tab uses `lazy: true` — xterm.js + WebSocket mount only on first swipe
- [ ] Once activated, terminal view stays mounted on subsequent view switches
- [ ] Terminal route on mobile redirects to browser page with `?mobileView=2` (shows skeleton during redirect)
- [ ] Browser page reads `mobileView` param and passes `initialActiveIndex` to MobilePanelShell
- [ ] TerminalView receives `isActive` prop; xterm.js refocuses when swiping back to Terminal tab
- [ ] BottomTabBar Terminal item on mobile navigates to `/browser?...&mobileView=2` (no redirect hop)
- [ ] `sanitizeSessionName` used when calling `useTerminalSessions` in BrowserClient
- [ ] TerminalMobileGate wrapper checks viewport before mounting any terminal hooks
- [ ] Desktop browser page unchanged (3-panel layout, no terminal view)
- [ ] Desktop terminal page unchanged (session list + terminal)
- [ ] Zero terminal sessions → graceful empty state ("No terminal sessions") on browser page Terminal tab
- [ ] First swipe to Terminal → `TerminalSkeleton` visible briefly, then terminal connects (no blank frame)
- [ ] Invalid `mobileView` param (NaN, -1, 99) → clamped to valid range, defaults to Files view
- [ ] SSR hydration: server renders desktop, client hydrates to mobile without crash/flicker
- [ ] Spec AC-03, AC-04, AC-07 updated to reflect 3-view design
- [ ] Plan tasks 1.7, 1.8, Finding 03, and AC checklist updated
- [ ] All existing tests pass (`just fft`)

## Task Dependencies

```
FX002-1 (lazy + initialActiveIndex + PanelShell plumbing)
FX002-3b (TerminalView isActive prop)
    ↓
FX002-2 (BrowserClient 3rd view — depends on FX002-1 + FX002-3b)
FX002-5 (lazy mount tests — depends on FX002-1)
    ↓
FX002-3 (terminal redirect — depends on FX002-2)
FX002-4c (BottomTabBar — depends on FX002-2)
FX002-6 (responsive tests — depends on FX002-1 + FX002-2)
    ↓
FX002-4 + FX002-4b (spec/plan updates — after behavior settles)
    ↓
FX002-7 (regression verification — last)
```

Independent start: FX002-1, FX002-3b (parallel)
Then: FX002-2, FX002-5 (parallel)
Then: FX002-3, FX002-4c, FX002-6 (parallel)
Then: FX002-4, FX002-4b
Finally: FX002-7
