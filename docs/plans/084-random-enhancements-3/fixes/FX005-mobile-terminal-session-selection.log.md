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

## Companion findings disposition

| Ping (subject) | Sent at | Finding ID | Severity | Disposition | Notes |
|---|---|---|---|---|---|
