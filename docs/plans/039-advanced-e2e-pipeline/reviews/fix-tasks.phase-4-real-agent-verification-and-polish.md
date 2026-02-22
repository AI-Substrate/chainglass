# Fix Tasks — Phase 4 Real Agent Verification and Polish

## Priority 1 (CRITICAL)
1. **Create missing Full-Mode artifacts**
   - Add `docs/plans/039-advanced-e2e-pipeline/tasks/phase-4-real-agent-verification-and-polish/tasks.md`.
   - Add `docs/plans/039-advanced-e2e-pipeline/tasks/phase-4-real-agent-verification-and-polish/execution.log.md` (or explicit canonical file and links).
   - Include task-by-task RED/GREEN/REFACTOR evidence and command outputs.

2. **Repair graph provenance (plan authority first)**
   - Add Phase 4 footnotes to plan §15 Change Footnotes Ledger for every phase-touched path.
   - Mirror footnotes into phase dossier Notes + Phase Footnote Stubs.
   - Add plan Log-column backlinks (`[📋]`) to phase execution anchors.

## Priority 2 (HIGH)
3. **ODS async error handling** (`packages/positional-graph/src/features/030-orchestration/ods.ts`)
   - Add `.catch` on `pod.execute(...).then(...)` chain.
   - Include nodeId + operation metadata in error emission/log.

   Patch hint:
   ```diff
   -pod.execute(payload).then(async () => {
   +pod.execute(payload).then(async () => {
      // persist
   +}).catch((error) => {
   +  // emit/log structured dispatch failure for nodeId
   +});
   ```

4. **Remove shell interpolation from test** (`test/unit/cli/cg-binary-linkage.test.ts`)
   - Replace `execSync` string shell call with direct file read.

   Patch hint:
   ```diff
   -const content = execSync(`cat "${cgPath}"`, { encoding: 'utf8' });
   +const content = readFileSync(cgPath, 'utf8');
   ```

5. **Align ST002 implementation or docs** (`scripts/test-advanced-pipeline.ts` + phase docs)
   - Either implement nodeId-keyed label mapping exactly as ST002 specifies,
   - or explicitly update subtask/plan text to describe and approve the current labeling strategy.

## Priority 3 (MEDIUM)
6. **Resolve assertion contract drift (17 vs 23)**
   - Keep contractual 17 checks as gate and list extra checks separately,
   - or update plan/subtask acceptance criteria and coverage map to 23 with rationale.

7. **Reduce inherit-path latency risk** (`ods.ts`)
   - Replace fixed 10x500ms blocking waits with shorter/event-driven strategy.
   - Add retry telemetry (attempt count, elapsed, fallback reason).

## Validation Sequence (Full TDD)
1. Add/repair tests/assertion mappings first (traceability updates).
2. Apply minimal code changes for P4-004/P4-005/P4-006.
3. Run:
   - `just test-advanced-pipeline`
   - `pnpm test -- --run agent-context.test.ts`
   - `pnpm test -- --run can-run.test.ts`
   - `just fft`
4. Re-run `plan-7-code-review` for Phase 4.
