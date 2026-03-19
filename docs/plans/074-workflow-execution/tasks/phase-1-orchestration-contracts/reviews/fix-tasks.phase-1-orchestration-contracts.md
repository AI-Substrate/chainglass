# Fix Tasks: Phase 1: Orchestration Contracts

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Add review-grade TDD evidence to the phase execution log
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/execution.log.md
- **Issue**: The phase is explicitly TDD-oriented, but the execution log only records summaries. It does not preserve RED→GREEN command/output evidence and it overstates AC5 without raw verification output.
- **Fix**: Add per-task RED and GREEN evidence for the TDD-sensitive tasks (T003, T004, T006, T007, T008), including the exact failing and passing Vitest commands plus output excerpts. Add an AC verification section that either proves AC5 with raw output or narrows the claim to the suites actually re-run.
- **Patch hint**:
  ```diff
   ### Stage 2: Abortable Sleep (T003)
  -**Test file**: `test/unit/positional-graph/features/030-orchestration/abortable-sleep.test.ts` — 5 tests
  +**RED**: `pnpm vitest run test/unit/positional-graph/features/030-orchestration/abortable-sleep.test.ts --runInBand`
  +```text
  +<failing output excerpt showing the new contract was missing>
  +```
  +**GREEN**: `pnpm vitest run test/unit/positional-graph/features/030-orchestration/abortable-sleep.test.ts --runInBand`
  +```text
  +<passing output excerpt>
  +```
  +**AC Verification**: `pnpm vitest run <relevant suites>`
  +```text
  +<raw summary proving which existing orchestration suites passed>
  +```
  ```

### FT-002: Repair manual real-stack coverage to use the handle-backed orchestration path
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/test/integration/real-agent-orchestration.test.ts, /Users/jordanknight/substrate/074-actaul-real-agents/test/integration/orchestration-wiring-real.test.ts
- **Issue**: The modified manual real-stack tests no longer observe the actual `PodManager`/`ODS` instances created inside `createPerHandleDeps()`, and one wiring test still calls the obsolete `orchestrationService.run(ctx, graphSlug)` API.
- **Fix**: Capture the per-handle dependencies created by `createPerHandleDeps()` so the assertions inspect the actual handle-local `PodManager`, and update the wiring tests to resolve a handle via `await orchestrationService.get(ctx, graphSlug)` before calling `run()` or `drive()`.
- **Patch hint**:
  ```diff
  -  return { orchestrationService, podManager };
  +  let lastPerHandleDeps:
  +    | { podManager: PodManager; ods: ODS }
  +    | undefined;
  +
  +  const orchestrationService = new OrchestrationService({
  +    ...,
  +    createPerHandleDeps: () => {
  +      const pm = new PodManager(nodeFs);
  +      const cs = new AgentContextService();
  +      const o = new ODS({ ..., podManager: pm, contextService: cs });
  +      lastPerHandleDeps = { podManager: pm, ods: o };
  +      return lastPerHandleDeps;
  +    },
  +  });
  +
  +  return { orchestrationService, getLastPerHandleDeps: () => lastPerHandleDeps };

  -  await stack.orchestrationService.run(ctx, graphSlug);
  +  const handle = await stack.orchestrationService.get(ctx, graphSlug);
  +  await handle.run();
  ```

## Medium / Low Fixes

### FT-003: Expand the Phase 1 Domain Manifest to cover the full runtime diff
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
- **Issue**: `## Domain Manifest` omits several production files changed by the phase commit (`container.ts`, `abortable-sleep.ts`, `index.ts`, `reality.format.ts`, `reality.schema.ts`, `packages/positional-graph/src/index.ts`, `state.schema.ts`).
- **Fix**: Add every touched production/support file to the Phase 1 manifest with domain and classification so the plan’s file→domain mapping matches the reviewed diff.
- **Patch hint**:
  ```diff
   | `packages/positional-graph/src/features/030-orchestration/orchestration-service.ts` | positional-graph | internal | Compound cache key |
   | `packages/positional-graph/src/features/030-orchestration/onbas.ts` | positional-graph | internal | Handle 'interrupted' status in visitNode |
  +| `packages/positional-graph/src/container.ts` | positional-graph | internal | Register per-handle orchestration deps |
  +| `packages/positional-graph/src/features/030-orchestration/abortable-sleep.ts` | positional-graph | internal | Abort-aware sleep utility for drive() |
  +| `packages/positional-graph/src/features/030-orchestration/reality.schema.ts` | positional-graph | contract-support | Runtime validation for ExecutionStatus |
  +| `packages/positional-graph/src/features/030-orchestration/reality.format.ts` | positional-graph | internal | Status glyph support for interrupted nodes |
  +| `packages/positional-graph/src/features/030-orchestration/index.ts` | positional-graph | contract-support | Export updated orchestration types |
  +| `packages/positional-graph/src/index.ts` | positional-graph | contract-support | Export updated orchestration surface |
  +| `packages/positional-graph/src/schemas/state.schema.ts` | positional-graph | contract-support | Persisted node-status schema updated for interrupted |
   ```

### FT-004: Add the required Concepts section to the positional-graph domain doc
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md
- **Issue**: The domain doc still has no `## Concepts` section even though this contract-bearing domain changed several orchestration concepts in Phase 074-P1.
- **Fix**: Add a `## Concepts` table with at least `Concept | Entry Point | What It Does`, and include entries for the new stop/interrupted/isolation semantics.
- **Patch hint**:
  ```diff
  +## Concepts
  +
  +| Concept | Entry Point | What It Does |
  +|--------|-------------|--------------|
  +| Cooperative drive stop | `IGraphOrchestration.drive(options.signal)` | Exits with `'stopped'` when an AbortSignal fires |
  +| Interrupted node status | `ExecutionStatus`, `ONBAS.visitNode()` | Marks stop-interrupted nodes as recoverable and skipped during execution |
  +| Compound orchestration handle key | `OrchestrationService.get(ctx, graphSlug)` | Isolates handles by `worktreePath|graphSlug` |
  ```

### FT-005: Tighten drive-level abort assertions to the phase acceptance bar
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/drive.test.ts
- **Issue**: The drive-level tests prove that abort does not wait the full delay, but they do not enforce the promised `<100ms` bar for idle-delay and action-delay abort paths.
- **Fix**: Update the `drive()` abort tests to assert `<100ms` at the `drive()` layer for both idle and action-delay paths.
- **Patch hint**:
  ```diff
  -    expect(elapsed).toBeLessThan(500); // not 10s
  +    expect(elapsed).toBeLessThan(100); // phase AC2

  -  it('aborts during action delay sleep', async () => {
  +  it('aborts during action delay sleep within <100ms', async () => {
  +    const start = Date.now();
       const result = await handle.drive({
         actionDelayMs: 10_000,
         idleDelayMs: 10_000,
         signal: controller.signal,
       });
  +    const elapsed = Date.now() - start;
       expect(result.exitReason).toBe('stopped');
  +    expect(elapsed).toBeLessThan(100);
     });
  ```

### FT-006: Make abort-path unit tests deterministic and doctrine-compliant
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/abortable-sleep.test.ts, /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/drive.test.ts
- **Issue**: The new abort-path unit tests use real timers and wall-clock duration checks, which conflicts with `R-TEST-005` and increases flake risk.
- **Fix**: Use fake timers or inject a controllable sleep seam so the tests advance time deterministically. While touching the file, add per-`it()` Test Doc blocks in `abortable-sleep.test.ts`.
- **Patch hint**:
  ```diff
  -  const start = Date.now();
  -  setTimeout(() => controller.abort(), 10);
  -  await expect(abortableSleep(10_000, controller.signal)).rejects.toThrow();
  -  const elapsed = Date.now() - start;
  -  expect(elapsed).toBeLessThan(100);
  +  vi.useFakeTimers();
  +  const promise = abortableSleep(10_000, controller.signal);
  +  controller.abort();
  +  await vi.runAllTimersAsync();
  +  await expect(promise).rejects.toThrow('AbortError');
  +  vi.useRealTimers();
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
