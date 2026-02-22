# Phase 5: Export Wiring and Documentation – Tasks & Alignment Brief

**Spec**: [agentic-cli-spec.md](../../agentic-cli-spec.md)
**Plan**: [agentic-cli-plan.md](../../agentic-cli-plan.md)
**Date**: 2026-02-16

---

## Executive Briefing

### Purpose

This phase completes Plan 034 by ensuring all new types are importable from `@chainglass/shared`, verifying no export conflicts with Plan 019, and creating developer documentation for the redesigned agent system.

### What We're Building

- Complete barrel exports from `@chainglass/shared` (missing: `IAgentInstance`, `AgentCompactOptions`, `AgentEventHandler`)
- Verification that Plan 019 exports don't conflict with Plan 034
- README quick-start section for the new `getNew()` / `getWithSessionId()` API
- Developer guide at `docs/how/agent-system/` (overview + usage patterns)

### User Value

Developers can import all agent types from `@chainglass/shared` with clear documentation on lifecycle, event handling, session chaining, and testing patterns.

---

## Objectives & Scope

### Goals

- ✅ All 034 types/interfaces importable from `@chainglass/shared`
- ✅ No export conflicts between 019 and 034 barrels
- ✅ README quick-start with code examples
- ✅ Developer guide with lifecycle, patterns, and testing docs
- ✅ `just fft` green (AC-47)

### Non-Goals

- ❌ Removing or deprecating 019 exports (future cleanup)
- ❌ Web UI reconnection (separate plan per spec Q6)
- ❌ Consolidating triple `AdapterFactory` definitions (tech debt for later)
- ❌ Adding new features or changing behavior

---

## Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|------|------|----|------|--------------|-------------------|------------|----------|-------|
| [x] | T001 | Add missing 034 exports to shared barrel: `IAgentInstance`, `AgentCompactOptions`, `AgentEventHandler`, `CreateAgentParams`, `AgentFilter`, `AgentInstanceConfig`, `AgentInstanceStatus`. | 1 | Core | – | `/home/jak/substrate/033-real-agent-pods/packages/shared/src/index.ts` | All types importable from `@chainglass/shared`. `tsc --noEmit` clean. | – | Discovery 03. cross-cutting. |
| [x] | T002 | Verify 019 exports don't conflict with 034. Check that both barrels can coexist. Confirm web errors are deliberate (spec Q6). | 1 | Verification | T001 | `/home/jak/substrate/033-real-agent-pods/packages/shared/src/features/019-agent-manager-refactor/index.ts` | CLI and shared compile cleanly. Web compile errors expected per Q6. | – | cross-cutting. |
| [x] | T003 | Add agent system quick-start section to README.md with code examples for `getNew()`, `getWithSessionId()`, CLI commands. | 2 | Doc | T001 | `/home/jak/substrate/033-real-agent-pods/README.md` | README contains agent system section with code examples and link to docs/how/. | – | Per Documentation Strategy. |
| [x] | T004 | Create `docs/how/agent-system/1-overview.md` with lifecycle state diagram, method listing, event pass-through explanation. | 2 | Doc | T001 | `/home/jak/substrate/033-real-agent-pods/docs/how/agent-system/1-overview.md` | File exists with complete overview content. | – | Per Documentation Strategy. |
| [x] | T005 | Create `docs/how/agent-system/2-usage.md` with event handler patterns, session chaining examples, testing patterns. | 2 | Doc | T004 | `/home/jak/substrate/033-real-agent-pods/docs/how/agent-system/2-usage.md` | File exists with complete usage content. | – | Per Documentation Strategy. |
| [x] | T006 | Final regression check: `just fft`. Verify AC-47, AC-48, AC-49, AC-50. | 1 | Verification | T005 | All project files | `just fft` passes. No regressions. | – | AC-47, AC-48, AC-49, AC-50. |

---

## Alignment Brief

### Summary

Phase 5 is lightweight — documentation and export wiring only. No new behavior. Phases 1-4 delivered everything: types, implementations, fakes, contract tests, CLI commands, and real agent integration tests. This phase makes it consumable.

### Key Facts

- `packages/shared/src/index.ts` already exports `AgentInstance`, `AgentManagerService`, `FakeAgentInstance`, `FakeAgentManagerService`, `IAgentManagerService`, `AgentAdapterFactory` (from Phase 3 pull-forward)
- Missing exports: `IAgentInstance`, `AgentCompactOptions`, `AgentEventHandler`, `CreateAgentParams`, `AgentFilter`, `AgentInstanceConfig`, `AgentInstanceStatus`
- 019 barrel is NOT re-exported from main index — it's a standalone feature barrel
- `docs/how/agent-system/` does not exist yet
- README has no agent system section

### Commands

```bash
just fft  # Final regression check
```

---

## Discoveries & Learnings

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| | | | | | |

---

## Evidence Artifacts

- **Execution log**: `docs/plans/034-agentic-cli/tasks/phase-5-export-wiring-and-documentation/execution.log.md`
