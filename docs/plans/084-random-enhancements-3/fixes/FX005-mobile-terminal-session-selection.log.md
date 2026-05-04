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

## Companion findings disposition

| Ping (subject) | Sent at | Finding ID | Severity | Disposition | Notes |
|---|---|---|---|---|---|
