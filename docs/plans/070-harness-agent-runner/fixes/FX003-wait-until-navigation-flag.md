# Fix FX003: Add `--wait-until` Navigation Flag to Harness CLI

**Created**: 2026-03-09
**Status**: Complete
**Plan**: [agent-runner-plan.md](../agent-runner-plan.md)
**Source**: FX001 harness verification — `just harness screenshot` times out on SSE pages because it hardcodes `waitUntil: 'networkidle'`
**Domain(s)**: `_platform/harness` (CLI commands, browser automation)

---

## Problem

All three harness CLI commands that navigate pages (`screenshot`, `screenshot-all`, `console-logs`) hardcode `waitUntil: 'networkidle'`. After Plan 072 SSE Multiplexing, every workspace page maintains a permanent EventSource connection, so `networkidle` never fires — `page.goto()` hangs for 30s then throws `Timeout 30000ms exceeded`. Meanwhile, 15 of 18 test file navigations already use `domcontentloaded`, proving the tests got this right but the CLI commands didn't.

## Proposed Fix

1. Extract a shared `navigateTo()` helper in `harness/src/cdp/navigate.ts` with configurable `waitUntil` and `timeout`
2. Add `--wait-until` and `--timeout` flags to all 3 commands
3. Change default from `networkidle` to `domcontentloaded`
4. Add smart error hints: when a timeout occurs, include the wait strategy used and suggest `--wait-until domcontentloaded`
5. Update `harness/README.md` with a Page Navigation section documenting the options

## Workshop Consumed

- [003-wait-until-navigation-flag.md](../workshops/003-wait-until-navigation-flag.md) — full design, before/after code, README content

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| `_platform/harness` | Modify | Add shared navigate helper, update 3 CLI commands, update README |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX003-1 | Create shared `navigateTo` helper with types and defaults | `_platform/harness` | `harness/src/cdp/navigate.ts` (new) | File exports `navigateTo`, `WAIT_UNTIL_VALUES`, `DEFAULT_WAIT_UNTIL`, `DEFAULT_TIMEOUT`, `WaitUntilValue` type | Default: `domcontentloaded`, timeout: 30000ms |
| [ ] | FX003-2 | Add `--wait-until` and `--timeout` to `screenshot` command | `_platform/harness` | `harness/src/cli/commands/screenshot.ts` (line 17-18, 56) | Command accepts both flags, validates `--wait-until` against allowed values, uses `navigateTo` instead of raw `page.goto` | Include validation error with available values |
| [ ] | FX003-3 | Add `--wait-until` and `--timeout` to `screenshot-all` command | `_platform/harness` | `harness/src/cli/commands/screenshot-all.ts` (line 24-25, 75) | Same pattern as FX003-2 | Same pattern |
| [ ] | FX003-4 | Add `--wait-until` and `--timeout` to `console-logs` command | `_platform/harness` | `harness/src/cli/commands/console-logs.ts` (line 27-29, 74) | Same pattern as FX003-2 | Already has `--wait` for post-load delay — `--wait-until` is different (navigation strategy) |
| [ ] | FX003-5 | Add Page Navigation section to harness README | `_platform/harness` | `harness/README.md` | README documents `--wait-until` and `--timeout` with strategy guide and examples | Key discoverability surface for agents |
| [ ] | FX003-6 | Verify with harness: screenshot agents page with default | `_platform/harness` | N/A | `just harness screenshot agents --url .../agents` succeeds with default (`domcontentloaded`) | This is the exact scenario that failed before FX003 |
| [ ] | FX003-7 | Run `just fft` — all tests pass | N/A | N/A | Lint + format + typecheck + tests green | Harness code is outside the main test suite but lint/format still apply |

## Acceptance

- [ ] `just harness screenshot agents --url .../agents` succeeds (default = `domcontentloaded`)
- [ ] `just harness screenshot home --wait-until networkidle` succeeds on static pages
- [ ] `just harness screenshot --help` shows `--wait-until` and `--timeout` with defaults
- [ ] `just harness console-logs --url /agents` succeeds (default = `domcontentloaded`)
- [ ] Invalid `--wait-until` value returns E108 INVALID_ARGS with available values
- [ ] `harness/README.md` documents Page Navigation options with strategy guide
- [ ] `just fft` passes

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
