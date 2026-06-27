# Split Terminal View

A two-mode terminal UX on the browse page (`/workspaces/[slug]/browser`):

- **Mode A** — the original: file viewer fills the main slot, the floating right-edge terminal overlay drives terminal-visible / terminal-hidden via backtick. The viewer and the float share the same main slot conceptually.
- **Mode B** — the inline split: file viewer ⅔ + terminal ⅓ side-by-side, with a draggable divider.

Behind both modes is **one xterm** (FX012). The floating overlay, the inline split's right ⅓, and the `/terminal` page are all viewports onto the same singleton xterm DOM node. Scrollback persists across every transition; tmux only ever sees one client per browser tab.

## Where the toggle lives

The Mode A↔B toggle is a `<PanelRight>` icon button in **ExplorerPanel.rightActions** on the browse page top bar — alongside History and the Question Popper indicator. Its accessible label is `Toggle inline terminal` and it carries `role="switch"`.

The toggle is **browse-page only** — it does not appear on `/terminal`, `/workflows/*`, `/settings`, the dashboard home, or any other route.

## State machine

| From | Action | To | Side effect |
|------|--------|----|-------------|
| A (float closed) | backtick | A (float open) | overlay provider's bubble-phase listener fires `toggleTerminal` |
| A (float open) | backtick | A (float closed) | overlay provider's bubble-phase listener closes the float |
| A (any) | split-toggle | B | `BrowserClient.handleSplitToggleChange` calls `overlay.closeTerminal()` then `setSplitOn(true)` |
| B | backtick | A (float open) | `BrowserClient`'s capture-phase listener intercepts `terminal:toggle` (preempts the overlay provider via `stopImmediatePropagation`), sets `splitOn=false`, calls `overlay.openTerminal(...)` |
| B | split-toggle | A (float open) | `setSplitOn(false)` then `overlay.openTerminal(...)` |
| B | `overlay:close-all` dispatched | B (unchanged) | the inline-3rd viewport is **layout, not overlay** — it does NOT subscribe to `overlay:close-all`, so opening a sibling overlay (activity log, notes, PR view, etc.) does NOT close the split |
| A (any) | `overlay:close-all` dispatched | A (float closed) | float closes via the existing `TerminalOverlayProvider` listener (unchanged behavior) |

Workspace navigation (`/browser` ↔ `/terminal` within the same workspace) does NOT preserve `splitOn` (BrowserClient page remounts so its `useState` resets). But the **singleton xterm** survives — scrollback persists — so the user returns to Mode A; clicking the split-toggle again restores Mode B with the full prior scrollback intact. Cross-workspace nav (slug change) tears the singleton down and reconnects WS to the new workspace.

## Same xterm everywhere

The workspace `[slug]` layout mounts a `TerminalSingletonProvider` that owns exactly one `TerminalInner` instance. Three surfaces consume it via `<TerminalViewport id="..." active={...} />`:

| Surface | Viewport id | When `active` |
|---------|-------------|---------------|
| Floating overlay (Mode A) | `overlay` | `useTerminalOverlay().isOpen` |
| Inline split (Mode B) | `inline-3rd` | `splitOn` |
| `/terminal` page main panel | `terminal-page` | `selectedSession != null` |

When a viewport becomes active, the singleton's `useLayoutEffect` does an `appendChild` to move the xterm DOM node into that viewport's slot. When it deactivates, the node returns to the offscreen park (`[data-terminal-park]`) — still mounted, WebSocket still alive, scrollback intact.

The singleton is **lazy-mount**: `TerminalInner` doesn't mount (and the WS doesn't connect) until the first viewport activates. Workspaces the user never opens a terminal on stay disconnected.

Mobile (`MobilePanelShell`) is single-surface and keeps its own `<TerminalView>` — no singleton sharing. The workspace ends up with at most two `TerminalInner` instances total app-wide (one for mobile, one for the desktop singleton), and they're never simultaneously on screen because mobile-vs-desktop is a responsive switch.

## Why backtick in Mode B uses capture-phase

`BrowserClient` registers a capture-phase listener on `window.addEventListener('terminal:toggle', handler, { capture: true })` that fires before the `TerminalOverlayProvider`'s bubble-phase listener and calls `stopImmediatePropagation()`. The capture-phase + immediate-stop pattern preempts the bubble-phase listener regardless of registration order, so we don't have to worry about the order in which providers mount.

When `splitOn` is `false`, the capture-phase listener is **not registered at all** (early-bail in the `useEffect`). That means backtick in Mode A passes straight through to the overlay provider — its today-behavior is fully preserved.

## Known limitations

| # | Limitation | Why |
|---|---|---|
| L-01 | **Multi-tab tmux geometry war** — if the same workspace is open in tab A and tab B, tmux clamps geometry to the smaller pane. | Cross-tab coordination is out of scope. The single-tab case is fully solved by the singleton: tmux sees exactly one client per tab. |
| L-02 | **`splitOn` resets on reload** — state is session-only React `useState`. | Aligns with the "same terminal, just different mode" mental model. The singleton xterm scrollback DOES survive workspace nav within the tab. |
| L-03 | **First-mount cost** — first activation per session shows a Suspense skeleton while `TerminalInner` is dynamically imported. | Same one-time cost as before; subsequent transitions are free DOM moves. |

## References

- FX012 dossier: [`docs/plans/084-random-enhancements-3/fixes/FX012-single-xterm-singleton.md`](../plans/084-random-enhancements-3/fixes/FX012-single-xterm-singleton.md)
- Plan: [`docs/plans/084-random-enhancements-3/split-terminal-view-plan.md`](../plans/084-random-enhancements-3/split-terminal-view-plan.md)
- Spec: [`docs/plans/084-random-enhancements-3/split-terminal-view-spec.md`](../plans/084-random-enhancements-3/split-terminal-view-spec.md)
- Terminal domain: [`docs/domains/terminal/domain.md`](../domains/terminal/domain.md)
- File-browser domain: [`docs/domains/file-browser/domain.md`](../domains/file-browser/domain.md)
- Panel-layout domain: [`docs/domains/_platform/panel-layout/domain.md`](../domains/_platform/panel-layout/domain.md)
- Harness spec: [`harness/tests/features/single-xterm-state-machine.spec.ts`](../../harness/tests/features/single-xterm-state-machine.spec.ts)
