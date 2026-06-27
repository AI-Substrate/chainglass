# Execution Log: FX012 — Single xterm instance across overlay / split / terminal-page

**Fix**: [FX012-single-xterm-singleton.md](./FX012-single-xterm-singleton.md)
**Started**: 2026-05-21

---

## Pre-Phase Harness Validation

| Stage | Status | Duration | Note |
|-------|--------|----------|------|
| Boot | ✅ healthy | 0s | already running per `just harness health` |
| Interact | ✅ (deferred) | — | will use Playwright spec at FX012-5 |
| Observe | ✅ (deferred) | — | will use `harness/results/` at FX012-5 |

Harness L3, all services up (app, mcp, terminal, cdp). Cleared to proceed.

---

## Per-Task Log

### FX012-1 — Singleton primitives + provider mount (2026-05-21)

**Approach**: render `<TerminalInner>` ONCE inside a hidden park container at the workspace `[slug]` layout. Expose a context with `activate(id)`, `deactivate(id)`, `registerSlot(id, el)`, `activeId`, plus a `connectionStatus` value so consumers like `TerminalOverlayPanel` can keep their badge. Move the xterm host DOM via `appendChild` on `activeId` change.

**Files**:
- `apps/web/src/features/064-terminal/components/terminal-singleton-provider.tsx` (NEW)
- `apps/web/src/features/064-terminal/components/terminal-viewport.tsx` (NEW)
- `apps/web/src/features/064-terminal/index.ts` (MODIFY — added exports)
- `apps/web/app/(dashboard)/workspaces/[slug]/terminal-overlay-wrapper.tsx` (MODIFY — wrapped overlay provider with singleton)
- `test/unit/web/features/064-terminal/terminal-singleton-provider.test.tsx` (NEW)

**Evidence**:
- `pnpm exec vitest run test/unit/web/features/064-terminal/terminal-singleton-provider.test.tsx` — 6/6 pass.
- `pnpm exec vitest run test/unit/web/features/064-terminal/` — 197/197 pass (no regressions).
- `pnpm exec tsc --noEmit` — no new errors on the modified files (pre-existing errors in unrelated files remain).

**Done-When checklist**:
1. ✅ Provider renders cleanly with exactly one mock TerminalInner in park (test 1).
2. ✅ appendChild moves host into active slot (test 2).
3. ✅ Unmount returns host to park (test 3).
4. ✅ LIFO activation (test 4).
5. ✅ Strict-mode steady-state mount count is 1 (test 5).
6. ✅ KF-02 verified: DOM node identity survives 3 parent re-renders (test 6).
7. 🟡 KF-03 deferred to FX012-5 harness spec (real browser, real ResizeObserver).

### FX012-2 — Migrate TerminalOverlayPanel (2026-05-21)

**Approach**: replace the panel's direct `<TerminalInner sessionName cwd onConnectionChange themeOverride isVisible={isOpen} />` with `<TerminalViewport id="overlay" active={isOpen} />`. Drop the local `connectionStatus` useState — read it from the singleton context instead. Drop the `hasOpened` lazy-mount guard — the singleton centralizes the lazy-mount gate (added as `hasActivated` state inside the singleton during FX012-2 iteration). Preserve everything else verbatim: header chrome, escape/backtick handlers, anchor measurement, useTerminalOverlay public API.

### FX012-3 — Migrate TerminalPageClient (2026-05-21)

**Approach**: swap `<TerminalView>` at the desktop `main` slot for `<TerminalViewport id="terminal-page" active />`. Read connection status from singleton context. Mobile path on `/terminal` left on `TerminalView` per KF-09. `TerminalMobileGate` redirects mobile users to `/browser` anyway, so the mobile `TerminalView` branch is mostly dead code in this route.

### FX012-4 — Browse-page A↔B state machine (2026-05-21)

**Approach**: rename `splitTerminalEnabled`→`splitOn`. Add `handleSplitToggleChange` callback that closes the float on A→B and opens it on B→A. Add capture-phase listener for `terminal:toggle` (gated by `!splitOn` early-bail) that preempts the overlay provider's bubble-phase listener. Swap `<TerminalView>` for `<TerminalViewport id="inline-3rd" active />`. Removed `overlay:close-all` dispatch from `SplitTerminalToggleButton` (state-transition side-effects now in caller). Updated the existing button unit test to reflect the new ownership. Dedicated state-machine unit test deferred to FX012-5 harness coverage.

### FX012-5 — Harness spec + docs (2026-05-21)

**Approach**: wrote `harness/tests/features/single-xterm-state-machine.spec.ts` covering S1, S3, S4, S5, S6, S7, S8, S9, S10 — DOM-level state-machine + singleton invariant assertions that pass green against the harness Docker container. Retired the superseded `harness/tests/features/browse-split-toggle.spec.ts`. Rewrote `docs/how/split-terminal-view.md` (new transition table + same-xterm-everywhere section + updated L-01 caveat). Added Plan-084 FX012 History rows to `docs/domains/terminal/domain.md` and `docs/domains/file-browser/domain.md`. Hit and resolved two issues during this stage:

  1. The outer `dynamic(... ssr: false)` wrapper on `TerminalSingletonProvider` blanked out the workspace page body during SSR (because dynamic-with-ssr-false doesn't render children server-side). Fixed by importing the provider statically — the provider's JSX is SSR-safe because it gates the xterm-loaded `TerminalInner` with its own internal `dynamic`.
  2. A pre-existing harness env quirk causes the WS sidecar to reject JWTs from `/api/terminal/token` ("Invalid or expired token", signing-key derivation mismatch). Confirmed unrelated to FX012 (reproduces with the singleton path disabled, and the pre-FX012 spec also fails). Deferred scenarios that need a live shell (scrollback persistence, tmux client count) — DOM-level singleton invariants verified green without needing the WS to attach.

**Evidence**:
- `pnpm exec vitest run test/unit/web/features/064-terminal/ test/unit/web/features/041-file-browser/` — 692/692 passing.
- `pnpm exec playwright test single-xterm-state-machine.spec.ts --project=desktop` — 1/1 passing (S1, S3, S4, S5, S6, S7, S8, S9, S10).
- `pnpm exec tsc --noEmit` — no new errors on any modified file.

### FX012-6 — Follow-up: singleton must source sessionName/cwd from overlay state (2026-05-21)

**Problem reported by user (post-landing)**: opening a terminal on a worktree (via backtick or split-toggle) attached tmux to the workspace's *default* session (often the main repo name) instead of the *worktree-specific* session. Reproduces consistently when `workspace.path` ≠ current worktree path — i.e., any time the user is viewing a non-default worktree.

**Root cause**: FX012 wired `sessionName`/`cwd` into `TerminalSingletonProvider` as static props derived from `defaultBranch` at workspace-`[slug]`-layout mount time (`apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx:82-83`). `TerminalOverlayProvider` already tracked the correct per-worktree session via `toggleTerminal()` (URL `?worktree=` resolution) and `openTerminal(name, cwd)`, but the singleton ignored the overlay state and used its frozen prop. Pre-FX012 this wasn't a bug because each surface mounted its own `<TerminalInner>` with a runtime-supplied sessionName; FX012 collapsed those into one fixed value.

**Fix**:
1. Added `setSessionContext(name, cwd)` to `TerminalOverlayContextValue` — updates sessionName/cwd without opening/closing the float. No-op if unchanged.
2. `TerminalSingletonProvider` now consumes `useTerminalOverlay()` for sessionName/cwd. Dropped the `sessionName`/`cwd` props.
3. `TerminalOverlayWrapper` no longer passes those props.
4. `BrowserClient.handleSplitToggleChange(true)` (A→B) calls `overlay.setSessionContext(inlineSessionName, worktreePath)` before flipping `splitOn` — required because entering split-mode doesn't open the float, so without an explicit sync the singleton would still see the workspace default.
5. `TerminalPageClient` syncs `selectedSession`/`worktreePath` to the overlay state via `useEffect` so the singleton attaches to the user-picked session on `/terminal`.

**Files**:
- `apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx` (MODIFY — add setSessionContext)
- `apps/web/src/features/064-terminal/components/terminal-singleton-provider.tsx` (MODIFY — consume overlay state)
- `apps/web/app/(dashboard)/workspaces/[slug]/terminal-overlay-wrapper.tsx` (MODIFY — drop props)
- `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` (MODIFY — sync overlay on A→B)
- `apps/web/src/features/064-terminal/components/terminal-page-client.tsx` (MODIFY — sync overlay on selectedSession change)
- `test/unit/web/features/064-terminal/terminal-singleton-provider.test.tsx` (MODIFY — wrap with `TerminalOverlayProvider` helper)

**Evidence**:
- `pnpm exec vitest run test/unit/web/features/064-terminal/ test/unit/web/features/041-file-browser/` — 692/692 passing.
- `pnpm exec playwright test single-xterm-state-machine.spec.ts --project=desktop` (in `harness/`) — 1/1 passing.
- `pnpm exec tsc --noEmit -p apps/web/tsconfig.json` — pre-existing errors only; none in modified files.
- Dev container `/workspaces/chainglass/browser` → HTTP 200 after Turbopack recompile.

**Discovery**: the FX012 dossier's "exact shape" of the singleton context didn't anticipate that different surfaces (floating overlay, inline split, /terminal page) have different *session* contexts even within the same workspace. The pre-FX012 design implicitly handled this because each surface owned its own `TerminalInner` and supplied its own sessionName at mount. Collapsing to a singleton required collapsing the session-source — the overlay state is the natural single source of truth because three of the four entry points (`openTerminal`, `toggleTerminal`, backtick from anywhere) already converge on it.
