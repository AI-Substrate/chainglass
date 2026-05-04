# Fix FX005: Mobile terminal session selection — Execution Log

## Companion

- Slug: `code-review-companion`
- Run ID: `2026-05-04T15-57-06-931Z-0a24`
- Verdict at boot: active (boot ~14s)
- Briefing sent: `01KQRS12JR5ND0AF47CFGPPD86` (one-shot, type=briefing)

## Pivot

Dossier originally proposed `?term=<name>` URL param. Discovered during pre-implementation that `apps/web/src/features/064-terminal/params/terminal.params.ts` already exports `terminalParams.session = parseAsString.withDefault('')` (defined but unused). Pivoting to `?session=<name>` — naturally satisfies the dossier's "param namespace check" Done When (g) and is consistent with the existing convention.

## FX005-1: Stable-sort /api/terminal response

**Approach**: Extracted the sort into a pure helper at `apps/web/src/features/064-terminal/lib/sort-terminal-sessions.ts` rather than inlining into the route. Lets the test bypass auth + `execSync` mocking entirely — pure function, pure test surface.

**Files touched**:
- `apps/web/src/features/064-terminal/lib/sort-terminal-sessions.ts` — new (pure helper).
- `apps/web/app/api/terminal/route.ts` — import helper, apply before JSON response.
- `test/unit/web/features/064-terminal/sort-terminal-sessions.test.ts` — new (6 tests).

**Tests**: 6/6 pass (`pnpm vitest run test/unit/web/features/064-terminal/sort-terminal-sessions.test.ts`):
1. Orders by `created` ascending.
2. Tiebreak on identical `created` via `name.localeCompare`.
3. Does not mutate input array.
4. Idempotent across repeated calls.
5. Empty list handled.
6. Extra session fields pass through (typed-via-generic preservation).

**Typecheck**: `pnpm typecheck` clean.

**Companion ping**: pending — sent post-commit with sha.

## FX005-2: URL-persist selectedSession

**Approach**:
- Activated the dormant `terminalParams.session` entry — `useQueryState('session', parseAsString.withDefault('').withOptions({ history: 'replace' }))`. Replaces the original dossier proposal of inventing `?term=<name>`. Naturally satisfies the dossier's "param namespace check" Done When (g).
- Mirrored the URL value through a `useRef` *synced during render* (not in a `useEffect`), so async fetch callbacks always see the latest selection without `storedName` in `fetchSessions` deps. This is the fix for defect (3) — the focus listener no longer captures a stale selection.
- Validate-or-fallback: on every fetch, check whether `storedNameRef.current` matches a live session. If yes → keep. If no → `setStoredName(null)` (phantom cleanup) then auto-pick (worktree match → `enriched[0]`).
- `setSelectedSession('')` maps to URL-removed (matches the `withDefault('')` semantic). Tests cover this.
- `selectedSession` returned to consumers is `null` when stored is `''` — preserves the pre-FX005 `string | null` shape.

**Hidden assumption confirmed**: hydration-window guard at both call sites (`browser-client.tsx:1091`, `terminal-page-client.tsx:80`) renders a fallback when `selectedSession` is null, so the brief SSR-null window is invisible to users.

**Test infrastructure first**: First nuqs adapter test in the apps/web suite. `NuqsTestingAdapter` from `nuqs/adapters/testing` requires `hasMemory` to persist URL writes back to the hook (default `false` makes writes fire-and-forget, which made the phantom-cleanup test fail on the first run — fixed by adding `hasMemory`).

**Files touched**:
- `apps/web/src/features/064-terminal/hooks/use-terminal-sessions.ts` — refactored.
- `test/unit/web/features/064-terminal/use-terminal-sessions.test.tsx` — new (7 tests).

**Tests**: 7/7 pass. Full terminal suite 173/173 pass. Typecheck clean.

Cases covered:
1. Stored name still exists → kept; no URL update.
2. Stored name is gone → URL cleared then auto-picked → final URL has new selection with `history: 'replace'`.
3. No stored name + worktree match → picks worktree session.
4. No stored name + no worktree match → picks first stable-sorted.
5. Zero sessions → `selectedSession = null`, no URL written.
6. `setSelectedSession('bar')` → URL updates to `?session=bar` with `history: 'replace'`.
7. `setSelectedSession('')` → URL `session` param removed.

## FX005-3: Verify call sites + add harness section

**Approach**:
- Verified both call sites inherit URL persistence with zero changes:
  - `apps/web/src/features/064-terminal/components/terminal-page-client.tsx:52` destructures `{ sessions, loading, selectedSession, setSelectedSession, refresh }` from the hook; line 80 already guards `selectedSession ? <TerminalView…> : <fallback>`.
  - `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:464` destructures `{ sessions: termSessions, loading: termLoading, selectedSession: termSelectedSession }`; line 1091 already guards `termSelectedSession ? <TerminalView…> : <empty-state>`.
  - The hook owns `?session=` internally via `nuqs`; both pages roundtrip URL state without further wiring. browser-client's separate `useQueryStates(fileBrowserParams)` (which manages `view`/`dir`/`file`/`mobileView`) coexists with the terminal hook's `useQueryState('session', …)` — independent params, no collision.
- Added Section 4a "Terminal Session Persistence (FX005)" to `harness/agents/mobile-ux-audit/prompt.md` (NOT Section 6 as the dossier originally said — Section 6 already exists as "Cross-Page Mobile Assessment", and Section 4 "Terminal View Deep Dive" is the natural parent for terminal-specific assertions). Section preserves all surrounding sections including the existing Section 5 "Recent Changes / History Tab".
- Section 4a contains a 7-step Playwright assertion sequence: navigate to mobile Terminal tab, pick a non-default session, verify URL update, swipe to Files tab, simulate sleep/wake via `visibilitychange` + `focus` events in the correct order (matches real Safari mobile resume sequence), swipe back, assert same session selected and URL persisted. Plus phantom-link cleanup test (cold-load with `?session=ghost-…`) and hard-refresh test. Includes a manual fallback path via `just dev` + Chrome DevTools for when the harness is unhealthy.

**Files touched**:
- `harness/agents/mobile-ux-audit/prompt.md` — added Section 4a (subsection of existing Section 4).
- `apps/web/src/features/064-terminal/domain.md` — appended FX005 row to History.

**Tests**: typecheck clean, biome format clean (auto-fixed one renderHook formatting), all 173 terminal tests pass.

**Verdict**: All three FX005 tasks landed. Hook + API + tests + harness assertion + domain history all updated.

## Companion findings disposition

| Ping (subject) | Sent at | Finding ID | Severity | Disposition | Notes |
|---|---|---|---|---|---|
| review-request: FX005-1 2865ebb1 | 2026-05-04T06:00:03Z | — | — | no reply (pending drain) | Will surface in farewell |
| review-request: FX005-2 f35fd264 | 2026-05-04T06:07:23Z | — | — | no reply (pending drain) | Will surface in farewell |
| review-request: FX005-3 (post-commit) | (TBD) | — | — | (TBD) | Final ping post-commit |

### Companion run 1 (2026-05-04T15-57-06-931Z-0a24): DEAD-AT-BOOT

First companion run died ~4s into boot — Copilot CLI provider stream truncated mid-token at 05:57:10.535 ("...idle for"). Last events are 159 `text_delta` lines all from the same first-turn message; no `assistant.streaming_complete`, no `tool_use`, no inbox poll. PID (55547) was not in `ps`. `run.json` still claimed `status: active` because nothing transitioned it to dead — the `minih status` liveness check is config-only, not pid-aware.

Likely contention with another concurrent `--resume=minih` Copilot CLI session (pid 93588) on the same machine. **minih bug #1 to file**: `minih status` should pid-probe before reporting `verdict: 'active'`, otherwise dead runs look healthy.

Fallback per skill: log deviation, retry boot.

### Companion run 2 (2026-05-04T16-16-02-885Z-9355): healthy review, 2 findings

Fresh boot at 06:16:02 (pid 19589, 575 events streamed). Companion oriented (file-view tools — shell denied), published idle, polled inbox. Briefing arrived at 06:17:33; companion ack'd at 06:17:36 (msg `01KQRT58AENP46TWXHCZQAX39Z`, ackOf `01KQRT51XQV3HYP7Q9YFN7CC5A`). Review delivered at 06:18:48 with verdict **REQUEST_CHANGES**:

| Finding | Severity | File | Issue |
|---|---|---|---|
| F001 (`01KQRT7B0NJNEYY78Q5Z6N2BXQ`) | HIGH | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:460-467, 1088-1103` | Mobile browser-client only destructures the read fields from `useTerminalSessions` and never wires `setSelectedSession` to a picker. The mobile Terminal tab has no UI affordance to choose a non-default session. The harness Section 4a "tap a non-default session" assertion targets UI that doesn't exist. |
| F002 (`01KQRT7B0NJNEYY78Q5Z6N2BXR`) | MEDIUM | dossier + fltplan | Pivot from `?term=` → `?session=` not propagated through the dossier and flight plan; non-historical sections still referenced `?term=`. |

Companion farewell at 06:25:09 (`stopping: idle budget`). Companion attempted to write report.json at `$MINIH_OUTPUT_PATH` but was blocked by run permission preset (`write: deny`). Findings + summary + retro are intact in the inbox; no disk-side `report.json`. **minih bug #2 to file**: the default `restricted` permission preset blocks the canonical companion-mode farewell envelope write — design contradiction.

### Disposition

| Finding | Action | Status |
|---|---|---|
| F002 (doc drift) | Replace `?term=` with `?session=` in non-historical sections of dossier + flight plan; add post-pivot implementation note above the Validation Record | ✅ done |
| F001 (mobile picker) | Awaiting user decision — (A) scope-honest dossier/audit-prompt rewording (drop "tap session" assertions, keep auto-pick + URL-persist + deep-link), or (B) feature-expand by adding a mobile session picker UI | ⏸️ pending |
