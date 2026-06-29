# Workshop: Content-Area Mode Mechanics

**Type**: Integration Pattern
**Plan**: 088-remote-app-view
**Spec**: [remote-app-view-spec.md](../remote-app-view-spec.md)
**Created**: 2026-06-13
**Status**: Approved

**Value Thesis**: Resolves *where* remote view enters the UI — the highest-collision-risk decision in the plan (in-flight Plans 085/087 touch the viewer area). Pins the exact files, params, and composition rules so the architect can phase the UI work without rediscovering the layout system, and so reviewers can check the change against a named precedent.
**Target Proof Level**: Contract Ready
**Current Proof Level**: Contract Ready

**Selected Value Axes**:
- **Safety to Change**: the chosen seam avoids FileViewerPanel and PanelShell entirely, dodging Plans 085/087 merge collisions.
- **Implementation Readiness**: every decision names the exact file/line precedent to copy.
- **Cross-Domain Coordination**: clarifies which domain actually gets modified (refines the spec's `_platform/panel-layout: modify` row).

**Related Documents**:
- [002-session-reattach-state-machine.md](./002-session-reattach-state-machine.md) — what the `rv` param points at
- [003-stream-ws-protocol.md](./003-stream-ws-protocol.md) — input capture semantics referenced by § Focus & keyboard
- Research dossier Critical 02 (remote view is not a ViewerMode)

**Domain Context**:
- **Primary Domain**: remote-view (new)
- **Related Domains**: `_platform/panel-layout` (consume — see Finding 1, no modify needed), `_platform/workspace-url` (consume), `041-file-browser` (one-line additive param change)

---

## Purpose

Decide where the `{file-viewer | remote-view}` content-area switch lives, what URL shape drives it, what restores on switch-back, and how the picker opens — grounded in the codebase's existing precedent for exactly this kind of switch.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Contract Ready** with no additional context. They should be able to:

- Name the three files that change to introduce the mode (and the ones that explicitly must NOT change).
- Write the URL for any remote-view state (picker, attached session, deep link) by hand.
- Predict what the user sees when they click a file while a stream is live, or refresh mid-stream.

## Key Questions Addressed

- Where does the mode live (URL param shape)?
- What restores on switch-back?
- How does the picker open?
- How do terminal-over and terminal-beside compose with the new mode?

---

## Finding 1 (changes the spec's assumption): the switch already exists

The spec anticipated a "small additive change to `_platform/panel-layout`". Code reading found the repo **already has a content-area mode switch** with one non-file mode in production:

```ts
// apps/web/src/features/041-file-browser/params/file-browser.params.ts:29
/** Main-panel view selector. `null` = default (file/dir-driven); `'recent-feed'` swaps in the Recent Changes Feed. */
view: parseAsStringLiteral(['recent-feed'] as const),
```

The dispatch site is the browser page composition, not PanelShell:

- `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:95` — `RecentFeedView` is `dynamic()`-imported (lazy; the bundle-guard pattern AC-13 needs).
- `browser-client.tsx:226` — `const view = params.view; // 'recent-feed' | null` drives which component fills PanelShell's `main` slot.
- `browser-client.tsx:721` — selecting a file sets `{ view: null }`, swapping back to the file viewer **without touching `file`/`dir`/`mode`**, so file state restores for free.
- PanelShell (`_platform/panel-layout/components/panel-shell.tsx:88`) keeps `data-terminal-overlay-anchor` on the `main` slot wrapper — anything rendered in `main` inherits terminal-over and terminal-beside unchanged.

**Consequence for the architect**: the spec's Target Domains row `_platform/panel-layout: modify` softens to **consume** — PanelShell needs no changes. The modify lands in `browser-client.tsx` (page composition) plus a one-line literal extension in `file-browser.params.ts`.

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| A: Extend `view` literal | `view: ['recent-feed', 'remote']`; remote-view rides the existing main-panel selector | Proven precedent (recent-feed); file params untouched → free restore; one-line change to 041 | One-line edit inside Plan-041-owned params file | **Selected** |
| B: New top-level param (`content=remote`) | Parallel param, 041 untouched | Zero edits to 041 files | Two selectors fight over the same slot (`view=recent-feed&content=remote` is ambiguous); invents a second convention for the same concept | Rejected |
| C: Fifth ViewerMode | Add `'remote'` to FileViewerPanel's `mode` | Reuses mode buttons | File/MIME-coupled (Critical 02); collides with Plans 085/087; remote view is not a file | Rejected (already by spec) |
| D: Modify PanelShell with a mode prop | Switch inside `_platform/panel-layout` | "Platform-y" home | Unnecessary — `main` is already a generic slot; would touch shared layout code for no gain | Rejected |

## URL Contract

```
# Picker (list windows, no session yet)
/workspaces/<slug>/browser?worktree=<path>&view=remote

# Attached session (deep-linkable; refresh restores — AC-6, AC-8)
/workspaces/<slug>/browser?worktree=<path>&view=remote&rv=<sessionId>

# File state survives underneath (switch-back = drop view+rv, file params still present)
/workspaces/<slug>/browser?worktree=<path>&view=remote&rv=ses_ab12&file=src/main.gd&mode=source
```

| Param | Owner | Parser | Semantics |
|---|---|---|---|
| `view` | 041 params file (literal extended by 088) | `parseAsStringLiteral(['recent-feed', 'remote'])` | `'remote'` swaps RemoteViewPanel into the `main` slot |
| `rv` | 088 (`features/088-remote-view/params/remote-view.params.ts`, composed into the page cache) | `parseAsString` | Session id. `null` ⇒ picker; set ⇒ viewport attaches to that session |

Rules:

1. `rv` without `view=remote` is inert (ignored, cleaned up lazily). `view=remote` without `rv` is the picker.
2. Both writes use `{ history: 'replace' }` except the initial user-initiated attach, which pushes (so Back leaves the stream).
3. Worktree scoping comes from the existing `workspaceParams` composition — no new work.

## Composition & Switch-Back Rules

```
PanelShell
├── explorer  (unchanged)
├── left      (file tree — unchanged, stays visible during remote view, like recent-feed)
├── main [data-terminal-overlay-anchor]
│     └── view === 'remote'      → <RemoteViewPanel/>   (dynamic import, NEW)
│         view === 'recent-feed' → <RecentFeedView/>    (unchanged)
│         else                   → <FileViewerPanel/>   (unchanged — Plans 085/087 own this)
└── rightPane (terminal-beside — unchanged)
```

- **Terminal-over / terminal-beside**: zero work. The overlay anchors to the `main` wrapper (above the switch); `rightPane` is a sibling. AC-5 is satisfied by construction; the browser smoke still proves it.
- **Switch-back restore (AC-5)**: selecting a file in the tree runs the existing `handleFileSelect`, which already dispatches `overlay:close-all` and sets `{ view: null }` (`browser-client.tsx:714-721`). Extend that same write to `{ view: null, rv: null }`. File viewer remounts and restores entirely from the untouched `file`/`mode`/`dir`/`line` params. **The stream session is NOT torn down** — it goes `unwatched` on the daemon (see Workshop 002) so the user can flip back cheaply.
- **Unmount semantics**: FileViewerPanel unmounts while remote view is active (recent-feed precedent). RemoteViewPanel likewise unmounts on switch-back; its WS closes; reattach is by `rv` session id.
- **Mobile**: out of v1 scope. MobilePanelShell uses fixed view indices (recent-feed syncs to index 3, `browser-client.tsx:234-248`); adding a remote-view tab is additive future work. Desktop/tablet only in v1 — matches Chromium-gating.

## Picker Entry Points

| Entry | Mechanism | Work |
|---|---|---|
| Command palette | SDK contribution `remote-view.attach` (no args ⇒ sets `view=remote`, opens picker; with window arg ⇒ attaches directly) | USDK two-file pattern, Plan 047 |
| Deep link / refresh | URL contract above; nuqs hydrates on load | Free |
| Agent attach | CLI/MCP verb creates the session server-side → SSE envelope `remote-view` → client `setParams({ view: 'remote', rv })` | Workshop 002 § R4, SSE per ADR-0007/0010 |
| Toolbar affordance | Optional button near the mode buttons | **Deferred to architect** — not load-bearing for any AC |

Picker content: window list from `GET /api/remote-view/windows` (app name, title, thumbnail — AC-1). Thumbnails are one-shot JPEG/PNG captures via the daemon's control API (Workshop 004), not live streams.

## Focus & Keyboard Capture (composition-level rules)

Full input semantics live in Workshop 003; the layout-level rules are:

1. The viewport canvas is focusable (`tabIndex=0`). Keyboard forwards **only while the canvas has focus**; a visible "keys captured" indicator shows when it does.
2. All keydown/keyup are forwarded with `preventDefault()` while captured, **except** the reserved release chord `Meta+Shift+Escape` (returns focus to the page) — plain `Escape` must reach the game (Godot menus). Browser-reserved combos (`Cmd+W`, `Cmd+Q`) cannot be intercepted; documented limitation in `docs/how/remote-view.md`.
3. Opening the terminal overlay moves focus to the terminal — capture indicator turns off; stream keeps rendering (video ≠ input). Clicking the canvas re-captures.
4. Entering remote view dispatches `overlay:close-all` (same hygiene as `handleFileSelect`).

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | "Add a mode to the content area" — where? PanelShell? Viewer? New layout? | Three named files; copy the recent-feed branch shape verbatim |
| Review | Reviewer reconstructs why PanelShell/FileViewerPanel are untouched | Diff is checkable against this contract: any PanelShell/FileViewerPanel hunk is a red flag |
| Testing | Invent composition scenarios | AC-5 smoke script is determined: attach → open overlay → open beside → select file → assert file restored |
| Agent execution | Agent guesses URL shape for deep links | URL contract is written; `remote-view.attach` semantics defined |

## Validation / Acceptance

This workshop reaches Validated when:

- The `view` literal extension + `rv` param land and deep-link/refresh round-trips (AC-8 URL-addressability).
- Browser smoke proves terminal-over + terminal-beside + switch-back-restores-file (AC-5) against the frame-replay fake.
- Bundle guard shows base bundle unchanged with RemoteViewPanel dynamic-imported (AC-13).

## Open Questions

### Q1: Does extending the 041-owned `view` literal collide with Plans 085/087?
**RESOLVED**: No — 085 (watch-polling) and 087 (auto-save) touch file watching and editor save paths, not `file-browser.params.ts`'s `view` literal or the recent-feed branch. The one-line extension is additive; coordinate merge order as the spec already notes.

### Q2: Should the stream session pause when the tab is hidden (visibilitychange)?
**DEFERRED-v1.1** (Phase-6 reconciliation, T011): v1 ships **browser-side backpressure** (decode-queue-depth drop → keyframe request, `viewport.tsx`) but does **not** pause encode on a hidden tab. Tab-visibility `pause`/`resume` (encode off on hidden, resume with a keyframe on visible) is an additive v1.1 optimisation — the protocol leaves room for the messages. Not AC-gating; no v1 AC depends on it.
