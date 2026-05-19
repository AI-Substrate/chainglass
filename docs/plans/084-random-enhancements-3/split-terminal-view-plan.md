# Split Terminal View — Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-05-19
**Spec**: [`split-terminal-view-spec.md`](./split-terminal-view-spec.md) (v1.2.0, CLARIFIED)
**Research**: [`split-terminal-view-research.md`](./split-terminal-view-research.md)
**Flight Plan**: [`split-terminal-view.fltplan.md`](./split-terminal-view.fltplan.md)
**Status**: DRAFT (ready for `/plan-4-complete-the-plan`)

---

## Summary

Add an inline split on `/workspaces/[slug]/browser`: clicking a new toggle in the browse-page top bar splits the area below the workspace top strip and explorer bar into the existing browse UI on the left (⅔, with the inner file-tree column still resizable) and a docked `TerminalView` on the right (⅓). The terminal attaches to the **same tmux session** as the right-edge overlay and the `/terminal` page — one terminal that follows the user across all three surfaces. Toggle state is session-only React state. Mutual exclusion (`overlay:close-all`) ensures only one terminal client is attached in steady state; an explicit `{type:'resync'}` after toggle-on prevents the tmux smallest-client geometry clamp from sticking.

---

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `_platform/panel-layout` | existing | **modify** | Add optional `rightPane?: ReactNode` to `PanelShellProps`. When set, switch internal desktop layout to `ResizablePanelGroup`. Keep `data-terminal-overlay-anchor` on the `main` slot. |
| `file-browser` | existing | **modify** | Browse page hosts the toggle state (`useState`), the new `<SplitTerminalToggleButton>`, and the slot wiring that hands `<TerminalView>` into `PanelShell.rightPane`. Hidden on mobile (mobile already has a Terminal swipe tab). |
| `terminal` | existing | **consume + one additive resync** | `TerminalView` is mounted unchanged. One small additive change to `terminal-inner.tsx`: send a one-shot `{type:'resync'}` after the first WS `connected` event, so any newly-attached client refreshes tmux's window geometry regardless of what other clients were attached previously. Benefits inline pane + page + overlay. |
| `_platform/events` | existing | **consume** | Dispatch global `overlay:close-all` on toggle-on (existing pattern from Plans 064/065/067/071). |

`_platform/sdk` is **not** consumed — toggle and divider ratio are session-only React state per C-07.

No new domains. No new edges in `docs/domains/domain-map.md`.

---

## Agent Harness Strategy

- **Current Maturity**: L3 (auto boot + browser interaction via CDP + structured evidence + CLI SDK)
- **Target Maturity**: L3 (unchanged)
- **Boot Command**: `just harness dev`
- **Health Check**: `just harness health` → `{"status":"ok"}`
- **Interaction Model**: Browser automation via CDP (`just harness nav <url>`, `just harness eval`) + structured terminal output
- **Evidence Capture**: JSON responses + screenshots
- **Pre-Phase Validation**: Not required (single-phase Simple plan). Validation gates per-task in the table below.

The L3 harness is sufficient for this feature — `harness/tests/features/browse-split-toggle.spec.ts` (T010) is the Playwright spec that exercises the full toggle + drag + teardown cycle, following the same CDP-fixture pattern used by `harness/tests/features/browser.spec.ts` and `terminal.spec.ts`.

---

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx` | `_platform/panel-layout` | **contract** (public props extended) | T001/T002 — add `rightPane?: ReactNode`, switch internal layout when present |
| `apps/web/src/features/_platform/panel-layout/index.ts` | `_platform/panel-layout` | contract (barrel) | Re-export the updated `PanelShellProps` type (already barrel-exported; no change unless type rename needed) |
| `test/unit/web/features/_platform/panel-layout/panel-shell.test.tsx` | `_platform/panel-layout` | internal (tests) | T003/T011 — both-branches snapshot + anchor-attribute assertion |
| `apps/web/src/features/041-file-browser/components/split-terminal-toggle-button.tsx` | `file-browser` | internal (new component) | T004 — toggle button rendered in `ExplorerPanel.rightActions` |
| `test/unit/web/features/041-file-browser/split-terminal-toggle-button.test.tsx` | `file-browser` | internal (tests) | T005/T008 — click dispatches `overlay:close-all` on enable; ARIA reflects state; non-subscription to `overlay:close-all` |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | `file-browser` | internal (wiring) | T006 — `useState` for toggle, pass to ExplorerPanel rightActions + to PanelShell.rightPane; mobile-hidden |
| `test/unit/web/app/browser-client-split.test.tsx` (extend or new) | `file-browser` | internal (tests) | T009 — 10× toggle stress test (clean console, no orphaned WS) |
| `apps/web/src/features/064-terminal/components/terminal-inner.tsx` | `terminal` | **cross-domain** (one additive line) | T007 — send `{type:'resync'}` once after first `connected` event |
| `harness/tests/features/browse-split-toggle.spec.ts` (new) | harness (external tooling) | scenario | T010 — Playwright E2E spec under the existing `harness/tests/features/` convention (peer to `browser.spec.ts` / `terminal.spec.ts`) |
| `docs/domains/_platform/panel-layout/domain.md` | `_platform/panel-layout` | contract (doc) | T012 — new Contract row for `PanelShell.rightPane`; History row |
| `docs/domains/file-browser/domain.md` | `file-browser` | contract (doc) | T012 — Composition table row for `SplitTerminalToggleButton`; History row |
| `docs/domains/terminal/domain.md` | `terminal` | contract (doc) | T012 — History row noting new consumer surface + resync-on-connect enhancement |
| `docs/domains/domain-map.md` | (cross-domain doc) | contract (doc) | T012 — add new consume edge `file-browser → terminal` (TerminalView · cwd · sessionName) |
| `docs/how/split-terminal-view.md` (new) | docs | user-facing | T013 — brief feature note |

---

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| KF-00 | High | Zero new npm dependencies. `react-resizable-panels@^4` is already listed in `apps/web/package.json` and pre-wrapped with shadcn styling at `apps/web/src/components/ui/resizable.tsx` (verified). | T002 imports from `@/components/ui/resizable`, not from the primitive package. No dep PR or lockfile churn required. |
| KF-01 | Critical | `PanelShell` already branches on `useResponsive().useMobilePatterns` → `MobilePanelShell` (panel-shell.tsx:46-60). The new `rightPane` slot must only apply to the desktop branch. Mobile already has a 4-tab swipe strip (Files / Content / Terminal / History) and must remain unchanged. | T002 wraps the new ResizablePanelGroup logic in the desktop branch only. T006 wraps the toggle button in a `useResponsive` check (or relies on `MobilePanelShell` ignoring `rightPane`). AC-14 + AC-15 cover this. |
| KF-02 | Critical | `data-terminal-overlay-anchor` lives on the `main` slot's wrapper div (panel-shell.tsx:77). Moving it to the new outer `ResizablePanelGroup` would cause the right-edge terminal overlay to size over the entire bottom row including the inline column. | T002 leaves the anchor exactly where it is. T011 codifies this with an assertion test in both branches. AC-17. |
| KF-03 | High | xterm cleanup ordering on fast unmount throws under React 19 strict mode if the order is wrong (PL-02, Plan 064 Phase 2). The inline pane toggles mount/unmount on every click — the highest-frequency stress on this path. | Reuse `TerminalView` verbatim — do NOT inline a custom xterm wrapper. T009 mounts BrowserClientInner with split-off, toggles 10×, and asserts `console.error` is never called and no WebSocket / ResizeObserver leaks. AC-08, AC-16. |
| KF-04 | High | tmux clamps window dimensions to the smallest attached client. After `overlay:close-all` fires and the overlay's WS detaches, tmux does not automatically re-fit to the remaining (larger) inline client until something forces a refresh. Without explicit resync the inline pane shows a stale narrow column even though the container is wide. | T007 — add a one-shot `{type:'resync'}` send to `terminal-inner.tsx` after the first WS `connected` event. This is benign for the terminal page + overlay (already-largest client) and corrects the inline case. AC-13. |
| KF-05 | High | `terminal:close-all`-style global events are an established pattern in the codebase (Plans 064/065/067/071). The inline pane must **dispatch** `overlay:close-all` on enable but must **not** listen — it's layout, not overlay. | T004 dispatches; T008 asserts the inline pane stays mounted when `overlay:close-all` fires from another source. AC-09. |
| KF-06 | Medium | `TerminalView` is already imported by `browser-client.tsx` at line 36 and used for the mobile path at line 1117. Same session-name resolution (`termSelectedSession ?? branch-session`) and `cwd={worktreePath}` apply to the inline pane. | T006 reuses the existing import and the mobile path's session-name selection. No new imports beyond `SplitTerminalToggleButton` and `useState`. |
| KF-07 | Medium | `apps/web/src/components/ui/resizable.tsx` re-exports `react-resizable-panels` with shadcn styling (grip icon + focus ring). Use these wrappers everywhere; do not import the primitive package directly. | T002 imports `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` from `@/components/ui/resizable`. |
| KF-08 | Low | `PanelShell` accepts an optional `autoSaveId` for persisting panel sizes via react-resizable-panels' built-in storage. The spec is session-only (C-07), so we do **not** pass `autoSaveId` — sizes reset on every mount. | T002 omits `autoSaveId` deliberately. Comment in code documents the choice for future maintainers. |
| KF-09 | High | The new `rightPane` slot is a **generic public primitive**, not a terminal-only slot. The spec's "no new panel types in v1" is a feature-scope constraint, not an API encapsulation constraint. Future plans (chat, log tail, breakpoint debugger) can pass any `ReactNode` into this slot without further `PanelShell` change. | T001 re-exports `rightPane` via the panel-layout barrel. T012(a) documents the slot as a public contract (Contracts table row) so future plan authors discover it. |

---

## Implementation

**Objective**: Land the feature in a single coherent diff — `PanelShell.rightPane` slot + browse-page toggle + minimal terminal-side resync — covered by tests at three levels (unit, integration stress, harness E2E) and three doc updates.

**Testing Approach**: **Hybrid** (per spec § Testing Strategy)
- TDD-style for the load-bearing units: T003 (PanelShell shape), T009 (toggle stress / cleanup), T011 (anchor attribute), T007 implementation accompanied by terminal-inner test for resync send.
- Lightweight assertion-style for: T005 (toggle button ARIA + dispatch), T008 (non-subscription), T010 (E2E harness scenario).
- Targeted mocks: existing `test/fakes/fake-pty.ts` + `test/fakes/fake-tmux-executor.ts`; real React DOM; real `ResizablePanelGroup`.

### Task Order Rationale

Phase the diff so each task lands a self-contained, reviewable change:

1. **T001 → T003**: Land the structural primitive (panel-layout slot) first with tests proving no-slot parity. **Mergeable independently** — zero consumers depend on `rightPane` yet, so it's a safe foundation.
2. **T004 → T005**: Toggle component in isolation, fully testable without `BrowserClient`. Component is generic over `value`/`onChange`, so it's a pure leaf with no external dependencies beyond `lucide-react`.
3. **T007**: Terminal resync — small additive change to a different domain, tested in isolation. Beneficial to all surfaces even if the inline feature is never enabled.
4. **T006**: The wiring task — composes T001+T004+T007 in `browser-client.tsx`. **This is where the feature comes alive.**
5. **T008, T009, T011**: Behavioral / regression tests at the integrated level.
6. **T010**: Harness E2E scenario — only meaningful once T006 lands.
7. **T012, T013**: Docs — last, because they reference final shapes.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|----|------|--------|---------|-----------|-------|
| [ ] | T001 | Add `rightPane?: ReactNode` to `PanelShellProps`; thread through to the desktop-branch render. | `_platform/panel-layout` | `apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx`, `apps/web/src/features/_platform/panel-layout/index.ts` | TypeScript compiles with zero errors; `pnpm --filter web exec tsc --noEmit` is clean; `apps/web/src/features/_platform/panel-layout/index.ts` re-exports the updated `PanelShellProps` type; existing consumers (terminal page, workflow page) still type-check without changes. | Additive prop; KF-08 — no `autoSaveId`. |
| [ ] | T002 | When `rightPane` is present (desktop branch only), wrap the existing left+main flex-row inside a horizontal `ResizablePanelGroup` with two `ResizablePanel`s: left (`defaultSize={66.66}`, `minSize={30}`) holds the existing left+main composition; right (`defaultSize={33.33}`, `minSize={15}`, `maxSize={70}`) holds `rightPane`. Insert a `ResizableHandle withHandle` between them. Keep `data-terminal-overlay-anchor` on the `main` slot's wrapper. | `_platform/panel-layout` | `apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx`, `apps/web/src/components/ui/resizable.tsx` (read only) | Renders correctly with and without `rightPane`. When absent: today's DOM exactly. When present: `[data-slot='resizable-panel-group']` is the new outer wrapper; the inner `main` wrapper still carries `data-terminal-overlay-anchor`. | KF-01, KF-02, KF-07. Mobile branch (`useMobilePatterns`) ignores `rightPane`. |
| [ ] | T003 | Unit test PanelShell with and without `rightPane`. Two cases: (a) no slot → DOM has no `ResizablePanelGroup`, current structure preserved; (b) slot present → outer `ResizablePanelGroup` exists with two panels and a handle, `data-terminal-overlay-anchor` is on the `main` slot wrapper (still findable by the same selector path). | `_platform/panel-layout` | `test/unit/web/features/_platform/panel-layout/panel-shell.test.tsx` | Both branches pass under Vitest; tests fail if anchor moves or if no-slot DOM changes. | TDD — write tests in T003 BEFORE finishing T002 to lock the contract. |
| [ ] | T004 | Create `<SplitTerminalToggleButton>` component. Props: `value: boolean`, `onChange: (next: boolean) => void`. Renders a small icon button using `PanelRight` from `lucide-react`. ARIA: `role="switch"`, `aria-checked={value}`, `aria-label="Toggle inline terminal"`. On click: if transitioning `false → true`, dispatch `window.dispatchEvent(new CustomEvent('overlay:close-all'))` BEFORE calling `onChange(true)`. On `true → false`, just call `onChange(false)` (no dispatch). | `file-browser` | `apps/web/src/features/041-file-browser/components/split-terminal-toggle-button.tsx` | Component renders; clicking flips state via parent; dispatch fires only on enable. | KF-05. Match button styling of existing actions in `ExplorerPanel.rightActions` (History button, Question Popper). |
| [ ] | T005 | Unit test `SplitTerminalToggleButton`: (a) click dispatches `overlay:close-all` exactly once on `false → true`; (b) click does NOT dispatch on `true → false`; (c) `aria-checked` reflects `value`; (d) `aria-label` is present and reasonable. | `file-browser` | `test/unit/web/features/041-file-browser/split-terminal-toggle-button.test.tsx` | All four assertions pass; uses a custom-event spy. | Lightweight test. |
| [ ] | T006 | In `BrowserClientInner`: add `const [splitTerminalEnabled, setSplitTerminalEnabled] = useState(false)`. Build a small mobile-aware fragment for the new toggle button (rendered only when `useResponsive().useMobilePatterns === false`), appended to the existing `ExplorerPanel.rightActions` content. The button is wired with `value={splitTerminalEnabled} onChange={setSplitTerminalEnabled}`, which preserves the `overlay:close-all` dispatch behavior implemented in T004 on the `false → true` transition. Conditionally pass `rightPane={splitTerminalEnabled ? <TerminalView sessionName={effectiveSession} cwd={worktreePath} themeOverride={terminalTheme} /> : undefined}` to `PanelShell`. Reuse the same session-name resolution as the mobile path (`termSelectedSession ?? branchSessionFallback`). | `file-browser` | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Toggle appears on desktop browse page; clicking it splits the layout AND fires `overlay:close-all` (closing any right-edge overlay); clicking again restores layout WITHOUT firing the event; mobile path unchanged; other pages unaffected. | KF-01, KF-05, KF-06. AC-01..AC-10, AC-14, AC-15. |
| [ ] | T007 | Add a one-shot resync send in `TerminalInner`: after the first transition to `connectionStatus === 'connected'`, send `JSON.stringify({ type: 'resync' })` through the existing `sendRef.current` (terminal-inner.tsx:116-style). Guard with a `resyncSentRef` so it fires only once per WS lifecycle (re-arm on reconnect). | `terminal` | `apps/web/src/features/064-terminal/components/terminal-inner.tsx` | After mount + connect, server logs the resync; tmux refresh-client is invoked; new clients see fresh geometry. Add a unit test in the adjacent terminal-inner test file asserting the resync send happens exactly once after first connect (using fake socket). | KF-04. Small additive change to `terminal` domain — captured in the History row in T012. Re-arming on reconnect ensures backoff-driven WS swaps also resync. |
| [ ] | T008 | Mutual-exclusion non-subscription test: render `BrowserClientInner` with split-on; dispatch `window.dispatchEvent(new CustomEvent('overlay:close-all'))` from a simulated overlay opener; assert that the inline `TerminalView` is still mounted and `splitTerminalEnabled` is still `true`. | `file-browser` | `test/unit/web/features/041-file-browser/split-terminal-toggle-button.test.tsx` or `test/unit/web/app/browser-client-split.test.tsx` | Test passes; inline pane never auto-closes on `overlay:close-all`. | KF-05. AC-09. |
| [ ] | T009 | Toggle stress test (PL-02 mitigation, AC-16): render `BrowserClientInner` with split-off, then run a loop that programmatically calls `setSplitTerminalEnabled(true) → setSplitTerminalEnabled(false)` 10 times back-to-back. Spy `console.error`. Use the `fake-pty` + `fake-tmux-executor` fakes to count open WebSocket lifetimes. Assert: zero `console.error` calls; final open-WS count is 0. | `file-browser` (consumes `terminal` fakes) | `test/unit/web/app/browser-client-split.test.tsx` (new or extend) | All 10 cycles complete with a clean console; fake WS counters are zero at the end. | KF-03. Reuses Plan 064 fake patterns. |
| [ ] | T010 | Harness Playwright spec following the conventions in `harness/tests/features/` (peer to `browser.spec.ts`, `terminal.spec.ts`, `fx011-html-asset-token.spec.ts`). Connects via the harness's CDP base fixture. Steps: navigate to a known browse-page test workspace; click the new toggle; assert a `[data-slot='resizable-panel-group']` element appears and the right `ResizablePanel` width is ≈ ⅓ of the available content area (tolerance ±2%); type `printf 'split-ok\n'` into the inline terminal and assert the output appears in the xterm DOM within 2s; drag the divider to ~50/50 and assert width changes; toggle off; assert the panel group is removed AND the inline `TerminalView`'s xterm container is fully unmounted (no surviving `[data-terminal-overlay-anchor]`-adjacent xterm DOM nodes) — closes the test-boundary gap with T009; navigate to `/workspaces/[slug]/terminal` and confirm the same workspace's terminal session shows the prior `split-ok` output (proving shared session, C-06). | harness (external) | `harness/tests/features/browse-split-toggle.spec.ts` | `pnpm --filter harness exec playwright test tests/features/browse-split-toggle.spec.ts` exits 0 against a running harness container (`just harness dev`); screenshots captured via the standard `harness/tests/features/` fixture pattern. | AC-03..AC-07, AC-08 (clean unmount), AC-12, AC-13. Capture screenshots into the standard harness evidence directory used by sibling specs. |
| [ ] | T011 | Anchor-attribute assertion test (dedicated): in `panel-shell.test.tsx`, assert that `[data-terminal-overlay-anchor]` resolves to the same descendant selector path (the `main` slot wrapper) in BOTH the `rightPane`-absent and `rightPane`-present branches. Fail loudly if the attribute moves. | `_platform/panel-layout` | `test/unit/web/features/_platform/panel-layout/panel-shell.test.tsx` | One additional test case passes; future regressions caught. | KF-02. AC-17. |
| [ ] | T012 | Update four docs with the **exact row content** specified in the **Doc-Update Templates** sub-block below this table. Match the existing row formats by reading each target file first. Targets: (a) `_platform/panel-layout` domain.md — new Contract row + new Composition row + History row; (b) `file-browser` domain.md — new Composition row + History row; (c) `terminal` domain.md — History row; (d) `docs/domains/domain-map.md` — new mermaid edge `fileBrowser → terminal` with multi-contract label following the existing single-line `·`-separator convention used by sibling edges. | (docs) | `docs/domains/_platform/panel-layout/domain.md`, `docs/domains/file-browser/domain.md`, `docs/domains/terminal/domain.md`, `docs/domains/domain-map.md` | All four files contain the exact rows from the Doc-Update Templates sub-block (or a minimal stylistic adaptation to match each file's column ordering); mermaid in `domain-map.md` compiles without error (verify by re-rendering); `git diff docs/domains/` shows changes ONLY to the four target files and ONLY in the planned rows. | C-04. Plan-4 plug: domain-map edge closes the MEDIUM gap from the domain-completeness validator. |
| [ ] | T013 | Author `docs/how/split-terminal-view.md` (≤ 1 page). Cover: where the toggle lives; what it does; that it shares the tmux session with the overlay + terminal page (one shell across surfaces); known limitations (L-01 multi-tab geometry, L-02 reset on reload, L-03 first-mount Suspense flash); how to disable (click again); a sentence on why there's no keybinding (overlay reservation). | (docs) | `docs/how/split-terminal-view.md` | File exists; content covers all five bullets; passes Markdownlint if configured. | C-04. |

### Doc-Update Templates (for T012)

Read each target file first to confirm column ordering; the templates below are content guidance, not literal copy-paste — adapt the column order to match each file. The **semantic content** is the contract; the **column order** follows the file.

**T012(a) — `docs/domains/_platform/panel-layout/domain.md`**

- **Contracts table — new row**:
  - Contract: `` `PanelShell.rightPane` ``
  - Type: Prop (optional `ReactNode`)
  - Consumers: `file-browser` (browse-page inline terminal split)
  - Description: Optional slot for content docked to the right of `main`. When present, the desktop branch wraps `left + main` and `rightPane` in a horizontal `ResizablePanelGroup`. Generic — not reserved for terminal use.
- **Composition table — new row**:
  - Component: `ResizablePanelGroup` (from `@/components/ui/resizable`)
  - Role: Wraps `left + main` and `rightPane` in a horizontal split when `rightPane` is set; absent otherwise.
  - Depends on: `ResizablePanel`, `ResizableHandle`, `react-resizable-panels@^4`
- **History — new row**: `| Plan 084 split-terminal-view | Added optional `rightPane` slot to `PanelShellProps`; desktop branch switches to horizontal `ResizablePanelGroup` when set; `data-terminal-overlay-anchor` placement on `main` preserved. | 2026-05-19 |`

**T012(b) — `docs/domains/file-browser/domain.md`**

- **Composition table — new row**:
  - Component: `SplitTerminalToggleButton`
  - Role: Toggles the browse-page inline terminal split; on `false → true` dispatches `overlay:close-all` and flips `splitTerminalEnabled`; click-only (no keybinding).
  - Depends on: `lucide-react` (`PanelRight`), `_platform/events` (`overlay:close-all` dispatch only)
- **History — new row**: `| Plan 084 split-terminal-view | Added `SplitTerminalToggleButton` in `ExplorerPanel.rightActions` on the browse page; conditionally renders `TerminalView` into `PanelShell.rightPane` when toggled on; state is session-only React `useState`. | 2026-05-19 |`

**T012(c) — `docs/domains/terminal/domain.md`**

- **History — new row**: `| Plan 084 split-terminal-view | Added inline consumer surface (`file-browser` browse page) attaching to the shared worktree session via the existing `TerminalView` contract. Added a one-shot `{type:'resync'}` send in `terminal-inner.tsx` after first WS `connected` event (re-armed on reconnect) so tmux refreshes geometry for newly-attached clients regardless of prior attached-client size. | 2026-05-19 |`

**T012(d) — `docs/domains/domain-map.md`**

Add a new mermaid edge inside the `Business Domains` (or equivalent) section. Match the single-line, `·`-separated multi-contract label style used by sibling edges (e.g. `fileBrowser -->|"…"| gitPlatform`):

```mermaid
fileBrowser -->|"TerminalView · cwd · sessionName"| terminal
```

If the file uses `<br/>` separators for multi-contract labels in that block, switch to `<br/>` to match. The edge MUST be placed in the same block as other `fileBrowser →` outgoing edges, in alphabetical-by-target order.

---

## Acceptance Criteria

(Carry forward from spec § Acceptance Criteria.)

- [ ] AC-01 — Default off, browse page DOM unchanged from current behavior on fresh load (T003 verifies no-slot branch parity; T010 verifies in real browser).
- [ ] AC-02 — Toggle button visible in `ExplorerPanel.rightActions` on desktop (T006, T010).
- [ ] AC-03 — Toggle on splits the area below the explorer bar into two columns (T006, T010).
- [ ] AC-04 — Default ratio ≈ ⅔ / ⅓ (T002 `defaultSize` values; T010 tolerance check).
- [ ] AC-05 — Workspace top strip + explorer bar still span full width when split is on (T010 visual; T003 inherits from no-slot parity since the slot is below them).
- [ ] AC-06 — Inner file-tree column still resizes (T010 manual drag of inner handle; out-of-the-box from existing `panel-shell.tsx:70` CSS resize).
- [ ] AC-07 — Outer divider drags and terminal re-fits (T010; existing TerminalInner ResizeObserver handles).
- [ ] AC-08 — Toggle off restores cleanly with no console errors (T006, T009, T010).
- [ ] AC-09 — Mutual exclusion: `overlay:close-all` fires on enable; inline does not subscribe (T004 dispatch; T008 non-subscription; T010 verifies overlay closes).
- [ ] AC-10 — Browse-page-only (T006 + visual check; toggle only rendered on `BrowserClientInner`).
- [ ] AC-11 — Session-only state; reload resets to off (T006 holds state in `useState`; no persistence path exists; T010 reload step).
- [ ] AC-12 — Inline terminal accepts input and shows output (T010 `printf` echo step).
- [ ] AC-13 — Shared tmux session; `resync` keeps geometry sane (T007 resync; T010 navigates to `/terminal` and confirms shared history).
- [ ] AC-14 — Mobile unaffected (`useResponsive` gate in T006; existing `MobilePanelShell` ignores `rightPane`).
- [ ] AC-15 — Other `PanelShell` consumers unaffected (T003 parity; terminal/workflow pages don't pass `rightPane`).
- [ ] AC-16 — 10× toggle cycle clean (T009).
- [ ] AC-17 — `data-terminal-overlay-anchor` placement preserved (T011).

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| R-01 — xterm cleanup ordering on fast toggle (PL-02) | Medium | High | Reuse canonical `TerminalView` verbatim (T006); T009 stress test enforces clean console under 10× cycles. |
| R-02 — tmux smallest-client geometry war (PL-03) | Medium (multi-tab only — L-01) | Medium | T007 explicit `{type:'resync'}` on connect; mutual-exclusion close on enable (T004). Multi-tab edge accepted as L-01. |
| R-03 — Hydration flash on persisted-toggle reload (PL-04) | **CLOSED by C-07** | **N/A** | Resolved by design: toggle state is session-only React `useState` (no SDK setting, no URL param, no localStorage). No SSR/client divergence is possible because the toggle is never persisted. Recorded here so the original risk traces from research to spec to plan are not lost. |
| R-04 — `data-terminal-overlay-anchor` drift | Low | High | T011 assertion test; T002 leaves the attribute untouched. |
| R-05 — Native `resize: horizontal` on inner left column coexisting with outer `ResizablePanelGroup` | Low | Low | Manual smoke during T006; fall-back is migrating inner handle to `ResizableHandle` (deferred). |
| R-06 — Dynamic-import cost of `TerminalInner` on each toggle (L-03) | Certain | Low | Accept; documented as known limitation L-03 in spec. Browser caches the chunk after first load. |
| R-07 — `react-resizable-panels` `ResizablePanelGroup` requires direct flex parent | Low | Low | T002 places the group as a direct child of the wrapper div; verified against `apps/web/src/components/ui/resizable.tsx` shape (which uses `flex h-full w-full`). |
| R-08 — Spec's terminal domain marked `consume`, but T007 modifies `terminal-inner.tsx` | Certain | Low | The change is one additive line + a ref guard. T012 captures this as a History row in `terminal` domain.md. Consider this a "consume + additive enhancement" relationship — not a contract change. |

---

## Constitution / Architecture Gates

| Gate | Status | Notes |
|------|--------|-------|
| Constitution (`docs/project-rules/constitution.md`) | ✅ Pass | Feature is UI-layer only; no dependency-direction inversions; clean architecture intact. |
| Architecture (`docs/project-rules/architecture.md`) | ✅ Pass | All dependencies follow existing domain-map edges (`file-browser → terminal`, `file-browser → _platform/panel-layout`, `file-browser → _platform/events`). No new edges. |
| Domain placement | ✅ Pass | Every new file is inside its owning domain (`041-file-browser/components/`, `_platform/panel-layout/components/`, `064-terminal/components/`). Tests mirror under `test/unit/web/...`. |
| Plan-rules (`docs/project-rules/rules.md`) | ✅ Pass | Simple mode is appropriate for CS-2; task table uses the 7-column format; absolute paths used. |
| Cross-domain edit (`terminal-inner.tsx` from a `file-browser` plan) | ⚠️ Flagged — policy compliant | One additive change to a different domain (T007). See **Cross-Domain Edit Policy** sub-block below. Justified by KF-04 + R-02; captured in T012 History row in `terminal` domain.md. |

### Cross-Domain Edit Policy (T007)

T007 modifies `apps/web/src/features/064-terminal/components/terminal-inner.tsx` from a `file-browser`-led plan. This is a **supported cross-domain surface enhancement** under the following criteria, all of which T007 satisfies:

| Criterion | Status |
|---|---|
| Change is **additive** (no contract break, no signature change) | ✅ Adds a one-shot `{type:'resync'}` send + a `resyncSentRef` guard |
| Change is **≤ ~10 lines** of production code | ✅ ~6–8 lines including the ref + the send + reset on reconnect |
| Change is **idempotent** and benefits all consumers, not just the calling plan | ✅ Every newly-connected `TerminalInner` (terminal page, overlay, inline) benefits; harmless when not needed |
| Change is **captured in the receiving domain's History row** | ✅ T012(c) — `terminal/domain.md` History row "Plan 084 ... + one-shot `resync` on first connect" |
| Change is **covered by a test in the receiving domain's test directory** | ✅ T007's success criteria requires a unit test in the adjacent terminal-inner test file |

**Precedent context (not load-bearing)**: Comparable additive cross-domain enhancements have shipped in this codebase — e.g., the `overlay:close-all` event dispatch added across multiple overlay providers (Plans 064 terminal, 065 activity-log, 067 question-popper, 071 PR view + notes). T007 follows the same shape (additive, idempotent, captured in History). This is provided as context, not as binding precedent; the policy stands on the five criteria in the table above regardless of historical examples.

**Reviewer escalation**: When T007 lands, request review from the `terminal` domain owner (or whichever maintainer most recently touched `terminal-inner.tsx`) in addition to the `file-browser` reviewer. Document the dual sign-off in the PR description so the cross-domain change is explicitly acknowledged by both domains.

**Not** in scope of this policy:
- Contract-breaking changes (must be a domain-owner-led plan with ADR).
- Renames, refactors, or deletions in another domain.
- Adding new exported types or props to another domain's public surface (would require that domain's owner to lead the change).

---

## Validation Checklist (for `/plan-4-complete-the-plan`)

- [x] All tasks have success criteria.
- [x] Domain manifest covers every file touched (production + tests + docs).
- [x] Target domains from spec are all addressed: `_platform/panel-layout` (T001-T003, T011, T012), `file-browser` (T004-T006, T008, T009, T012, T013), `terminal` (T007, T012), `_platform/events` (T004 — dispatch only, no edit).
- [x] Key findings reference affected tasks (KF-01..KF-08 cited inline in task table).
- [x] No time language present — CS-2 only.
- [x] Relative paths used consistently across all 13 tasks (rooted at the repo top, e.g. `apps/web/...`, `test/unit/...`, `harness/tests/...`), matching the convention in sibling plan `multi-folder-tree-plan.md`.
- [x] Risk table aligned with spec § Risks.
- [x] Acceptance criteria 1-to-1 mapped to tasks.

---

## Next Steps

1. ~~`/plan-4-complete-the-plan`~~ — completed 2026-05-19; two MEDIUM violations fixed inline.
2. ~~`validate-v2`~~ — completed 2026-05-19; CRITICAL + HIGH findings fixed inline (see Validation Record below).
3. (Optional) `/plan-5-v2-phase-tasks-and-brief` — not needed in Simple Mode; tasks are already at the 7-column granularity.
4. `/plan-6-v2-implement-phase-companion --plan <this file>` — execute the tasks with the live code-review companion.

---

## Validation Record — 2026-05-19

### Validation Thesis

**Raison d'être**: Deliver a CS-2 implementation path for a one-click inline terminal split toggle on the browse page that respects the existing "one terminal per workspace" mental model and the `data-terminal-overlay-anchor` contract.

**Value claim**: Implementation is cheap (13 tasks, single phase), reviewable (cross-domain edits explicitly flagged), and reversible (session-only state, no persistence to migrate).

**Artifact promise**: A plan-6 implementor reading this document can begin coding without further clarification — file paths real, ACs mapped to tasks, success criteria measurable, cross-domain edit policy stated.

**Intended beneficiaries**: plan-6-companion (implementor); reviewer; downstream domain.md / domain-map.md consumers; future plan authors who may reuse the `rightPane` slot.

**Proof target**: **Implementation** — not Integration (single Simple-mode phase, no contract testing across phases needed) and not Validated Evidence (that's plan-6/7 territory).

**Evidence standard**: Real file paths; 7-column task table with measurable Done-When criteria; AC↔task mapping; key findings cited per task; risks tied to mitigation tasks; cross-domain edit policy explicit with 5-criterion check.

**Thesis source**: `split-terminal-view-spec.md` v1.2.0 § Summary + § Goals + Clarifications C-06 + C-07. Not inferred.

**Thesis verdict**: **Advanced** (after fixes — see issue table below).

**Main thesis risk** *(carried forward, not fully eliminated)*: AC-13's shared-tmux geometry-war resistance is proved end-to-end only by T010 (the harness Playwright spec). If T010 is skipped or deferred during plan-6, the geometry-correctness claim has no runtime evidence. Mitigation: T010 is explicitly listed as covering AC-13 in its Notes column; reviewers should refuse merge if T010 is deferred.

---

| Agent | Lenses Covered | Thesis Axes Covered | Issues (sev × open/fixed) | Verdict |
|-------|---------------|---------------------|---------------------------|---------|
| Coherence + Readiness | Hidden Assumptions, Edge Cases, Evidence Sufficiency, Proof-Level Fit, Concept Documentation | Implementation Readiness | 1 CRITICAL fixed, 1 HIGH fixed, 4 MEDIUM (3 fixed, 1 deferred), 1 LOW open | ✅ after fixes |
| Risk + Thesis + Domain | Domain Boundaries, Hidden Assumptions, Integration & Ripple, Edge Cases, Thesis Alignment, Evidence Sufficiency | Thesis Alignment, Cross-Domain Coordination, Safety to Change | 2 HIGH fixed, 4 MEDIUM (2 fixed, 2 deferred), 1 LOW open | ✅ after fixes |
| Forward-Compatibility + Completeness | Forward-Compatibility, Concept Documentation, Deployment & Ops, Integration & Ripple, Edge Cases | Downstream Usefulness, Implementation Readiness | 1 CRITICAL fixed, 1 HIGH fixed, 3 MEDIUM (3 fixed) | ✅ after fixes |

### Issues Fixed Inline

| # | Sev | Lens | Issue | Resolution |
|---|-----|------|-------|------------|
| V-1 | CRITICAL | Evidence Sufficiency | T010 referenced `harness/cli/scenarios/browse-split-toggle.ts` — the actual harness Playwright tests live at `harness/tests/<group>/<name>.spec.ts`. | Rewrote T010 path to `harness/tests/features/browse-split-toggle.spec.ts` and the invocation command to `pnpm --filter harness exec playwright test …`. Updated Domain Manifest row and Agent Harness Strategy paragraph. |
| V-2 | CRITICAL → resolved as HIGH | Forward-Compatibility (Shape) | T012 domain.md row content was structurally specified but the exact text was missing — implementor would have had to reverse-engineer format. | Added a **Doc-Update Templates** sub-block immediately under the task table with concrete row content for all four target files (Contract row, two Composition rows, three History rows, mermaid edge). |
| V-3 | HIGH | Concept Documentation | Mixed path formats (T001 absolute, others relative) made the table inconsistent and unportable. | Normalized T001 to relative paths matching the rest of the table; updated the Validation Checklist line that previously claimed the mismatch was intentional. |
| V-4 | HIGH | Domain Boundaries | The "Plans 064/065 precedent" framing in the Cross-Domain Edit Policy asserted historical examples without citing specific commits/diffs — risked credibility debt. | Reframed the precedent as "comparable additive cross-domain enhancements have shipped" (context, not load-bearing) and explicitly added a **Reviewer escalation** clause requiring dual `terminal`-domain + `file-browser` sign-off on the T007 PR. |
| V-5 | HIGH | Risk Traceability | R-03 (hydration flash) from the spec was missing from the plan risk table — looked like a known risk had been lost. | Added an R-03 row to the risk table marking it **CLOSED by C-07** with explanation, preserving the trace from research → spec → plan. |
| V-6 | HIGH | Forward-Compatibility (Test Boundary) | T009 (unit, fake WS) and T010 (E2E, real DOM) had unclear coverage overlap — DOM teardown could fall in the gap. | Expanded T010's task body to include an explicit assertion that the inline xterm container is fully unmounted on toggle-off (real-DOM check) — closes the boundary with T009's WS-count check. Updated AC mapping to add AC-08. |
| V-7 | MEDIUM | Forward-Compatibility (Shape) | Domain-map edge format was ambiguous (existing edges use both `·` and `<br/>` separators). | T012 now instructs the implementor to read the target file's surrounding edges and match the local separator style; the template provides the single-line `·` form as the default. |
| V-8 | MEDIUM | Concept Documentation | The new `rightPane` slot was not framed as a public generic primitive — risk of future plans not discovering it. | Added KF-09 stating it's a generic public primitive; T001 success criteria updated to require barrel re-export; T012(a) template adds the Contracts table row that documents this. |
| V-9 | MEDIUM | Evidence Sufficiency | KF-00 (zero new deps) wasn't called out as a key finding — relevant load-bearing context was buried in research. | Added KF-00 "Zero new npm dependencies" referencing the verified `apps/web/package.json` entry. |
| V-10 | MEDIUM | Implementation Readiness | T001 "Done When" was non-measurable from outside ("TypeScript compiles"). | Rewrote to "`pnpm --filter web exec tsc --noEmit` is clean; barrel re-exports `PanelShellProps`; existing consumers still type-check". |

### Issues Deferred (acknowledged, not blocking)

| # | Sev | Issue | Why Deferred |
|---|-----|-------|--------------|
| V-D1 | MEDIUM | T009/T010 test ordering not formalized as a dependency graph. | Task Order Rationale prose already covers this; a Graphviz chart would be over-engineering for a 13-task plan. |
| V-D2 | MEDIUM | "Proof level mismatch — AC-13 geometry proof only via T010 E2E." | Accepted by design. Captured as the **Main thesis risk** in the Validation Thesis above so any plan-6 deferral of T010 surfaces the risk explicitly. |
| V-D3 | MEDIUM | Beneficiary / Non-Goals validation table not added. | The spec's Non-Goals section already enumerates the boundaries; replicating them as a checkbox table in the plan would duplicate without adding signal. Reviewer can verify against the spec directly. |
| V-D4 | LOW | KF-06 cites `browser-client.tsx:1117` — risk of line drift. | Verified at plan-3 time. If the plan goes stale, line numbers can be re-anchored during plan-6 implementation. |
| V-D5 | LOW | `TerminalView` contract stability not pre-validated. | KF-03 + KF-06 already require the implementor to read `terminal-view.tsx` before T006. Adding a separate pre-phase check would be ceremonial. |

### Forward-Compatibility Matrix (post-fix)

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| `plan-6-v2-implement-phase-companion` | Real file paths, ordered tasks, executable success criteria | Contract drift | ✅ | Task table 7-col, normalized to relative paths; success criteria measurable; T010 path corrected. |
| `docs/domains/_platform/panel-layout/domain.md` | Concrete Contract + Composition + History row content | Shape mismatch | ✅ | Doc-Update Templates sub-block §T012(a) provides exact row content. |
| `docs/domains/file-browser/domain.md` | Concrete Composition + History row | Shape mismatch | ✅ | Doc-Update Templates sub-block §T012(b). |
| `docs/domains/terminal/domain.md` | Concrete History row | Contract drift | ✅ | Doc-Update Templates sub-block §T012(c). |
| `docs/domains/domain-map.md` | New edge with locked syntax | Encapsulation lockout / Contract drift | ✅ | Doc-Update Templates sub-block §T012(d) specifies the mermaid edge format and placement. |
| `panel-shell.tsx` implementor | Default sizes 66.66/33.33; preserve anchor; barrel re-export | Shape mismatch | ✅ | T002 spec is precise; T011 assertion test pins anchor placement. |
| `terminal-inner.tsx` implementor | One-shot resync with `resyncSentRef` guard; re-arm on reconnect | Lifecycle ownership | ✅ | T007 success criteria explicit; unit test required. |

**Thesis alignment**: Value claim advanced; proof level Implementation reached; main remaining risk is that T010 must not be deferred during plan-6 because it is the sole runtime evidence for AC-13 (shared-tmux geometry-war resistance).

**Outcome alignment**: *"A user on /workspaces/[slug]/browser can toggle a docked inline terminal on the right ⅓ of the page with a single click from a clearly-discoverable button at the top of the browse area"* — the plan, after fixes, advances this outcome with no unsatisfied downstream consumer.

**Standalone?**: No — at least 7 named consumers exist (plan-6 implementor, 4 domain doc files, 2 source file implementors).

**Overall**: ⚠️ **VALIDATED WITH FIXES**
