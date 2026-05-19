# Research Report: Split Terminal View on Browse Page

**Generated**: 2026-05-19
**Research Query**: "Add a split terminal toggle to /workspaces/[slug]/browser: right ⅓ becomes a terminal, left ⅔ keeps the existing menu / file-tree / viewer (with the inner menu still collapsible). The top explorer bar spans the whole page unchanged. Browse page only. Toggle button at the top; clicking again undoes the split."
**Mode**: Plan-Associated (auto-detected branch `084-random-enhancements-3`)
**Location**: `docs/plans/084-random-enhancements-3/split-terminal-view-research.md`
**FlowSpace**: Available (used for tree probe; deeper reads via Read/Grep for line-accuracy)
**Findings**: 5 subagents × ~10 = ~50 raw findings → synthesized to the report below.

## Executive Summary

### What it does (target behavior)
A toggle button in the browse-page top bar splits the area below the workspace **AgentTopBar** + **ExplorerPanel** into a horizontal pair: the existing browse UI (menu + file tree + viewer) on the left, sized to **⅔ width**, and an **inline `TerminalView`** on the right, sized to **⅓ width**. The toggle reverses cleanly. The split lives entirely inside `BrowserClient`; no other page (terminal page, workflow page, settings) is affected.

### Business purpose
Today the only way to see code and a terminal at the same time is the **right-edge overlay panel** (Plan 064), which floats over the viewer and steals horizontal space without letting the user dock it. The split view makes side-by-side coding-with-shell the default for the browse page — closer to a VS Code-style IDE workflow — without disturbing other pages.

### Key Insights
1. **The plumbing already exists.** `react-resizable-panels@^4` is installed and pre-wrapped at `apps/web/src/components/ui/resizable.tsx`. `TerminalView` is already imported by `browser-client.tsx` (mobile path, line 36 + line 1117) and proven to mount inside flex containers (`/terminal` page is the reference). No new dependency needed. — IA-01, PS-01, IC-02.
2. **There's exactly one structural change.** `PanelShell` currently emits `<explorer> + <left 280px> + <main flex-1>`. The split is a **new optional third slot** on `PanelShell` (or a wrapper at `browser-client.tsx`) that adds `<terminal>` to the right of `<main>`. The top `explorer` slot keeps spanning full width naturally — it sits above the row. — IA-02, IA-03.
3. **The toggle button has an existing socket.** `ExplorerPanel` already exposes a `rightActions?: ReactNode` prop (line 103, used at 537-539) that hosts the History and Question Popper buttons. The split toggle drops in there — zero new chrome required. — IA-04.
4. **The big risks are not layout — they are xterm.** Two prior gotchas dominate the design: (a) **xterm cleanup ordering** in resizing flex containers (Plan 064 Phase 2), and (b) **tmux's "smallest-client wins" sizing** when more than one client is attached to the same session. Both require disciplined patterns when the inline terminal can coexist with the overlay. — PL-02, PL-03.
5. **Anchor coupling: be aware.** The overlay terminal positions itself by `ResizeObserver`-ing the element with `data-terminal-overlay-anchor`, which today wraps `main` in `PanelShell` (line 77). When we add the right ⅓ split, we must decide whether the overlay anchor stays on `main` (overlay covers viewer only, leaves inline terminal visible) or expands to cover the whole right area. Recommended: keep anchor on `main`, and **auto-close the right-edge overlay when the inline split toggles on** (mutual-exclusion via `overlay:close-all`). — PL-01, IC-03.

### Quick Stats
- **Components touched**: ~5 (PanelShell, ExplorerPanel-consumer, BrowserClient, new SplitToggleButton, optional SDK contribution)
- **Dependencies**: 0 new (react-resizable-panels already present)
- **Test Coverage**: existing PanelShell and TerminalView have unit tests; new behavior covered by 2-3 browser-page integration tests
- **Complexity**: **Low-Medium** — the layout work is small; xterm resize + overlay interplay is where the care goes
- **Prior Learnings**: 5 relevant (PL-01 through PL-05)
- **Domains**: `file-browser` (owner of browse page), `terminal` (consumed via `TerminalView`), `_platform/panel-layout` (`PanelShell` contract change)

---

## How It Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| `BrowserPage` | Server Component | `apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx:29` | Reads URL params, prefetches root directory, hands off to client |
| `BrowserClient` | Client wrapper | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:112` | Owns ALL browse-page state (mode toggles, mobile index, etc.) |
| `BrowserClientInner` | Client shell | `browser-client.tsx:133` | Renders `PanelShell` with explorer/left/main slots |
| `PanelShell` | Layout primitive | `apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx:60-83` | Composes top explorer bar + left/main flex row |
| `TerminalView` | Display primitive | `apps/web/src/features/064-terminal/components/terminal-view.tsx:13-44` | Already-suspense-loaded xterm shell; accepts `className` |

### Current PanelShell Layout (panel-shell.tsx:65-83)

```tsx
<div className="flex flex-col h-full w-full overflow-hidden">
  {/* Explorer bar — full width — UNCHANGED for split */}
  <div className="shrink-0">{explorer}</div>

  {/* Below the explorer: a flex-row */}
  <div className="flex flex-1 overflow-hidden">
    <div
      className="shrink-0 overflow-hidden border-r"
      style={{ width: 280, minWidth: 150, maxWidth: '50%', resize: 'horizontal' }}
    >
      {left}     {/* file tree / changes view; ALREADY user-resizable */}
    </div>
    <div className="flex-1 flex flex-col overflow-hidden" data-terminal-overlay-anchor>
      {main}     {/* file viewer */}
    </div>
  </div>
</div>
```

### Where the AgentTopBar fits (the "explorer bar at the top" the user describes)

There are **two top bars** in the browse-page DOM tree — the user's wording covers both:

```
WorkspaceLayout
  └─ WorkspaceAgentChrome (workspace-agent-chrome.tsx:43)
     ├─ AgentTopBar              ← workspace-wide top strip (~28px, expandable)  [WS top bar]
     └─ <main flex-1>
        └─ BrowserClientInner
           └─ PanelShell
              ├─ ExplorerPanel    ← file-path search + actions row              [browse top bar]
              └─ flex-row(left 280px, main flex-1)
```

Both are **above** the proposed split row and both correctly span the full width by virtue of being `flex-col` siblings in their respective parents. **No structural fight** — the split lives one level deeper.

### Existing State Surfaces

- **URL params (nuqs)**: `fileBrowserParams` (dir, file, mode, changed) — server-aware, hydration-safe
- **Cookie**: `sidebar_state` for the global DashboardSidebar (7-day expiry, 256px↔48px)
- **SDK settings** (per-workspace, debounced): example — `terminal.colorTheme` from Plan 081
- **sessionStorage**: dismissed banners, file filter prefs
- **Local React state**: mobile view index, mode toggles

### Existing Terminal Surfaces

| Surface | Mount point | Lifecycle |
|---------|-------------|-----------|
| `/workspaces/[slug]/terminal` page | `TerminalPageClient` inside its own `PanelShell.main` | Independent WS per session selected from sidebar |
| Right-edge **overlay** | `TerminalOverlayPanel` mounted at workspace layout level; `position: fixed`, sizes itself off `data-terminal-overlay-anchor` | One WS per provider state; auto-closes on `/terminal` route |
| **(NEW)** Inline split | Inside `BrowserClient` → `PanelShell` new right slot | One WS per inline mount |

---

## Architecture & Design

### Recommended Composition (one valid shape)

```
BrowserClient
└── PanelShell
    ├── explorer:  ExplorerPanel rightActions={ <SplitToggleButton /> ... existing buttons }
    ├── left:      LeftPanel (FileTree / ChangesView) — unchanged
    ├── main:      FileViewerPanel — unchanged
    └── (NEW) terminal?: <TerminalView sessionName=… cwd=… /> when split is on
```

`PanelShell` gains a new optional slot, say `rightPane?: ReactNode` + an optional `rightPaneRatio?: number` (default 1/3). Internal layout switches from the current "explorer + (left + main)" to:

```tsx
<div className="flex flex-1 overflow-hidden">
  {/* The existing 2-column row, wrapped in a left container occupying 2/3 when split is on */}
  <ResizablePanelGroup direction="horizontal">
    <ResizablePanel defaultSize={66.66} minSize={30}>
      {/* existing left 280 + main flex-1 */}
    </ResizablePanel>
    {rightPane && <ResizableHandle withHandle />}
    {rightPane && (
      <ResizablePanel defaultSize={33.33} minSize={15}>
        {rightPane}
      </ResizablePanel>
    )}
  </ResizablePanelGroup>
</div>
```

When `rightPane` is undefined, render today's exact layout (no behavior change for the terminal page or any other consumer).

### Why ResizablePanelGroup (PS-01, PS-02)

- Already in deps (`react-resizable-panels@^4`, package.json:78) and wrapped in `apps/web/src/components/ui/resizable.tsx` with the project's shadcn styling (grip icon, focus ring).
- Gives the user the drag-to-resize divider the request implies ("contract the menu to give more space") without hand-rolling pointer math.
- `onLayout(sizes)` callback persists the ratio cheaply if/when we want it.

### Why a new PanelShell slot (vs. wrapping at browser-client only)

- Browse page is the only consumer right now, but `PanelShell` is the project's blessed layout primitive. Adding the slot upstream keeps `data-terminal-overlay-anchor` in one place (the `main` div) so we don't fork the overlay-positioning contract.
- Backwards-compatible: omitting `rightPane` ≡ today's behavior. Verified by reading panel-shell.tsx:60-83.

### Toggle Button Mount

- Drop into `ExplorerPanel.rightActions` at the browse page's PanelShell call site (browser-client.tsx around line 1152-1475). New component `<SplitTerminalToggleButton />`:
  - reads/writes split state (see Persistence below)
  - dispatches `overlay:close-all` on open (per PL-01) so the right-edge overlay doesn't double up with the inline pane

### Persistence Decision

Three viable options, ranked:

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **SDK setting** `fileBrowser.splitTerminalEnabled` (boolean) | Per-workspace, debounced, survives reloads, matches Plan 081 precedent | Async hydration → 1-frame flash | ✅ **Recommended** for the toggle + ratio |
| **URL param** `?splitTerminal=true` | Bookmarkable, SSR-safe (no hydration flash) | Pollutes URL; user probably doesn't want that on every share | Consider as alternative |
| `localStorage` + `useLayoutEffect` | Simple | Cross-tab drift; hydration mismatch risk (PL-04) | Don't |

For divider ratio, use `ResizablePanelGroup`'s `onLayout` → write to a sibling SDK setting `fileBrowser.splitTerminalRatio` (number, default 33.33). Read at mount, pass as `defaultSize`.

### Session/PTY Decision for the Inline Terminal (PL-03)

The inline terminal must use a **separate WebSocket connection** from the overlay even if both target the same tmux session, otherwise tmux shrinks the shared geometry to whichever client is narrower. Two cleaner approaches:

1. **Separate tmux session per surface** (e.g., `<branch>-inline`) — fully independent; cheap; preferred. Pair with a "Sessions" mode in the left panel later if you want multi-session switching from inline.
2. **Same tmux session, separate PTY clients + `resync` on toggle** — closer to a true side-by-side mirror but inherits all the sizing pain.

Recommend (1). The inline terminal opens a session named `<workspace-slug>-inline` (or echoes the user's last-selected session), and the overlay continues to behave as today.

### Mutual-Exclusion Wiring (PL-01)

- **On inline split toggle ON**: dispatch `overlay:close-all`. The terminal-overlay provider (and any other right-edge overlay — activity log, PR view, notes) closes itself.
- **The inline split does NOT subscribe to `overlay:close-all`**. The inline pane is part of the layout, not a transient overlay, so opening Activity Log shouldn't kill the inline terminal.
- Keyboard binding: do **not** rebind backtick / Ctrl+\`; both are already claimed (overlay toggle + global close). Either expose a new SDK keybinding (e.g., `Ctrl+Shift+\``) or keep it click-only for v1.

### Component Map

| Component | Layer | Responsibility | Change |
|-----------|-------|----------------|--------|
| `PanelShell` | `_platform/panel-layout` | Compose explorer + left + main + (new) right | **Modify** — add optional `rightPane`, internalize `ResizablePanelGroup` when present |
| `BrowserClient` / `BrowserClientInner` | `file-browser` | Browse-page state + slot wiring | **Modify** — own `splitEnabled` state, render `<TerminalView>` into the new slot |
| `SplitTerminalToggleButton` | `file-browser` (new) | Toggle button in `ExplorerPanel.rightActions` | **New** — ~30 LOC |
| `TerminalView` | `terminal` (consumed) | xterm shell | **No change** — already className-friendly |
| `ExplorerPanel` | `_platform/panel-layout` | Top bar; already has `rightActions` slot | **No change** |
| `TerminalOverlayProvider` | `terminal` (consumed) | overlay open/close + `overlay:close-all` plumbing | **No change** — we call into the existing event |
| `_platform/panel-layout/index.ts` | exports | barrel | **Modify** — re-export new prop type |

### Data Flow (toggle path)

```
[user clicks SplitTerminalToggleButton]
   ↓ (setState + setSDKSetting('fileBrowser.splitTerminalEnabled', true))
   ↓ dispatch CustomEvent('overlay:close-all')
[BrowserClientInner re-renders]
   ↓ passes rightPane={ <TerminalView sessionName=... cwd=worktreePath /> } to PanelShell
[PanelShell switches to ResizablePanelGroup form]
   ↓ TerminalView mounts → useTerminalSocket → WS connect → tmux session
   ↓ FitAddon runs in ResizeObserver
[user drags divider]
   ↓ onLayout(sizes) → setSDKSetting('fileBrowser.splitTerminalRatio', sizes[1])
   ↓ ResizeObserver fires → FitAddon.fit() (PL-02 cleanup discipline applies)
```

---

## Dependencies & Integration

### What this will depend on

| Dependency | Type | Why | Risk if Changed |
|------------|------|-----|-----------------|
| `react-resizable-panels@^4` | npm (existing) | Drag-to-resize divider | Low — pinned major |
| `apps/web/src/components/ui/resizable.tsx` | local wrapper | Style + grip icon | Low |
| `_platform/panel-layout` (`PanelShell`) | domain | New slot shape | **API change** — but additive (optional prop) |
| `terminal` (`TerminalView`) | domain | Inline mount | Low — already proven on `/terminal` page |
| `_platform/state` or SDK settings store | infra | Persist toggle + ratio | Low — established pattern |

### What will depend on this

- Only the browse page consumes the new slot today.
- Future plans (e.g., the **multi-folder-tree** plan in the same folder) may opt-in if they need an inline terminal — backwards-compatible since the slot is optional.

### Integration Architecture

The new slot lives **inside** `PanelShell`, **below** the AgentTopBar + ExplorerPanel header chain, and **above** any existing right-edge overlay's z-index. Concretely:

- DashboardSidebar (z: ambient, left edge): unaffected
- AgentTopBar (workspace-wide): unaffected, still spans full width
- ExplorerPanel (browse-page top bar): unaffected, still spans full width, gains one new button in `rightActions`
- New 2-column split: bounded by ExplorerPanel above and the workspace content edges
- TerminalOverlayPanel (right-edge overlay, position: fixed): **closed on inline open** via `overlay:close-all`; technically still mountable but UX-prevented from coexisting

---

## Quality & Testing

### Current Test Coverage (Adjacent)
- `test/unit/web/features/064-terminal/` covers `TerminalView` + `useTerminalSocket` + cleanup ordering — reuse these as templates.
- `test/unit/web/features/041-file-browser/` covers FileTree, FileViewerPanel.
- `test/unit/web/features/_platform/panel-layout/` covers existing PanelShell composition.

### Gaps to Close
- Unit test: `PanelShell` with `rightPane` present vs. absent — DOM shape + presence of `data-terminal-overlay-anchor`.
- Unit test: `SplitTerminalToggleButton` toggles state and dispatches `overlay:close-all`.
- Integration test (harness/Playwright): open browse page → click toggle → assert terminal mounts, then click again → assert clean unmount (no console errors from PL-02).
- Resize test: drag divider, assert FitAddon resizes without thrown errors.

### Known Issues / Tech Debt to Watch
- `panel-shell.tsx:70` uses native CSS `resize: horizontal` on the left column — this is **not** react-resizable-panels. Mixing native resize on the inner left with rrp on the outer split is fine but worth a manual smoke test; alternative is migrating the left handle to rrp too (out of scope for v1).
- Mobile path (`MobilePanelShell` + `MobileView`) already has its own swipe tabs including Terminal — no change there.

### Performance Characteristics
- TerminalView dynamically imports `TerminalInner` (no SSR) and Suspends — first mount cost is one network round-trip; subsequent toggles re-mount the inner component because the outer `rightPane` toggles in/out. Acceptable for v1; an `<aside hidden>` keep-mounted optimization is possible but raises the tmux-client-count and PL-03 surface.

---

## Modification Considerations

### ✅ Safe to Modify
1. `PanelShell` adding an **optional** prop. Backwards-compatible by construction.
2. `BrowserClient` — already owns dozens of toggle states; adding one more is routine.
3. `SplitTerminalToggleButton` — new component, no blast radius.

### ⚠️ Modify with Caution
1. **`data-terminal-overlay-anchor` placement**: keep it on the **main** column, not on the new `rightPane` column. Reason: the overlay measures this element; if you put the attribute on the split's outer container, the overlay grows to cover the inline terminal too. Mitigation: leave panel-shell.tsx:77 untouched.
2. **`ResizablePanelGroup` `direction="horizontal"` inside an already-flex parent**: rrp expects to own its flex container. Use it as the direct child of the new wrapper div; don't sandwich it inside another `flex` row.
3. **xterm cleanup order** (PL-02): when the user toggles split off, the inline `TerminalView` unmounts. Make sure `useTerminalSocket`'s teardown (terminal-socket.ts:254-269) still runs in this fast-unmount path — write a test.

### 🚫 Danger Zones
1. **Don't rebind backtick / Ctrl+`** — they are already claimed by the overlay (sdk-bootstrap.ts:101, terminal-overlay-panel.tsx:79). Cross-binding will create dead keypress UX. Either add a new chord or stay click-only for v1.
2. **Don't share the same tmux session/PTY between overlay and inline terminals** in v1 without the `resync` plumbing (PL-03). Use a different session name for the inline surface.
3. **Don't persist `splitEnabled` in cookies and read it in the server component** — `BrowserPage` is a server component and reading client preferences there causes hydration mismatch (PL-04). Keep persistence client-side.

### Extension Points
- Future: a `rightPaneKind` enum so the slot can host non-terminal panes (e.g., AI chat, log tail). The `TerminalView` is just today's chosen content.
- Future: per-tab/per-worktree split state (today: per-workspace via SDK setting).

---

## Prior Learnings (From Previous Implementations)

### 📚 PL-01: Overlay Mutual-Exclusion via `overlay:close-all` CustomEvent
**Source**: Plan 065 (Activity Log) Phase 3, Plan 067 (Question Popper), inherited by Terminal overlay
**Type**: pattern / decision
**What they found**: All right-edge overlay providers (terminal, activity-log, pr-view, notes, agent) dispatch `window.CustomEvent('overlay:close-all')` before opening, and listen to it to close themselves. An `isOpeningRef` guard prevents self-close during the same tick.
**How they resolved it**: Single global event, every provider both fires and listens; guard via opener ref.
**Why this matters now**: The inline split should **fire** `overlay:close-all` when it turns on (close the right-edge terminal overlay automatically) but **must not listen** — opening Activity Log shouldn't tear down the docked terminal column. Treat the inline pane as part of the layout, not as another overlay.
**Action**: On `setSplit(true)`, dispatch `overlay:close-all`. Do not add a listener.

---

### 📚 PL-02: xterm.js Fit-Addon + ResizeObserver Cleanup Order
**Source**: Plan 064 Phase 2 (T004, T006); DR-01 finding 6 + DYK-03
**Type**: gotcha
**What they found**: In React 19 strict mode (double-mount), tearing down a `TerminalView` in the wrong order — `terminal.dispose()` *before* `ResizeObserver.disconnect()` — triggers a fit on a disposed terminal and throws.
**How they resolved it**: Strict order: (1) set `disposed = true`, (2) `observer.disconnect()`, (3) cancel pending `requestAnimationFrame`, (4) `ws.close(1000)`, (5) `terminal.dispose()` last; wrap RO callbacks in `if (!disposed)` guards.
**Why this matters now**: The inline terminal is mounted/unmounted **every time the user toggles split off**, and resized continuously when the user drags the divider — both stress paths for cleanup ordering.
**Action**: Reuse `useTerminalSocket` and `TerminalInner` exactly as the `/terminal` page does. Do NOT inline a custom xterm wrapper. Add an integration test that toggles split on/off 10× and asserts no console errors.

---

### 📚 PL-03: tmux Smallest-Client Geometry War
**Source**: Plan 064 Phase 1/2; DYK-01
**Type**: gotcha
**What they found**: When multiple clients attach to one tmux session, tmux clamps display geometry to the smallest connected client. Opening the overlay (≈480px wide) while the `/terminal` page (full width) is open already crushes the page's terminal.
**How they resolved it**: Auto-close the overlay when the URL contains `/terminal` (terminal page wins on its own page).
**Why this matters now**: An inline terminal at ~⅓ of the browse area + the overlay open = same problem. And even if we close the overlay on inline-open, the inline column will be narrower than the `/terminal` page, so users hopping pages will see geometry whiplash.
**Action**: Use a **distinct tmux session** for the inline surface (e.g., suffix `-inline` or expose a session picker). The right-edge overlay continues to use the user's chosen session. Document this in the spec.

---

### 📚 PL-04: Hydration Mismatch from Client-Persisted Toggles
**Source**: Plan 041 Phase 2; nuqs integration research
**Type**: gotcha
**What they found**: Storing UI toggles in cookies/localStorage and reading them inside server components causes the server to render the default state, then the client to flip on hydration — flash + warnings in strict mode.
**How they resolved it**: For URL-bookmarkable state, use nuqs (server-aware). For session UI, read storage in a client `useEffect`/`useLayoutEffect` only.
**Why this matters now**: SDK settings are client-only and async, so the very first render of `BrowserClient` will show split = off even if the user's persisted state is on. The flash will be ≤1 frame — usually acceptable, but we should not pretend it's free.
**Action**: Accept the 1-frame flash, OR mirror the toggle into a URL param when on (`?splitTerminal=1`) so the server can render correctly on reload. Decide in `/plan-2-clarify`.

---

### 📚 PL-05: PanelShell Composition Contract is Additive-Friendly
**Source**: Plan 064 Phase 3; Plan 043 Phase 1
**Type**: insight
**What they found**: `PanelMode` and PanelShell slots have been safely extended multiple times by adding new optional fields — `Partial<Record<PanelMode, ReactNode>>` gracefully renders nothing for unknown keys.
**Why this matters now**: Adding `rightPane?: ReactNode` to `PanelShellProps` follows the same precedent — no migration burden on other consumers (terminal page, workflow page, etc.).
**Action**: Land the slot as optional; do not require any consumer to update.

---

### Prior Learnings Summary

| ID | Type | Source Plan | Key Insight | Action |
|----|------|-------------|-------------|--------|
| PL-01 | pattern | Plan 065/067 | Overlay mutual exclusion via `overlay:close-all` | Fire on open; do not listen |
| PL-02 | gotcha | Plan 064 P2 | xterm/RO cleanup ordering | Reuse TerminalInner; test fast unmount |
| PL-03 | gotcha | Plan 064 P1/P2 | tmux clamps to smallest client | Distinct session for inline surface |
| PL-04 | gotcha | Plan 041 P2 | Persisted toggles → hydration flash | Accept flash OR mirror to URL param |
| PL-05 | insight | Plan 064/043 | PanelShell slots extend additively | Land `rightPane` as optional prop |

---

## Domain Context

### Existing Domains Relevant to This Research

| Domain | Relationship | Relevant Contracts | Key Components |
|--------|-------------|-------------------|----------------|
| `file-browser` | **Primary owner** of the browse page surface | Browser page, `BrowserClient`, `fileBrowserParams` | `browser/page.tsx`, `browser-client.tsx`, `FileTree`, `FileViewerPanel` |
| `_platform/panel-layout` | **Layout primitive owner** — receives the additive `rightPane` slot | `PanelShell`, `ExplorerPanel` (`rightActions` slot), `PanelMode` | `panel-shell.tsx`, `explorer-panel.tsx`, `left-panel.tsx`, `main-panel.tsx` |
| `terminal` | **Consumed**; provides `TerminalView` + `useTerminalSocket` | `TerminalView`, `TerminalOverlayProvider`, `overlay:close-all` event | `terminal-view.tsx`, `terminal-inner.tsx`, `use-terminal-overlay.tsx`, `use-terminal-socket.ts` |
| `_platform/sdk` (settings store) | **Consumed** for persistence | `useSDKSetting`, `SDKContribution` | `apps/web/src/lib/sdk/use-sdk-setting.ts`, `settings-store.ts` |
| `_platform/events` | **Indirect** — overlay event bus | `overlay:close-all` (CustomEvent), sonner toasts | Cross-feature listeners |

### Domain Map Position

This sits squarely on the `file-browser ↔ terminal` boundary, with `_platform/panel-layout` as the load-bearing layout primitive between them. No new domain.

### Potential Domain Actions

- **Extend `_platform/panel-layout`**: add `rightPane?: ReactNode` prop. Update `docs/domains/_platform/panel-layout/domain.md` (Contracts table + History row).
- **Extend `file-browser` domain doc**: append a row noting the browse page now hosts an inline-terminal slot (consumes `terminal/TerminalView`).
- **No change to `terminal` domain** — only consumed via existing public contract.

---

## Critical Discoveries

### 🚨 Critical Finding 01: tmux Geometry War with Coexisting Surfaces
**Impact**: Critical (UX regression risk)
**Source**: PL-03 / Plan 064 Phase 1/2 DYK-01
**What**: If the inline terminal and the right-edge overlay attach to the same tmux session, the narrower one clamps geometry for both.
**Why It Matters**: Users will see "shrunken" terminals after toggling — a confusing bug-not-bug.
**Required Action**: Use distinct tmux session names per surface, or implement explicit `resync` + `detach` on toggle.

### 🚨 Critical Finding 02: xterm Cleanup Order on Fast Unmount
**Impact**: Critical (crash on toggle-off)
**Source**: PL-02 / Plan 064 Phase 2
**What**: Wrong cleanup order on unmount throws in React 19 strict mode.
**Why It Matters**: The inline terminal is toggled on/off frequently — orders of magnitude more often than `/terminal` page navigation.
**Required Action**: Mount via the canonical `TerminalView`; let `useTerminalSocket` own teardown; do not bypass.

### 🚨 Critical Finding 03: `data-terminal-overlay-anchor` Placement
**Impact**: High (overlay misalignment)
**Source**: panel-shell.tsx:77, terminal-overlay-panel.tsx:49-60
**What**: The overlay positions itself by measuring the element carrying `data-terminal-overlay-anchor`. Today that's `main`. If we accidentally move the attribute to the new outer wrapper, the overlay grows to cover the inline column too.
**Why It Matters**: Two terminals visually stacked = mess.
**Required Action**: Keep `data-terminal-overlay-anchor` on the `main` slot exactly. Auto-close the overlay on inline-open (PL-01) regardless.

---

## Supporting Documentation

### Related Documentation
- [`docs/domains/terminal/domain.md`](../../domains/terminal/domain.md) — contracts and source-of-truth pointer
- [`docs/domains/file-browser/domain.md`](../../domains/file-browser/domain.md) — owns the browse page
- [`docs/domains/_platform/panel-layout/domain.md`](../../domains/_platform/panel-layout/domain.md) — PanelShell contract owner
- [`docs/plans/064-terminal/`](../064-terminal/) — terminal feature plan (PL-02, PL-03 origins)
- [`docs/plans/041-file-browser/`](../041-file-browser/) — browser feature plan (PL-04 origin)
- `apps/web/src/components/ui/resizable.tsx` — local shadcn wrapper for `react-resizable-panels`

### Key Code References
- `apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx:60-83`
- `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx:103,140,537-539` (`rightActions` slot)
- `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:36,1117,1152-1475` (TerminalView already imported)
- `apps/web/src/features/064-terminal/components/terminal-view.tsx:13-44` (className prop)
- `apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx:38-97` (overlay state + isOpeningRef)
- `apps/web/src/features/064-terminal/hooks/use-terminal-socket.ts:254-269` (WS teardown)
- `apps/web/src/lib/sdk/sdk-bootstrap.ts:89-101` (Backquote binding — DO NOT collide)

---

## Recommendations

### If Modifying This System
1. Land the change in this order to minimize blast radius:
   - Step 1: Add `rightPane?: ReactNode` (+ optional `rightPaneRatio?: number`) to `PanelShell` with no consumer changes; ship + verify.
   - Step 2: Build `<SplitTerminalToggleButton />` with SDK-setting persistence.
   - Step 3: Wire `browser-client.tsx` to pass `rightPane={ <TerminalView ... /> }` conditionally.
   - Step 4: Dispatch `overlay:close-all` on toggle-on; add the toggle to `ExplorerPanel.rightActions` at the browse-page call site.
2. Use a distinct tmux session name for the inline surface (e.g., `${slug}-inline` or `${branch}-inline`).
3. Don't touch `data-terminal-overlay-anchor`.

### If Extending This System (future plans)
- The `rightPane` slot is intentionally generic. A future "AI chat in browse pane" or "log tail in browse pane" feature can plug in the same slot — no further `PanelShell` change.

### If Refactoring This System
- Consider promoting the native CSS `resize: horizontal` on the inner left column to a `ResizablePanelGroup` handle for a consistent drag experience. **Out of scope for v1**.

---

## External Research Opportunities

No external research gaps surfaced during this exploration — every load-bearing question was answerable from existing code, domain docs, or prior plans. The only "industry best practice" question one might raise is the persistence model (URL vs. SDK vs. cookie), and that's already settled by Chainglass precedent (SDK for workspace prefs; URL for shareable state).

If during `/plan-2-clarify` we find an open question that hinges on, say, accessibility guidance for split-pane keyboard navigation, that would be a fresh `/deepresearch` candidate — but nothing demands it today.

---

## Appendix: File Inventory

### Core Files (read or to be read for design)
| File | Purpose |
|------|---------|
| `apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx` | The layout primitive that gains a `rightPane` slot |
| `apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | Already hosts a `rightActions` slot for the new toggle button |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx` | Server entry — unchanged |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | The wiring point for state + slot composition |
| `apps/web/src/features/064-terminal/components/terminal-view.tsx` | Reused unchanged |
| `apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx` | Source of `overlay:close-all` semantics |
| `apps/web/src/components/ui/resizable.tsx` | Existing rrp wrapper, ready to use |

### Test Files (templates / extensions)
- `test/unit/web/features/_platform/panel-layout/panel-shell.test.tsx` (extend)
- `test/unit/web/features/064-terminal/*.test.tsx` (reuse cleanup patterns)
- New: `test/unit/web/features/041-file-browser/split-toggle.test.tsx`
- New (harness/Playwright): `harness/cli/scenarios/browse-split-toggle.ts`

### Configuration Files
- `apps/web/package.json` — no change (`react-resizable-panels@^4` already present)

---

## Next Steps

No external research opportunities identified.

**Recommended next**:
1. `/plan-2-clarify` to lock the 2–3 ambiguities worth pinning before specifying:
   - **Persistence**: SDK setting only, or also mirror to a URL param to avoid hydration flash?
   - **Session strategy**: distinct `-inline` tmux session, or expose a session picker in the inline pane header?
   - **Default ratio**: hard 2/3 + 1/3, or remember the user's last divider position?
   - **Keyboard shortcut**: click-only v1, or add a chord (suggested: `Ctrl+Shift+\``)?
2. Then `/plan-1b-specify "split terminal view on browse page"` to draft the spec.
3. Then `/plan-3-architect` for the phased plan (likely 2 phases: `_platform/panel-layout` slot landing, then `file-browser` wiring + toggle).

---

**Research Complete**: 2026-05-19
**Report Location**: `docs/plans/084-random-enhancements-3/split-terminal-view-research.md`
