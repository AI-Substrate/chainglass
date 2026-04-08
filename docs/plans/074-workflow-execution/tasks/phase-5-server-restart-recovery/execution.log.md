# Execution Log: Phase 5 — Server Restart Recovery

**Phase**: Phase 5: Server Restart Recovery
**Started**: 2026-03-15
**Implementor**: plan-6-v2

---

## Pre-Flight

- **Harness validation**: Deferred — Phase 5 is backend plumbing with TDD
- **Baseline tests**: 5530 passing, 4 pre-existing failures in 040-graph-inspect (unrelated)

---

## Task Log

### T001: Registry types + Zod schema ✅
- Created `execution-registry.types.ts` with Zod schemas, TypeScript types, IExecutionRegistry interface, createEmptyRegistry(), toRegistryEntry()
- ExecutionRegistryEntrySchema validates all 7 ManagerExecutionStatus values

### T002: Registry read/write module ✅
- Created `execution-registry.ts` with readRegistry(), writeRegistry(), removeRegistry(), createFileExecutionRegistry()
- P5-DYK #2: Synchronous writeFileSync + renameSync prevents write interleaving
- P5-DYK #4: Uses getUserConfigDir() → `~/.config/chainglass/execution-registry.json`
- readRegistry() never throws — returns empty on missing/corrupt/invalid

### T003: Wire registry into manager lifecycle ✅
- Added `registry: IExecutionRegistry` to ExecutionManagerDeps
- Added `resumeAll()` to IWorkflowExecutionManager interface
- Added `persistRegistry()` calls at 6 lifecycle transition points (start×2, completion, failure, stopping, running)
- Wired createFileExecutionRegistry() in create-execution-manager.ts factory

### T004: Debounced iteration persistence ✅
- Added PERSIST_EVERY_N_ITERATIONS (10) and PERSIST_EVERY_MS (30000) constants
- Added lastPersist Map tracking per-execution persist points
- handleEvent() only persists registry on iteration events when threshold crossed

### T005: Implement resumeAll() ✅
- Reads registry, filters for 'running'/'starting' entries
- Verifies worktree exists via fs.existsSync before calling start()
- P5-DYK #3: On read failure, deletes corrupt registry and returns (self-healing)
- Persists cleaned registry after resume

### T006: Wire resumeAll + SIGTERM persist in bootstrap ✅
- Added resumeAll() call after manager init in instrumentation.ts
- P5-DYK #3: Separate try/catch — resumeAll failure deletes registry, continues bootstrap
- P5-DYK #1: SIGTERM handler persists registry BEFORE cleanup() (best-effort)

### T007: Registry + resumeAll tests ✅
- 10 new registry tests: schema validation (correct/wrong version/invalid status), createEmptyRegistry, toRegistryEntry, round-trip, missing file, corrupt JSON, atomic write, idempotent delete
- 8 new manager tests: registry persistence on start/completion/stop, resumeAll empty/running/stale/completed-skip/self-heal
- Updated existing 23 tests with FakeRegistry dep
- Total: 53 tests in 074 directory (31 manager + 12 button + 10 registry)

---

## Evidence

- **Tests**: 53/53 passing in `test/unit/web/features/074-workflow-execution/`
- **Full suite**: 5567 passing (37 new), 4 pre-existing failures in 040-graph-inspect (unchanged)
- **Lint**: 0 errors, 1 pre-existing warning (get-manager.ts suppression comment)

---

## Discoveries

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
| 2026-03-15 | T003 | gotcha | Adding `registry` to ExecutionManagerDeps broke all 23 existing tests that didn't provide it | Created FakeRegistry helper in test file, updated createDeps() to include it |
| 2026-03-15 | T005 | gotcha | Can't vi.spyOn fs.existsSync in ESM modules | Used os.tmpdir() (always exists) as worktree path instead of mocking |
| 2026-03-15 | T005 | insight | resumeAll correctly self-heals: failing to start (FakeOrchestrationService not configured) results in 'failed' status handle — exactly what production would do for a stale graph |
