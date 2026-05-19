# Split Terminal View

A persistent inline split on the browse page (`/workspaces/[slug]/browser`) that docks a `TerminalView` to the right ⅓ of the content area below the workspace top strip and explorer bar.

## Where the toggle lives

The toggle is a `<PanelRight>` icon button in **ExplorerPanel.rightActions** on the browse page top bar — alongside the History (recent changes feed) button and the Question Popper indicator. Its accessible label is `Toggle inline terminal` and it carries `role="switch"` so screen readers announce on/off state correctly.

The toggle is **browse-page only** — it does not appear on `/terminal`, `/workflows/*`, `/settings`, the dashboard home, or any other route.

## What it does

Toggling on:

- Splits the content area below the explorer bar into a horizontal `ResizablePanelGroup` with two panels: left ⅔ (existing browse UI — file tree column + main viewer) and right ⅓ (a `TerminalView`).
- Dispatches `overlay:close-all` before the state flip. This closes any open right-edge overlay (terminal, activity-log, PR view, notes, agent), so only one terminal client is attached to the shared tmux session in steady state.
- Sends `{type:'resync'}` once on first WS connect so tmux refreshes window dimensions to the newly-attached client's pane (Plan-064 / PL-03 mitigation).

Toggling off:

- Cleanly unmounts the inline `TerminalView` (xterm canvas + WS connection torn down).
- Layout returns to the pre-split single-column shape.

The outer divider is draggable; the inner left-column native CSS resize handle is preserved so the file tree column remains independently resizable inside the left ⅔.

## Shared tmux session across surfaces

The inline `TerminalView` attaches to the **same tmux session** as the right-edge terminal overlay and the `/terminal` page. You'll see continuous shell history regardless of which surface you opened the terminal from — open the inline split, run `cd src && ls`, toggle off, click the right-edge overlay button, and the overlay shows the same shell with `cd src && ls` already in scrollback.

When no session is selected via `?session=` URL param, the inline pane falls back to the worktree-folder basename. The sidecar runs `tmux new-session -A -s <name>` on first connect — creating the session if absent, attaching if present.

## Known limitations

| # | Limitation | Why |
|---|---|---|
| L-01 | **Multi-tab tmux geometry war** — if the same workspace is open in tab A (inline split) and tab B (overlay), tmux clamps geometry to the smaller pane (inline ⅓). The overlay in tab B may render crushed until one disconnects. | Cross-tab coordination is out of scope. The single-tab case is handled by mutual-exclusion (`overlay:close-all`). |
| L-02 | **Toggle resets on reload** — state is session-only React `useState`. A user who reloads the browse page mid-flow has to re-click. | Aligns with the "same terminal, just smaller" mental model. Avoids hydration flash (Plan-041 / PL-04). Persistence can be added in a follow-up. |
| L-03 | **One-frame layout shift on toggle** — first activation per session shows a Suspense skeleton while `TerminalInner` is dynamically imported. | Same first-mount cost as the terminal page + right-edge overlay. Cached after first load. |

## How to disable

Click the toggle again. The right pane unmounts, the layout returns to single-column.

## Why there's no keybinding (v1)

The backtick (`` ` ``) and `Ctrl+\`` shortcuts are already claimed by the right-edge terminal overlay (Plan 064 / Plan 081). Reusing them would create ambiguity — does the user mean "show inline" or "show overlay"? In v1 the inline split is click-only, and the overlay keeps its keybindings.

## References

- Plan: [`docs/plans/084-random-enhancements-3/split-terminal-view-plan.md`](../plans/084-random-enhancements-3/split-terminal-view-plan.md)
- Spec: [`docs/plans/084-random-enhancements-3/split-terminal-view-spec.md`](../plans/084-random-enhancements-3/split-terminal-view-spec.md)
- Terminal domain: [`docs/domains/terminal/domain.md`](../domains/terminal/domain.md)
- File-browser domain: [`docs/domains/file-browser/domain.md`](../domains/file-browser/domain.md)
- Panel-layout domain: [`docs/domains/_platform/panel-layout/domain.md`](../domains/_platform/panel-layout/domain.md)
