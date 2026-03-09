# Fix FX002: Smoke-test retrospective CLI improvements

**Created**: 2026-03-08
**Status**: Proposed
**Plan**: [agent-runner-plan.md](../agent-runner-plan.md)
**Source**: Smoke-test agent retrospective (run `2026-03-08T10-42-28-675Z-9dce`) — 3 actionable improvement suggestions from the first autonomous agent to use the harness end-to-end
**Domain(s)**: external (harness/)

---

## Problem

The smoke-test agent's retrospective identified three friction points in the harness CLI. The most impactful: there's no way to check browser console logs without writing a bespoke Playwright script from scratch. This is something every test agent will need. Additionally, capturing screenshots at multiple viewports requires three sequential commands when one would suffice. Finally, the `pnpm exec tsx` vs `npx tsx` workspace gotcha needs broader documentation beyond just the smoke-test instructions.

## Proposed Fix

Add two new CLI commands and improve documentation:

1. **`just harness console-logs`** — Connect to CDP, navigate to URL, capture console messages, return JSON in the standard `{command, status, data}` format. Supports `--filter`, `--url`, and `--wait` flags.
2. **`just harness screenshot-all`** — Capture screenshots at all configured viewports (or a specified subset) in one command, returning an array of results.
3. **pnpm workspace docs** — Document the `pnpm exec tsx` invocation pattern in harness.md and CLAUDE.md so future agents and humans don't hit the `npx` gotcha.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| external (harness/) | modify | New CLI commands: `console-logs`, `screenshot-all`; new source files in `harness/src/cli/commands/` |
| cross-domain | modify | `docs/project-rules/harness.md` and `CLAUDE.md` updated with new commands and pnpm workspace note |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX002-1 | Create `console-logs` CLI command | external | `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/console-logs.ts` | Command connects to CDP, navigates to URL (default `/`), captures console messages for `--wait` seconds (default 5), returns JSON with `{level, text, source}[]`. Supports `--filter errors\|warnings\|all` (default `all`), `--url <path>` (default `/`), `--wait <seconds>` (default 5) | Reuse `getWsEndpoint` and `computePorts` from screenshot command. Follow same Playwright CDP pattern. Error code: E126 |
| [ ] | FX002-2 | Register `console-logs` in CLI and add error code | external | `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/index.ts`, `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/output.ts` | `just harness console-logs` shows up in `--help`, error code E126 (CONSOLE_LOGS_FAILED) defined | Pattern: `registerConsoleLogsCommand(program)` in index.ts |
| [ ] | FX002-3 | Create `screenshot-all` CLI command | external | `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/commands/screenshot-all.ts` | `just harness screenshot-all <name>` captures at all 4 viewports (or `--viewports desktop-lg,tablet,mobile`), returns array of `{name, viewport, path, filename}`. Reuses screenshot logic | Reuse viewport definitions from `devices.ts`. Single browser connection, multiple contexts |
| [ ] | FX002-4 | Register `screenshot-all` in CLI | external | `/Users/jordanknight/substrate/066-wf-real-agents/harness/src/cli/index.ts` | `just harness screenshot-all` shows up in `--help` | |
| [ ] | FX002-5 | Add unit tests for new commands | external | `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/console-logs.test.ts`, `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/screenshot-all.test.ts` | Tests for argument validation, filter parsing, viewport subset parsing. Integration tests (needing container) can be `.skip` | 5-field Test Doc blocks required |
| [ ] | FX002-6 | Update documentation | cross-domain | `/Users/jordanknight/substrate/066-wf-real-agents/docs/project-rules/harness.md`, `/Users/jordanknight/substrate/066-wf-real-agents/CLAUDE.md`, `/Users/jordanknight/substrate/066-wf-real-agents/harness/agents/smoke-test/instructions.md` | harness.md CLI table includes `console-logs` and `screenshot-all`. CLAUDE.md updated. Smoke-test instructions reference `console-logs` instead of Playwright script. pnpm workspace note added to harness.md Conventions section | |
| [ ] | FX002-7 | Update error code range test | external | `/Users/jordanknight/substrate/066-wf-real-agents/harness/tests/unit/cli/output.test.ts` | E126 range accepted in error code test (extend E120-E126) | |

## Workshops Consumed

- [Workshop 001: Copilot SDK Adapter Reuse & Agent Runner Design](../workshops/001-copilot-sdk-adapter-reuse-and-agent-runner-design.md) — CLI command patterns, JSON envelope format

## Acceptance

- [ ] `just harness console-logs` returns JSON with console messages from the app
- [ ] `just harness console-logs --filter errors` returns only error-level messages
- [ ] `just harness screenshot-all homepage` captures at all 4 viewports in one command
- [ ] `just harness screenshot-all homepage --viewports desktop-lg,mobile` captures at specified subset
- [ ] harness.md CLI table lists both new commands
- [ ] Smoke-test instructions reference `console-logs` command instead of raw Playwright
- [ ] `just fft` green (4996+ tests)
- [ ] Harness unit tests pass for new commands

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
