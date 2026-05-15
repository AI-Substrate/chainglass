# Fix FX005: Mobile terminal picks wrong tmux session after sleep/wake

**Created**: 2026-05-04
**Status**: Proposed (not started)
**Plan**: Standalone (regression originates in plan 064-tmux phase 3 + plan 078-mobile-experience FX002 / phase 2)
**Source**: User bug report + flowspace investigation (2026-05-04 conversation)
**Domain(s)**: `terminal` (modify — internal hook + API route; no contract change)

---

## Problem

On the mobile browser page, the terminal tab "quite often picks the wrong tmux session", and when the mobile browser sleeps and wakes the previously-correct selection re-snaps to a different session. The same hook on desktop (`/workspaces/<slug>/terminal`) is mostly fine because the page mounts eagerly and the tab never goes to sleep behind a lazy boundary.

Three concrete defects in `apps/web/src/features/064-terminal/hooks/use-terminal-sessions.ts`:

1. **No persistence of the chosen session.** `selectedSession` lives only in component state (line 25). The mobile Terminal tab is configured `lazy: true` (`apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`), so when mobile Safari/Chrome reclaims the page during background, the rehydrated mount re-runs the auto-pick from scratch.

2. **Auto-pick falls through to `enriched[0]`** (lines 48–56). When the worktree-name match (`s.name === currentBranch`) fails — common when worktree branch sanitisation diverges from the tmux session name, or when a user is on a worktree that doesn't have its own session yet — the hook silently picks "whichever session tmux happened to list first".

3. **Stale closure on the focus listener.** `fetchSessions` includes `selectedSession` in its deps (line 62), and the `useEffect` re-binds the `window.focus` listener every time `fetchSessions` changes (line 76). On wake, `focus` fires before React re-renders, the captured closure can still see `selectedSession === null` (because the rehydrated mount hasn't selected anything yet), and the auto-pick re-runs against a fresh-but-differently-ordered API response. `tmux list-sessions` output order is not stable across calls (`apps/web/app/api/terminal/route.ts:33-44` does no sorting), so `enriched[0]` can shift if any session was created/destroyed between fetches.

**User impact**: every mobile sleep/wake cycle is a coin-flip on which tmux session the user is dropped into. Frequent enough that the user reported it after a single session of normal mobile usage.

## Proposed Fix

Persist the chosen session in the URL via `nuqs` (same pattern already used for `view`, `dir`, `file`, `mobileView`), validate on every refetch that the stored choice still exists in the live session list, clear the URL param when a stored name is gone (don't leave a phantom), and stable-sort the API response so any fallback is deterministic.

After the fix:

- Selection survives lazy mount, browser sleep, hot reload, and shareable URLs.
- On wake, the hook keeps the stored session if it still exists; only falls back to current-worktree (or the first stable-sorted session) when the stored name has truly disappeared.
- `fetchSessions` reads the stored name through a ref, removing `selectedSession` from its deps and stabilising the focus listener.

### Defect-to-task mapping

| Defect | Task | Fix |
|--------|------|-----|
| (1) No persistence | FX005-2 | URL-backed state via nuqs |
| (2) Unstable auto-pick fallthrough (`enriched[0]`) | FX005-1 | Stable-sort API by `created` asc with `name` as tiebreaker |
| (3) Stale closure on focus listener | FX005-2 | Mirror stored name through a ref; drop `selectedSession` from `fetchSessions` deps |

### Behavioral changes the dossier is honest about

- **Setter semantics change.** `setSelectedSession(name)` becomes a write-through to the URL: local state updates synchronously (React `useState`), URL updates asynchronously (nuqs-debounced). Existing callers (`browser-client.tsx`, `terminal-page-client.tsx`, `terminal-session-list.tsx`) do not read `selectedSession` synchronously after calling the setter, so this is safe today — but it is a contract change for any future caller and must be documented in the hook's JSDoc.
- **Hydration window null.** The URL param reads as `null` during the SSR → hydration window. `selectedSession` is already typed `string | null`, and the two existing call sites (`browser-client.tsx:1091`, `terminal-page-client.tsx:80`) already guard against null — the fix must preserve those guards and not introduce any synchronous "assume non-null" path. Any new call site added during implementation must guard the same way.
- **First-visit users still auto-pick.** This fix preserves a *prior* selection. A first-time visitor (or one who cleared their browser state) will still hit the auto-pick — but the auto-pick is now deterministic (stable-sorted) instead of arbitrary, which is a strict improvement over today.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `terminal` | modify (internal) | `useTerminalSessions` gains URL-backed state + ref-stabilised callback. `/api/terminal` sorts output by `created` asc. Public hook return type is unchanged — call sites read/write the same `selectedSession` / `setSelectedSession` API. |

No contract change. No cross-domain ripple. Mobile and desktop call sites (`browser-client.tsx`, `terminal-page-client.tsx`) get a one-line addition to thread the URL param into nuqs, but the hook signature stays as it is.

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | FX005-1 | Stable-sort the `/api/terminal` response by `created` ascending with `name` as a secondary tiebreaker (so identical creation timestamps still yield a deterministic order). Defence-in-depth — even if the persistence path fails, the wrong-session-on-wake symptom degrades from "random" to "predictable". | `terminal` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/api/terminal/route.ts` | (a) `tmux list-sessions` parsed → `.sort((a, b) => (a.created - b.created) \|\| a.name.localeCompare(b.name))` before JSON response. (b) New unit test asserts ordering for a 3-session fixture. (c) Test includes a same-`created` collision case to verify the name-secondary sort is stable. | Smallest piece. Lands first to keep the test surface independent of the bigger hook rewrite. |
| [x] | FX005-2 | Persist `selectedSession` to a URL param (`?session=<name>` — reusing the dormant `terminalParams.session` entry; see log for pivot from the dossier-original `?term=`) using `nuqs` `useQueryState` (match the existing pattern in `browser-client.tsx`). On every fetch (mount + focus), validate that the stored name still exists in the live sessions list — keep it if it does, otherwise fall back (worktree match → first stable-sorted session) and **clear the phantom URL param** so a refresh doesn't perpetuate the bad name. Read the stored name through a `useRef` mirror so `fetchSessions` no longer needs `selectedSession` in its dep array, eliminating the stale closure on the focus listener. Hook return type unchanged. | `terminal` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/064-terminal/hooks/use-terminal-sessions.ts`<br/>`/Users/jordanknight/substrate/084-random-enhancements-3/test/unit/web/features/064-terminal/use-terminal-sessions.test.tsx` (new file — does not exist today) | (a) URL `?session=<name>` survives mount/unmount + sleep/wake; (b) wake-from-sleep refetch keeps a still-existing session (no re-pick); (c) when the stored name is genuinely gone, hook falls back AND clears the URL param via `setQueryState(null)`; (d) `fetchSessions` deps no longer reference `selectedSession`; (e) `setSelectedSession` writes URL with `history: 'replace'` (not `'push'`) — selection is current-state, not navigation; (f) `setSelectedSession`'s new write-through-to-URL semantic is documented in JSDoc on `UseTerminalSessionsReturn`; (g) `?session` reuses the existing `terminalParams.session` definition rather than inventing a new param — collision-by-construction impossible; (h) hydration-window guard preserved at both call sites — see "Behavioral changes" above; (i) regression tests cover: stored-name-still-present, stored-name-deleted (URL cleared), no-stored-name + worktree-match, no-stored-name + no-worktree-match, zero-sessions (no URL written, `selectedSession` remains null). | Core of the fix. Public hook surface (`selectedSession`, `setSelectedSession`, `refresh`) stays type-compatible — `setSelectedSession` adds an asynchronous URL write side-effect (nuqs-debounced); local state still updates synchronously. |
| [x] | FX005-3 | Verify both call sites (mobile browser tab + desktop terminal page) inherit the persisted selection without further wiring. If `useTerminalSessions` owns the URL param internally via `nuqs`, both call sites should "just work"; this task confirms via Playwright mobile audit + a quick manual desktop check. Add a **new section** to `harness/agents/mobile-ux-audit/prompt.md` (do NOT edit existing Section 5 "Recent Changes / History Tab") with the wake-from-sleep persistence assertion below. | `terminal` | `/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`<br/>`/Users/jordanknight/substrate/084-random-enhancements-3/apps/web/src/features/064-terminal/components/terminal-page-client.tsx`<br/>`/Users/jordanknight/substrate/084-random-enhancements-3/harness/agents/mobile-ux-audit/prompt.md` | (a) Mobile audit script: navigate to `/workspaces/<slug>/browser?mobileView=2` (Terminal tab), tap a non-default session, swipe to Files tab, simulate background → resume by firing `document.dispatchEvent(new Event('visibilitychange'))` (with `document.hidden` toggled hidden→visible) THEN `window.dispatchEvent(new Event('focus'))` in that order, swipe back to Terminal tab, assert same session selected AND `?session=<name>` present in URL. (b) Desktop `?session=<name>` deep-link works on first load. (c) Manual fallback if harness is unhealthy: same flow via `just dev` + browser DevTools (documented in the harness prompt section). | The harness prompt's existing Section 5 is "Recent Changes / History Tab" (lines 67–91) and must NOT be modified. Add this as Section 6 "Terminal Session Persistence" (renumber subsequent sections if any). |

## Workshops Consumed

None. Original design context lives in:
- `docs/plans/064-tmux/workshops/001-terminal-ui-main-and-popout.md` (component hierarchy)
- `docs/plans/078-mobile-experience/workshops/004-unified-three-view-mobile-page.md` (mobile tab structure — where `lazy: true` was introduced)

## Acceptance

- [ ] Mobile: select a non-default tmux session → swipe to Files tab → simulate sleep + wake → session is unchanged on return.
- [ ] Mobile: select a session, kill that tmux session externally, swipe back → hook gracefully picks a fallback (current worktree or first stable-sorted), URL `?session=` is replaced with the new selection (no phantom).
- [ ] Phantom-link cleanup: load `/workspaces/<slug>/browser?session=nonexistent-session` cold → hook detects the session is absent, picks a fallback, AND removes `?session=nonexistent-session` from the URL bar.
- [ ] Desktop: `/workspaces/<slug>/terminal?session=foo` deep-link mounts with `foo` selected (when `foo` exists).
- [ ] `/api/terminal` returns sessions in deterministic order across consecutive calls — verified by an in-test repeated-call invariant AND a same-`created` collision fixture.
- [ ] No regression on the existing terminal page surface — `terminal-page-client.tsx` and `browser-client.tsx` consumers behave as before when no `?session=` is present.
- [ ] `setSelectedSession` JSDoc documents the URL write-through side-effect and `history: 'replace'` semantics.
- [ ] `useTerminalSessions` test file gains 5 new cases (listed in FX005-2 Done When (i)).

## Deployment & Ops

Pure code change. No database migrations. No environment variables. No feature flags or staged rollout. Safe to deploy in a single Next.js build.

## Risk

Low. The hook's public surface is preserved (return type identical). The URL param is opt-in: in its absence the hook behaves like today, except the auto-pick fallback is now stable-sorted instead of arbitrary. The one footgun to watch is `nuqs` URL writes being debounced/batched — ensure the very first auto-pick on a fresh mount actually writes back to the URL (otherwise refresh loses it); test case (a) and the phantom-link acceptance both exercise this.

**Rollback scope**: revert three files — `apps/web/src/features/064-terminal/hooks/use-terminal-sessions.ts`, `apps/web/app/api/terminal/route.ts`, and `harness/agents/mobile-ux-audit/prompt.md`. The new test file `test/unit/web/features/064-terminal/use-terminal-sessions.test.tsx` deletes cleanly with no other dependents.

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|

---

## Validation Record (2026-05-04)

> **Implementation note (post-pivot)**: this Validation Record was written by `validate-v2` *before* the implementation pivoted from the dossier-original `?term=<name>` URL param to `?session=<name>` (reusing the dormant `terminalParams.session` entry already exported from `apps/web/src/features/064-terminal/params/terminal.params.ts`). References below to `?term=` should be read as the conceptual URL-param contract — the actual param name as shipped is `?session=`. The pivot does not change the validator's verdict; it strictly *strengthens* the collision-check Done When (g) by reusing an existing definition rather than inventing a new one. Companion review (2026-05-04, run `2026-05-04T16-16-02-885Z-9355`) flagged remaining stale `?term=` text outside this Record as F002 MEDIUM; that has been corrected.


| Agent | Lenses Covered | Issues | Verdict |
|-------|---------------|--------|---------|
| Source Truth | Hidden Assumptions, Domain Boundaries, Concept Documentation | 1 CRITICAL fixed (phantom Section 5), 1 LOW false-positive (file-length claim was the agent's own prompt section, not the dossier) | ⚠️ → ✅ |
| Cross-Reference | Integration & Ripple, Concept Documentation | 1 MEDIUM open (Standalone label is non-canonical in this repo), 1 LOW open (no plan `## Fixes` registration) | ⚠️ |
| Completeness | Edge Cases & Failures, Hidden Assumptions, Technical Constraints, Deployment & Ops | 5 MEDIUM fixed (phantom URL cleanup, history mode, rollback file count, test file path, harness section), 3 MEDIUM fixed (zero-session, timestamp-collision, param namespace), 1 LOW fixed (deployment notes), 1 LOW fixed (defect-to-task mapping), 1 MEDIUM open (manual-fallback path for harness — added to Done When) | ⚠️ → ✅ |
| Forward-Compatibility | Forward-Compatibility, User Experience, Performance & Scale | 1 HIGH fixed (`setSelectedSession` write-through documented), 1 HIGH fixed (nuqs hydration window documented + guards required), 1 HIGH partly addressed (OUTCOME honesty — first-visit case explicitly flagged), 1 MEDIUM open (visibilitychange + pageshow timing on real Safari mobile vs unit-test focus event), 1 MEDIUM open (single-mount-only contract — speculative future split-pane scenario) | ⚠️ |

**Lens coverage**: 9/12 (above the 8-floor). Forward-Compatibility engaged (not STANDALONE — five named consumers exist).

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| C1 `browser-client.tsx` (mobile, lazy) | Hook call-compat: `useTerminalSessions({currentBranch})` returns same shape; setter compatible with `TerminalSessionList.onSelect` callback | shape mismatch (setter side-effect) | ✅ after fix | Setter type unchanged; new write-through-to-URL behavior documented in dossier "Behavioral changes" section + JSDoc requirement at FX005-2 (f). Existing call site doesn't read selection synchronously after set. |
| C2 `terminal-page-client.tsx` (desktop deep-link) | `?term=<name>` resolves to named session on first load; setter works as before | contract drift (SSR/hydration) | ✅ after fix | Hydration-window null guard already present at line 80; FX005-2 (h) requires the fix to preserve it. Server-side param cache is not strictly required because both pages render `useTerminalSessions` client-side on a `'use client'` boundary. |
| C3 `terminal-view.tsx` (`sessionName: string`, stable) | Stable, non-flickering sessionName prop derived from `selectedSession`; ref-stabilised callback eliminates focus-listener stale closure | shape mismatch (flicker) | ✅ after fix | `sessionName` only renders when `selectedSession` is non-null (existing call sites already conditional-render); ref mirror in FX005-2 (d) eliminates the stale-closure path that was the root cause of mid-session re-pick. |
| C4 `harness/agents/mobile-ux-audit/prompt.md` | Wake-from-sleep terminal assertion added without corrupting existing Section 5 (Recent Changes / History Tab) | encapsulation lockout | ✅ after fix | FX005-3 now explicitly says "do NOT edit existing Section 5" and "Add as Section 6 'Terminal Session Persistence'", with the exact assertion text in the Done When. |
| C5 `/plan-6-v2 --fix FX005` invocation | Tasks self-sufficient: every Done When testable, every file path verified, edge cases enumerated | contract drift / test boundary | ⚠️ partly | Tasks now enumerate 9 sub-criteria for FX005-2 (a–i) and 3 for FX005-1 (a–c). Open: real-mobile event sequence (visibilitychange + pageshow) is not reproducible in jsdom — only Playwright assertion in FX005-3 covers it. If real Safari diverges from the Playwright simulation, plan-6 may need a follow-up. |

**Outcome alignment**: The user said *"in mobile version when I go to the terminal it quite often picks the wrong tmux session. And if I refresh it, it'll come back after I've closed my mobile browser and it comes back and it refreshes."* The artifact, **as edited**, advances this Outcome for the dominant case (returning users with a stored choice — preserved across sleep/wake/refresh by URL persistence + ref-stabilised focus listener) and is now explicitly honest about the limitation (first-visit users still auto-pick, but the auto-pick is deterministic via stable-sort instead of arbitrary). Two open items — real-mobile `visibilitychange` + `pageshow` timing vs unit-test `focus`, and the speculative split-pane single-mount contract — do not block the user-reported symptom from being addressed.

**Standalone?**: No — five downstream consumers named with concrete needs; Forward-Compatibility engaged.

### Fixes applied (CRITICAL + HIGH + scope-tightening MEDIUM)

- C1: harness Section 5 phantom-target replaced with explicit "Add as new Section 6, do NOT edit Section 5" + assertion text included.
- H1: OUTCOME honesty — added "Behavioral changes the dossier is honest about" section flagging first-visit limitation.
- H2: `setSelectedSession` write-through semantic documented in Behavioral Changes + JSDoc requirement at FX005-2 (f).
- H3: nuqs SSR/hydration window documented + guard preservation required at FX005-2 (h).
- M1–M5: phantom URL cleanup, `history: 'replace'`, rollback file count (2→3), test file path (new file), harness assertion text — all merged into FX005-2/FX005-3 Done When.
- M6–M8: zero-session test, timestamp-collision test, param-namespace `grep` check — added to Done When.
- L1–L2: Deployment Notes section added; defect-to-task mapping table added.

### Open (user decision)

- **Standalone label** (MEDIUM, Cross-Reference Agent): every other FX in this repo names a parent plan (e.g., FX001 → flowspace-mcp-search-plan.md, FX003 → auth-bootstrap-code-plan.md). FX005 marks itself "Standalone" because the regression originates in completed plans 064-tmux + 078-mobile-experience. Options:
  - Keep "Standalone" — accept the convention break, document why in the dossier (already done implicitly).
  - Attach to `recent-changes-feed-plan.md` (currently active) for tracking — but it's not really a recent-feed concern.
  - Attach to a new umbrella "084-random-enhancements" plan node — there isn't one.
- **Visibility/pageshow timing on real Safari** (MEDIUM, Forward-Compat Agent): if Playwright's synthetic event sequence diverges from real mobile behavior, a follow-up may be needed.

**Overall**: ⚠️ VALIDATED WITH FIXES — ready for `/plan-6-v2-implement-phase --fix FX005` after the user resolves the Standalone-label question.
