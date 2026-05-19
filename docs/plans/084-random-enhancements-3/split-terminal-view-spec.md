# Split Terminal View on Browse Page

**Mode**: Simple
**Spec Version**: 1.2.0
**Created**: 2026-05-19
**Clarified**: 2026-05-19
**Status**: CLARIFIED (ready for `/plan-3-v2-architect`)
**Plan Folder**: `docs/plans/084-random-enhancements-3/`
**Research**: [`split-terminal-view-research.md`](./split-terminal-view-research.md)

📚 This specification incorporates findings from `split-terminal-view-research.md` (five parallel exploration agents covering browse-page anatomy, terminal-overlay reuse, dashboard chrome, splitter primitives, and prior gotchas).

---

## Research Context

Five parallel exploration agents mapped the browse-page DOM tree, the existing terminal surfaces (page + right-edge overlay), the panel-layout primitives, and the splitter / state-persistence patterns already in the codebase. Key takeaways the spec reflects:

- **Zero new dependencies are required.** `react-resizable-panels@^4` is already in `apps/web/package.json` and pre-wrapped at `apps/web/src/components/ui/resizable.tsx`. `TerminalView` is already imported by `browser-client.tsx` for the mobile path — the inline desktop surface reuses the same component contract.
- **Layout fits the existing primitive cleanly.** `PanelShell` (`apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx`) already composes `<explorer-bar full-width> + <left 280px> + <main flex-1>`. Adding an optional `rightPane?` slot is additive (PL-05 precedent) and keeps the top bars naturally full-width.
- **The browse-page top bar already exposes a slot.** `ExplorerPanel.rightActions` (lines 103 / 140 / 537–539) hosts the History and Question Popper buttons today; the new split toggle drops in alongside them.
- **The real risks are xterm + tmux, not layout.** PL-02: xterm cleanup ordering on fast unmount throws in React 19 strict mode. PL-03: tmux clamps geometry to the smallest connected client — sharing one tmux session between the inline column and the right-edge overlay causes "shrunken terminal" UX bugs. Both are addressed by reusing the canonical `TerminalView` lifecycle and giving the inline surface a distinct tmux session.
- **Mutual exclusion is already wired.** Every right-edge overlay (terminal, activity-log, PR view, notes, agent) listens for `overlay:close-all`. Opening the inline split should **fire** that event (to close the right-edge terminal overlay) but **not subscribe** to it (the inline pane is layout, not overlay).
- **Don't relocate `data-terminal-overlay-anchor`.** The right-edge overlay measures the element carrying that attribute to compute its bounding box. Today the attribute lives on the `main` div inside `PanelShell` — moving it to a new outer wrapper would cause the overlay to grow over the inline column.

---

## Summary

Today, viewing code and a shell side-by-side on the browse page requires opening the right-edge terminal overlay (Plan 064), which floats over the file viewer and cannot be docked. This forces users to choose between seeing the code clearly and seeing the terminal clearly.

This feature adds a **persistent inline split** on `/workspaces/[slug]/browser`. Clicking a new toggle button at the top of the browse area divides the content below the workspace top bar and the file-path/explorer bar into two columns:

- **Left ⅔**: the existing browse UI — file tree (still collapsible/resizable), file viewer, banners, mode toggles. Unchanged behavior.
- **Right ⅓**: a `TerminalView`, anchored to the active workspace's worktree, running in its own tmux session.

The divider between the two is draggable; the split toggle is the only way to enter/exit the mode. The split is **browse-page-only** — the terminal page, workflow page, settings, and every other surface remain unchanged. The workspace top bar (AgentTopBar) and the browse-page explorer search bar continue to span the full width above the split.

---

## Goals

- A user on `/workspaces/[slug]/browser` can toggle a docked inline terminal on the right ⅓ of the page with a single click from a clearly-discoverable button at the top of the browse area.
- The same click toggles the split off, restoring the previous full-width browse layout cleanly (no lingering DOM, no console errors, no orphaned WebSocket connections).
- When the split is on, the inner left column (file tree / changes view) remains resizable and behaves exactly as it does today — the user can "contract the menu to give more space" to the viewer column.
- The divider between the left ⅔ and right ⅓ is draggable, with a default 2:1 ratio.
- The workspace top strip (AgentTopBar) and the browse-page explorer bar (file-path search + actions) continue to span the full page width whether the split is on or off.
- The inline terminal is functionally a `TerminalView` — same xterm shell, same keyboard handling, same theming as the existing terminal page and overlay.
- Opening the inline split while the right-edge terminal overlay is open automatically closes the overlay (so users see exactly one terminal at a time on the browse page).
- Other pages — terminal page, workflow page, settings, dashboard home — are not affected by this feature in any observable way (no new top-bar buttons, no layout drift, no shared state).
- The feature works on desktop viewports. Mobile (`MobilePanelShell`) behavior is unchanged.

---

## Non-Goals

- **No support outside the browse page.** No split toggle on terminal, workflow, settings, or any other page. (Confirmed user intent.)
- **No mobile split.** Mobile already has a swipe-strip with a Terminal tab (Plan 064); we do not add a split layout under 768px width.
- **No multi-pane stacking.** v1 is exactly one right-side pane. No "right pane + bottom pane", no vertical splits inside the right pane, no chained splits.
- **No new panel types in the right pane.** v1 hosts `TerminalView` only. (The slot is generic, but no UI is shipped for selecting a different pane content.)
- **No separate tmux session for the inline pane.** The inline `TerminalView` attaches to the **same tmux session as the right-edge overlay and the `/terminal` page** — the user sees one terminal across all three surfaces, with shell history preserved (C-06). The right-edge overlay is auto-closed on inline-open via `overlay:close-all` to avoid the smallest-client geometry war in steady state.
- **No new keyboard shortcut** (v1, click-only). Backtick and `Ctrl+\`` are already claimed by the right-edge overlay. (C-08)
- **No persistence of the toggle state or divider ratio.** Both are session-only React state — they reset on every page reload (C-07). No SDK settings registered for this feature in v1.
- **No URL deep-linking.** The split state is not in the URL.
- **No "keep-mounted-when-hidden" behavior.** Toggling off unmounts the terminal cleanly. (The PL-02 cleanup discipline applies; keeping the terminal alive in the background raises the tmux-client-count surface and is out of scope for v1.)
- **No multi-tab coordination.** If the user opens the same workspace in two tabs with the inline split on in one tab and the overlay open in another, the tmux geometry war will happen (L-01). Documented as a known limitation; out of v1 scope to coordinate across tabs.
- **No new domain.** All work is in existing domains.
- **No changes to the workspace top strip (AgentTopBar) or to the browse-page explorer bar layout** beyond adding one button to `ExplorerPanel.rightActions`.
- **No support for non-git workspaces' inline terminals** beyond what the existing terminal substrate already supports.

---

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|----------------------|
| `file-browser` | existing | **modify** | Browse page owns the toggle state (in-memory React state), the toggle button, and the slot wiring that hands `TerminalView` into `PanelShell.rightPane`. |
| `_platform/panel-layout` | existing | **modify** | `PanelShell` gains an optional `rightPane?: ReactNode` slot. Internal layout switches to a `ResizablePanelGroup` only when `rightPane` is present. `data-terminal-overlay-anchor` stays on the `main` column unchanged. |
| `terminal` | existing | **consume** | `TerminalView` is mounted as the inline pane content, **attached to the same tmux session as the right-edge overlay** (the workspace's worktree session). No changes to terminal-domain code or contracts; one History row added noting the new consumer surface. |
| `_platform/events` | existing | **consume** | Dispatch `overlay:close-all` on inline-open (using the existing global event channel). No changes to the event substrate. |

No new domains. No new edges in `docs/domains/domain-map.md` (every edge already exists). `_platform/sdk` is **not** in scope — the toggle state is session-only (in-memory) and there is no keybinding to register in v1.

### Domain Review

| Domain | Concern | Resolution |
|---|---|---|
| `_platform/panel-layout` | Adding a third slot to `PanelShell` must not change the rendered DOM for consumers that don't pass it (terminal page, workflow page, etc.). | The new `rightPane?` prop is optional; when absent, `PanelShell` renders today's exact tree (verified path: panel-shell.tsx:65-83 unchanged structure for the no-slot case). Unit test covers both branches. |
| `_platform/panel-layout` | `data-terminal-overlay-anchor` placement controls right-edge overlay positioning. If we accidentally move it to the new wrapper, the overlay grows over the inline column. | Keep the attribute exactly where it is (`main` div, panel-shell.tsx:77). The new outer wrapper does not carry the attribute. Codified by an assertion test. |
| `file-browser` | Toggle persistence model has hydration-flash trade-off (PL-04). | **Resolved (C-07)**: session-only React state — no persistence, no hydration concern. Reload resets the toggle to off. |
| `terminal` | The inline `TerminalView` mounts/unmounts on every toggle. Cleanup ordering (PL-02) must hold; otherwise React 19 strict-mode tear-down throws. | Reuse the canonical `TerminalView` and its internal `useTerminalSocket` teardown verbatim (terminal-socket.ts:254-269). Do not bypass with a custom xterm wrapper. Integration test that toggles 10× and asserts a clean console. |
| `terminal` | tmux clamps geometry to the smallest attached client (PL-03). The inline pane shares the same tmux session as the right-edge overlay and the `/terminal` page. | **Resolved (C-06)**: single shared session. Mutual-exclusion (`overlay:close-all` on inline-open) ensures the overlay is closed when inline is on, so only one client is attached on the browse page in steady state. On inline mount and on divider-drag-release we send a `{type:'resync'}` so tmux + xterm re-fit to the current pane width. Known limitation: multi-tab to the same workspace with split on in tab A and overlay open in tab B will hit the geometry war; documented as L-01. |
| `_platform/events` | The inline pane is layout, not overlay. It must not be torn down by other overlays opening. | Dispatch `overlay:close-all` on inline-open; do NOT subscribe. Unit test asserts that opening Activity Log / PR View while the split is on does not close the split. |

---

## Complexity

- **Score**: **CS-2** (small)
- **Breakdown**: S=1, I=0, D=0, N=1, F=1, T=1 → P=4
- **Confidence**: 0.85
- **Assumptions**:
  - `react-resizable-panels` `@^4` continues to behave as it does today (verified at `apps/web/src/components/ui/resizable.tsx`).
  - `TerminalView` remains the canonical xterm wrapper and continues to expose `className`, `sessionName`, `cwd`, `themeOverride`, `isActive`, and `onConnectionChange` as documented in `terminal-view.tsx:13-44`.
  - The right-edge overlay continues to use `overlay:close-all` for mutual exclusion (used by Plans 065 / 067 / 071 / 064).
  - The browse page's outer DOM tree (WorkspaceLayout → WorkspaceAgentChrome → BrowserClient → PanelShell) is stable; no concurrent plan is rearranging it.
  - The user's "menu" that should remain "contractible" refers to the existing 280px left column of PanelShell (file tree / changes view), not the global DashboardSidebar.
- **Dependencies**: None external. All blocking work is internal to this repo and to the domains listed above.
- **Risks**:
  - **R-01**: xterm tear-down ordering on fast unmount (PL-02) — mitigated by reusing `TerminalView` verbatim.
  - **R-02**: tmux geometry war (PL-03) — mitigated by distinct sessions per surface + mutual-exclusion of inline ↔ overlay.
  - **R-03**: hydration flash on first paint (PL-04) — accept or mitigate via URL param mirror; resolved in clarify.
  - **R-04**: `data-terminal-overlay-anchor` accidentally migrated to the new wrapper — mitigated by an assertion test.
  - **R-05**: mixing native CSS `resize: horizontal` on the inner left column (panel-shell.tsx:70) with `react-resizable-panels` on the outer split — likely benign but worth a smoke test.
- **Phases** (provisional, finalized by `/plan-3-v2-architect`):
  1. **PanelShell `rightPane` slot landing** — `_platform/panel-layout`: add optional prop, internal `ResizablePanelGroup` when set, preserve anchor attribute, unit tests (no SDK changes).
  2. **Toggle component + browse-page wiring** — `file-browser`: build `<SplitTerminalToggleButton>` (in-memory state via `useState`), wire `BrowserClient` to hand `<TerminalView>` to the slot with the existing worktree session name, dispatch `overlay:close-all` on enable, send `{type:'resync'}` on mount + divider-drag-release.
  3. **Hardening + docs** — integration test (toggle/resize/teardown × 10 cycle), harness Playwright scenario, domain.md History rows on `_platform/panel-layout`, `file-browser`, and `terminal`, brief `docs/how/split-terminal-view.md`.

---

## Acceptance Criteria

Each criterion is observable from outside the implementation (DOM shape, network behavior, console state, or user-visible action). Each maps to at least one automated test (unit, integration, or harness scenario).

1. **AC-01 — Default off, browse page unchanged.** On a fresh load of `/workspaces/[slug]/browser` with no prior split state, the rendered DOM contains the existing two-column layout (left 280px file column + flex-1 main). No terminal mounts. No `ResizablePanelGroup` is present.
2. **AC-02 — Toggle button visible.** The browse-page top bar (`ExplorerPanel.rightActions` strip) displays a new toggle control distinct from the History and Question Popper indicators. Its accessible label clearly describes the action ("Toggle split terminal" or equivalent).
3. **AC-03 — Toggle on splits the area.** Clicking the toggle while split is off causes the content below the workspace top bar and the explorer bar to render as a two-column horizontal split. The left column contains the existing browse UI; the right column hosts a `TerminalView`.
4. **AC-04 — Default ratio is ⅔ / ⅓.** On first activation (no remembered ratio), the left:right ratio is approximately 66.66 : 33.33. Tolerance: ±1% measured on the rendered widths.
5. **AC-05 — Top bars span the full width.** Both the workspace top strip (AgentTopBar) and the browse-page explorer bar continue to span the full width of the workspace content area while the split is on (not clipped to the left ⅔).
6. **AC-06 — Inner file-tree column still resizes.** With the split on, the left column inside the left ⅔ (the existing 280px file-tree column) remains user-resizable using its existing handle.
7. **AC-07 — Outer divider drags.** With the split on, the user can drag the divider between the left ⅔ and right ⅓ horizontally. Releasing the drag commits the new ratio. The terminal re-fits cleanly (no console errors).
8. **AC-08 — Toggle off restores.** Clicking the toggle again removes the right column. The browse UI returns to its pre-split layout. The previously-mounted `TerminalView` unmounts cleanly: no console errors, no leftover WebSocket frames, no orphaned ResizeObserver.
9. **AC-09 — Mutual exclusion with right-edge overlay.** Opening the inline split with the right-edge terminal overlay open causes the overlay to close (via `overlay:close-all`). Opening the inline split with Activity Log / PR View / Notes overlays open also closes those overlays. Opening one of those overlays while the inline split is on does NOT close the inline split.
10. **AC-10 — Browse-page-only.** The toggle button does not appear on `/workspaces/[slug]/terminal`, `/workspaces/[slug]/workflows/*`, `/settings`, the dashboard home, or any other route. Toggling split on while on a non-browse page is not possible.
11. **AC-11 — Toggle state is session-only.** The toggle resets to off on every page reload. There is no SDK setting persisting it. Navigating away from `/browser` and back loses the state (this is intentional, C-07).
12. **AC-12 — Inline terminal is functional.** Once mounted, the inline `TerminalView` accepts keyboard input, renders shell output, supports copy/paste with the existing shortcuts, and reconnects on transient WebSocket loss using the existing `useTerminalSocket` exponential backoff.
13. **AC-13 — Shared session, no geometry war in steady state.** The inline pane attaches to the same tmux session name as the right-edge overlay and the `/terminal` page. On inline-open, `overlay:close-all` fires and the right-edge overlay closes — so in steady state only one client is attached. The inline pane sends `{type:'resync'}` on mount and on divider-drag-release; xterm refits cleanly, and the shell shows the existing history (continuous from prior overlay or page session).
14. **AC-14 — Mobile unaffected.** On viewports < 768px, the existing `MobilePanelShell` swipe-strip behavior is unchanged. The toggle button is hidden on mobile.
15. **AC-15 — No regression on other PanelShell consumers.** The terminal page, workflow page, and any other `PanelShell` consumer renders identical DOM before and after this feature lands (verified by snapshot or structural assertion).
16. **AC-16 — Repeated toggling is clean.** Toggling the split on/off 10 consecutive times leaves the browser in a clean state: no console errors, no DOM leaks (verified via memory-usage or observer-count assertion), no leftover WebSocket connections (verified via dev-tools or sidecar log).
17. **AC-17 — Anchor attribute preserved.** `data-terminal-overlay-anchor` remains on the `main` slot of `PanelShell` in both split-on and split-off states. The right-edge terminal overlay, when mounted on the browse page with the split off, continues to size to the file-viewer column as it does today.

---

## Risks & Assumptions

### Risks

- **R-01 — xterm tear-down ordering (carried from PL-02).** Likelihood: medium (only manifests in strict mode + fast toggling). Impact: high (console errors, possible orphaned tmux clients). Mitigation: reuse canonical `TerminalView`; add integration test that toggles 10× and asserts a clean console.
- **R-02 — tmux smallest-client geometry war (carried from PL-03).** Likelihood: medium (only when overlay + inline coexist briefly). Impact: medium (visual squashing). Mitigation: distinct sessions + mutual-exclusion auto-close of the right-edge overlay on inline-open.
- **R-03 — Hydration flash on reload when split is persisted client-side (carried from PL-04).** Likelihood: low-medium. Impact: cosmetic (one-frame layout shift). Mitigation: accept or mirror to URL param; decision in clarify.
- **R-04 — Anchor-attribute drift.** Likelihood: low (we don't intend to move it). Impact: high (overlay positioning bug). Mitigation: assertion test on the DOM, plus a comment at panel-shell.tsx:77 documenting why it lives there.
- **R-05 — Native `resize: horizontal` on the inner left column coexisting with `ResizablePanelGroup` on the outer split.** Likelihood: low. Impact: low. Mitigation: manual smoke test; fall-back option is to migrate the inner handle to `ResizableHandle` (deferred from v1).
- **R-06 — Performance: dynamic-import of `TerminalInner` on every toggle.** Likelihood: certain. Impact: low (one network round-trip the first time per session; cached thereafter). Mitigation: accept v1; consider keep-mounted optimization in a follow-up if user feedback flags it.
- **R-07 — SDK setting unavailable in offline / fresh-workspace scenarios.** Likelihood: low. Impact: low (toggle falls back to its default value). Mitigation: `useSDKSetting` already tolerates missing entries; defaults are explicit in the contribution.

### Assumptions

- The user-described "menu" inside the browse area maps to the existing 280px left column of `PanelShell` (file tree / changes view), not the global DashboardSidebar. The global sidebar's collapse behavior is out of scope.
- "Explorer bar at the top continues to go across the whole page" refers to both the workspace top strip (AgentTopBar) and the browse-page explorer bar (file-path search + actions row). Both already do span the full width above the proposed split row by virtue of the existing DOM nesting.
- The user expects the split to be remembered across reloads within the same workspace (otherwise the toggle would feel ephemeral and surprising). If this is wrong, see Open Questions.
- Drag-to-resize is desirable (not just a fixed ratio). If the user actually wants only a fixed ⅔/⅓ snap, the divider can be made a non-draggable separator — clarify.
- The inline terminal connects to the active worktree's `cwd` (same as the right-edge overlay does today). No separate cwd picker is shown inline.
- React 19 strict mode is the production behavior we target (consistent with the rest of the app).

---

## Open Questions

All open questions resolved in the 2026-05-19 clarification session — see `## Clarifications` below.

## Known Limitations

| # | Limitation | Why It's Accepted in v1 |
|---|---|---|
| L-01 | **Multi-tab tmux geometry war**: If the same workspace is open in two browser tabs with the inline split on in tab A and the right-edge terminal overlay open in tab B, both attach to the same tmux session. tmux clamps geometry to the smaller pane (inline ⅓), so the overlay in tab B renders crushed until one disconnects. | Multi-tab is exotic. Mutual-exclusion (`overlay:close-all`) handles the common single-tab case. Cross-tab coordination is out of scope. |
| L-02 | **Toggle resets on reload**: The split state is session-only React state by design (C-07). A user who reloads the browse page mid-flow has to re-click the toggle to restore the split. | Simplest implementation; avoids hydration flash (PL-04); aligns with "as simple as resizing the terminal" mental model. Persistence can be added in a follow-up if user feedback asks for it. |
| L-03 | **One-frame layout shift on toggle**: Mounting `TerminalView` includes a Suspense fallback while `TerminalInner` is dynamically imported (first time per session only). The right ⅓ briefly shows the suspense skeleton before xterm paints. | Acceptable v1 cost; aligns with terminal-page and overlay behavior on first mount. |

---

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Inline-vs-overlay terminal session strategy | Integration Pattern | tmux geometry behavior is subtle (PL-03); the v1 choice affects future "multi-terminal" plans. Worth a 20-min design exploration if Q-02 turns out to be contentious. | Distinct sessions, shared session + resync, or a per-surface "session picker"? How is the inline pane's session name derived (branch-based, workspace-based, ephemeral)? Does the inline session persist across browser refreshes (tmux state survives by definition)? |
| Persistence model trade-off (SDK vs URL vs session) | Integration Pattern | Hydration-flash UX vs. URL hygiene is a recurring decision across this codebase (Plan 041 hit it). Worth a short workshop only if Q-01 is contested. | SDK setting + tolerated flash, URL param mirror, or both? Where does the divider ratio live? Is per-workspace the right scope or should it be per-worktree? |

Both are **optional** — the defaults in Open Questions are reasonable, and `/plan-2-v2-clarify` should be able to lock them without a full workshop. List them here so the user can call `/plan-2c-v2-workshop` if either turns into a discussion.

---

## Testing Strategy

**Approach**: **Hybrid** — TDD-style for the load-bearing units (PanelShell slot behavior + xterm/WebSocket cleanup discipline); lightweight assertion-style tests for the toggle button, SDK setting registration, and DOM-shape regression.

**Rationale**: The two failure modes that bite us (R-01 xterm tear-down, R-02 tmux geometry) are catastrophic-but-rare. They warrant tests written first so the patterns are pinned. Everything else (toggle wiring, DOM shape, mutual-exclusion event dispatch) is a thin shell where lightweight assertions catch regressions without slowing iteration.

**Focus Areas (TDD-style)**:
- `PanelShell` with and without `rightPane` — DOM-shape parity for the no-slot branch; presence + sizing for the slot branch; `data-terminal-overlay-anchor` placement assertion (AC-17).
- Inline `TerminalView` mount/unmount cycle — toggle 10× and assert no console errors, no orphaned `ResizeObserver`s, no leftover open WebSockets (AC-16). Reuse `test/fakes/fake-pty.ts` + `fake-tmux-executor.ts`.
- `<SplitTerminalToggleButton>` — clicking toggles state, dispatches `overlay:close-all`, persists to SDK setting (AC-09).
- Mutual-exclusion non-subscription — opening Activity Log / PR View / Notes while inline split is on does NOT close the split.

**Focus Areas (lightweight)**:
- SDK contribution registration — settings appear in the store with correct defaults and clamps.
- Browse-page wiring — toggle is visible on `/browser`, hidden on `/terminal`, `/workflows/*`, etc. (AC-10).
- Mobile path snapshot — `MobilePanelShell` unchanged (AC-14).

**Excluded**:
- Cross-browser parity testing (we target the same browsers as the rest of the app).
- Visual regression / screenshot tests (out of scope; harness Playwright run is the visual check).
- Performance benchmarks beyond AC-16 sanity (toggle latency, FPS during drag — only investigated if AC-07 fails).

### Mock Usage

**Policy**: **Targeted mocks** — mock only the WebSocket / tmux sidecar via the existing fakes (`test/fakes/fake-pty.ts`, `test/fakes/fake-tmux-executor.ts`). Use real React DOM, real `useSDKSetting` (or its store-level fake if Plan 081 introduced one), real `ResizablePanelGroup`. This matches the Plan 064 testing precedent and keeps the tests genuinely exercising the cleanup paths that R-01 mitigates.

## Documentation Strategy

**Approach**: **Hybrid** — domain.md History rows for the three affected domains, plus a brief `docs/how/split-terminal-view.md` user-facing note.

**Locations**:
- `docs/domains/_platform/panel-layout/domain.md` — new Contract row for `PanelShell.rightPane`; History row noting Plan 084 split-terminal-view added the optional slot.
- `docs/domains/file-browser/domain.md` — History row for the new toggle + SDK settings (`fileBrowser.splitTerminalEnabled`, `fileBrowser.splitTerminalRatio`); add the new component to the Composition table.
- `docs/domains/terminal/domain.md` — History row noting the new consumer (`file-browser` inline mount via `TerminalView`); add the inline surface alongside the page + overlay rows in the "History" or a new "Surfaces" entry.
- `docs/how/split-terminal-view.md` — short user-facing note: where the toggle lives, what it does, how it interacts with the right-edge overlay, how to identify the inline tmux session, known limitations.

**Excluded**: No screenshots in v1 (the toggle is self-evident); no troubleshooting flow chart; no API reference for `PanelShell.rightPane` beyond the domain.md contract row.

## References

- Research: [`split-terminal-view-research.md`](./split-terminal-view-research.md)
- Terminal domain: [`docs/domains/terminal/domain.md`](../../domains/terminal/domain.md)
- File-browser domain: [`docs/domains/file-browser/domain.md`](../../domains/file-browser/domain.md)
- Panel-layout primitive: `apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx`
- Existing resizable wrapper: `apps/web/src/components/ui/resizable.tsx`
- Browse page entry: `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`
- TerminalView contract: `apps/web/src/features/064-terminal/components/terminal-view.tsx:13-44`
- Overlay event channel: `overlay:close-all` (consumed by Plans 064 / 065 / 067 / 071)

---

**Next**: `/plan-3-v2-architect` once all clarifications are recorded below.

---

## Clarifications

### Session 2026-05-19

**C-01 — Workflow Mode**: **Simple**.
- Rationale: spec is CS-2 (small); 3 narrow provisional phases; single domain modify (`_platform/panel-layout`) + one domain consume + one domain wire-up (`file-browser`). Plan-4 / plan-5 dossiers remain optional; inline tasks per phase.

**C-02 — Testing Strategy**: **Hybrid**.
- TDD-style for `PanelShell` slot, xterm/WebSocket cleanup discipline (R-01 mitigation), and mutual-exclusion behavior.
- Lightweight for toggle wiring, SDK contribution registration, mobile snapshot.
- Recorded in new `## Testing Strategy` section.

**C-03 — Mock Usage**: **Targeted mocks**.
- Mock only WebSocket / tmux sidecar via existing `test/fakes/fake-pty.ts` and `fake-tmux-executor.ts`.
- Real React DOM, real `useSDKSetting`, real `ResizablePanelGroup`.
- Matches Plan 064 testing precedent. Recorded in `## Testing Strategy → Mock Usage`.

**C-04 — Documentation Strategy**: **Hybrid** — domain.md History rows + a short `docs/how/split-terminal-view.md` note.
- Three domain.md updates (`_platform/panel-layout`, `file-browser`, `terminal`).
- Brief how/ note covering toggle location, mutual-exclusion behavior, shared-session strategy, known limitations.
- Recorded in new `## Documentation Strategy` section.

**C-05 — Domain Review**: Confirmed as-is.
- `_platform/panel-layout` `modify` (additive optional slot), `file-browser` `modify` (toggle + slot wiring), `terminal` `consume` (TerminalView), `_platform/events` `consume` (`overlay:close-all`). No new domains. No new domain-map edges. **`_platform/sdk` is no longer in scope** — see C-07 / C-08.

**C-06 — Session Strategy (Q-02)**: **Single shared tmux session across all three terminal surfaces** (right-edge overlay, `/terminal` page, inline split).
- Rationale (user): "It will be same terminal just resize it... I figured this was as simple as taking the terminal I have and making it smaller." The user's mental model — and the right one — is that the workspace has *one* terminal that follows them between surfaces, preserving shell history. Distinct sessions were a tmux-defensive workaround for an exotic multi-tab case.
- Mitigation for PL-03 (tmux smallest-client geometry):
  1. On inline-open: dispatch `overlay:close-all` → right-edge overlay closes → only one client attached.
  2. On inline mount and on divider-drag-release: send `{type:'resync'}` over the WebSocket → tmux refreshes window dimensions to the current pane → xterm fit-addon recomputes.
  3. Accept the multi-tab edge case as known limitation L-01.
- Spec updates: revised AC-13, Non-Goals, Target Domains Review, Phases (Phase 3 hardening now includes resync wiring instead of distinct-session strategy).

**C-07 — Persistence Model (Q-01)**: **Session-only React state**.
- Toggle and divider ratio held in `useState` inside `BrowserClientInner`. No SDK setting registration; no URL mirror; no localStorage.
- Reload resets the toggle to off. The default divider ratio (33.33) is the always-on initial value when the user toggles on.
- Rationale: aligns with the "same terminal, just smaller" mental model — the user is asking for a transient layout affordance, not a remembered preference. Also sidesteps PL-04 hydration flash entirely.
- Spec updates: AC-11 rewritten (was "per-workspace state"), Non-Goals updated, Target Domains no longer lists `_platform/sdk` as a consumer, Phase 2 no longer includes SDK contribution.

**C-08 — Low-Impact Defaults Accepted (Q-03/Q-04/Q-05/Q-06)**:
- **Q-03 ratio memory**: superseded by C-07 — ratio is session-only React state; `ResizablePanelGroup` owns it internally between mount and unmount. Default `33.33` on every mount.
- **Q-04 keyboard shortcut**: click-only in v1. No new SDK keybinding registration. Backtick and `Ctrl+\`` remain reserved by the right-edge overlay.
- **Q-05 mutual-exclusion scope**: fire `overlay:close-all` (closes all five right-edge overlays uniformly on inline-open).
- **Q-06 toggle icon**: `PanelRight` from `lucide-react` (consistent with similar dock-affordance icons elsewhere in the app).
