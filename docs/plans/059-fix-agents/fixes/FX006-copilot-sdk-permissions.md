# Fix FX006: Copilot SDK Permissions + Upgrade

**Created**: 2026-03-05
**Status**: Complete
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
| [x] | FX006-1 | Upgrade `@github/copilot-sdk` to `^0.1.30` | agents | `packages/shared/package.json` | `pnpm install` succeeds, no type errors | Minor version bump within 0.1.x |
| [x] | FX006-2 | Pass `--allow-all-tools` and `--allow-all-paths` to CopilotClient via `cliArgs` | agents | `apps/web/src/lib/di-container.ts` | CopilotClient constructed with permission flags; `registerSingleton` → `registerInstance` | `registerSingleton` can't pass constructor args |
| [x] | FX006-3 | Add `onPermissionRequest: approveAll` to createSession/resumeSession | agents | `packages/shared/src/adapters/sdk-copilot-adapter.ts`, `packages/shared/src/interfaces/copilot-sdk.interface.ts` | SDK doesn't throw permission error, bash tools execute | SDK 0.1.30 requires handler |
| [x] | FX006-4 | Defensive JSON parsing in AgentManagerService.initialize() | agents | `packages/shared/src/features/019-agent-manager-refactor/agent-manager.service.ts` | Corrupt agents skipped, not crash whole list | Edge case from persist failure |
| [x] | FX006-5 | report_intent as first-class intent source | agents | `packages/shared/src/features/019-agent-manager-refactor/agent-instance.ts`, `intent-extractor.ts` | report_intent sets intent; bash/read never overwrite; thinking excluded | Root cause: flag inside value-change guard |
| [x] | FX006-6 | Thinking blocks render before response | agents | `apps/web/src/features/019-agent-manager-refactor/transformers/agent-events-to-log-entries.ts` | Thinking above response in chat | Flush order swap |
| [x] | FX006-7 | Enter to submit, Shift+Enter for newline | agents | `apps/web/src/components/agents/agent-chat-input.tsx` | Enter submits, Shift+Enter newlines | UX improvement |
| [x] | FX006-8 | Intent display above chat input | agents | `apps/web/src/components/agents/agent-chat-view.tsx` | Intent bar visible above input | Always shows last intent |

## Acceptance

- [x] `CopilotClient` constructed with `cliArgs: ["--allow-all-tools", "--allow-all-paths"]`
- [x] SDK version bumped to `0.1.30`
- [x] `onPermissionRequest: approveAll` on all session calls
- [x] Corrupt agents don't crash agent list
- [x] `report_intent` is authoritative — bash never overwrites it
- [x] Thinking events don't set intent
- [x] User prompt text doesn't leak into intent
- [x] Thinking blocks render before response text
- [x] Enter submits, Shift+Enter for newline
- [x] Intent bar above chat input
- [x] All existing tests pass (4898)

## Discoveries & Learnings

_Populated during implementation._

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
