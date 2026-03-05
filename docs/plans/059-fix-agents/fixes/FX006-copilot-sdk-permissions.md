# Fix FX006: Copilot SDK Permissions + Upgrade

**Created**: 2026-03-05
**Status**: Proposed
**Plan**: [fix-agents-plan.md](../fix-agents-plan.md)
**Source**: User: Copilot agents can't run bash/file tools — no permission flags passed to SDK
**Domain(s)**: agents (DI wiring)

---

## Problem

`CopilotClient` is constructed via `registerSingleton` with no constructor arguments. The SDK supports `cliArgs: ["--allow-all-tools", "--allow-all-paths"]` in `CopilotClientOptions` to enable bash/file tool execution, but we never pass them. Result: Copilot agents fail silently when they try to run commands — the SDK blocks tool execution because permissions aren't granted.

Additionally, we're on SDK `0.1.26` and latest is `0.1.30`.

## Proposed Fix

1. **Pass permission flags**: Change DI registration from `registerSingleton(token, CopilotClient)` to `registerInstance(token, new CopilotClient({ cliArgs: ["--allow-all-tools", "--allow-all-paths"] }))`.
2. **Upgrade SDK**: Bump `@github/copilot-sdk` from `^0.1.26` to `^0.1.30` in `packages/shared/package.json`.

## Domain Impact

| Domain | Relationship | What Changes |
|--------|-------------|-------------|
| agents | primary | DI container: CopilotClient construction with permission flags |
| agents | primary | packages/shared: SDK version bump |

## Pre-Implementation Check

| File | Exists? | Domain Check | Notes |
|------|---------|-------------|-------|
| `apps/web/src/lib/di-container.ts` | Yes → modify | agents ✓ | Line 234: registerSingleton → registerInstance with cliArgs |
| `packages/shared/package.json` | Yes → modify | agents ✓ | Bump @github/copilot-sdk version |

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | FX006-1 | Upgrade `@github/copilot-sdk` to `^0.1.30` | agents | `packages/shared/package.json` | `pnpm install` succeeds, no type errors | Minor version bump within 0.1.x |
| [ ] | FX006-2 | Pass `--allow-all-tools` and `--allow-all-paths` to CopilotClient via `cliArgs` | agents | `apps/web/src/lib/di-container.ts` | CopilotClient constructed with permission flags; `registerSingleton` → `registerInstance` | `registerSingleton` can't pass constructor args |
| [ ] | FX006-3 | Verify: run `just fft` — all tests pass, types clean | agents | — | 0 test failures, 0 type errors | Regression gate |

## Acceptance

- [ ] `CopilotClient` constructed with `cliArgs: ["--allow-all-tools", "--allow-all-paths"]`
- [ ] SDK version bumped to `0.1.30`
- [ ] All existing tests pass
- [ ] Copilot agent can execute bash commands (manual verification)

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
