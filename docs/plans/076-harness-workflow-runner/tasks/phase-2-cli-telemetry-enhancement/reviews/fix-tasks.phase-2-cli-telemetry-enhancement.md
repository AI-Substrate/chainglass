# Fix Tasks: Phase 2: CLI Telemetry Enhancement

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Repair `cg wf show --detailed` output contract
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/positional-graph.command.ts
- **Issue**: The current mapper reads nonexistent status fields (`line.id`, `node.id`, `node.type`, `readyDetail.reasons`), so runtime `--detailed` output omits line/node identifiers, omits unit type, and always leaves `blockedBy` empty.
- **Fix**: Rebuild the detailed response from the real positional-graph contracts. Prefer a sanctioned read-only source such as `IGraphOrchestration.getReality()`, or at minimum map `lineId`, `nodeId`, `unitType`, and a real blocker source. Re-run `node apps/cli/dist/cli.cjs wf show test-workflow --detailed --json --workspace-path /Users/jordanknight/substrate/074-actaul-real-agents` and verify the response contains line IDs, node IDs, unit types, timing, sessions, and meaningful blocker information.
- **Patch hint**:
  ```diff
  - const detailed = {
  -   lines: statusResult.lines.map((line: { id: string; ... }) => ({
  -     id: line.id,
  -     nodes: line.nodes.map((node: { id: string; type: string; ... }) => ({
  -       id: node.id,
  -       type: node.type,
  -       blockedBy: nodeReality?.readyDetail?.reasons?.filter(...) ?? [],
  -     })),
  -   })),
  - };
  + const orchestrationService = getOrchestrationService();
  + const handle = await orchestrationService.get(ctx, slug);
  + const reality = await handle.getReality();
  + const detailed = {
  +   lines: statusResult.lines.map((line) => ({
  +     id: line.lineId,
  +     nodes: line.nodes.map((node) => ({
  +       id: node.nodeId,
  +       type: node.unitType,
  +       blockedBy: deriveBlockedBy(node, reality),
  +     })),
  +   })),
  + };
  ```

### FT-002: Restore Full Mode Phase 2 evidence artifacts
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-2-cli-telemetry-enhancement/tasks.md, /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-2-cli-telemetry-enhancement/execution.log.md
- **Issue**: The Full Mode phase dossier and execution log are missing, so there is no auditable record of task completion or the Hybrid verification evidence required by task 2.4 and the spec's Dogfooding Contract.
- **Fix**: Create `tasks.md` with the completed task table and Problem Context reference, then create `execution.log.md` with exact commands, raw outputs, and observed outcomes for: GH token pre-flight failure, a real `wf run --json-events` sample showing iteration data, and a corrected `wf show --detailed --json` sample.
- **Patch hint**:
  ```diff
  + # tasks.md
  + ## Problem Context
  + See /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/harness-workflow-runner-spec.md#problem-context-read-this-first
  +
  + | # | Task | Status | Evidence |
  + |---|------|--------|----------|
  + | 2.1 | Add `--detailed` | done | execution.log.md#show-detailed |
  + | 2.2 | Add `--json-events` | done | execution.log.md#json-events |
  + | 2.3 | Add GH token pre-flight | done | execution.log.md#gh-token-preflight |
  + | 2.4 | Verify telemetry | done | execution.log.md#verification |
  +
  + # execution.log.md
  + ## GH token pre-flight
  + <raw command>
  + <raw output>
  +
  + ## `wf run --json-events`
  + <raw command>
  + <raw NDJSON sample>
  +
  + ## `wf show --detailed --json`
  + <raw command>
  + <raw JSON sample>
  ```

## Medium / Low Fixes

### FT-003: Remove CLI dependence on orchestration internals
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/positional-graph.command.ts
- **Issue**: The CLI deep-imports `@chainglass/positional-graph/features/030-orchestration` and constructs `PodManager`/`NodeFileSystemAdapter` directly, bypassing the public read-only orchestration contract.
- **Fix**: Route detailed-status composition through a public contract such as `IGraphOrchestration.getReality()` or another sanctioned telemetry API, and keep CLI code focused on DI resolution plus presentation.
- **Patch hint**:
  ```diff
  - const { buildPositionalGraphReality, PodManager } = await import(
  -   '@chainglass/positional-graph/features/030-orchestration'
  - );
  - const { NodeFileSystemAdapter } = await import('@chainglass/shared');
  - const podManager = new PodManager(new NodeFileSystemAdapter());
  - await podManager.loadSessions(ctx, slug);
  + const orchestrationService = getOrchestrationService();
  + const handle = await orchestrationService.get(ctx, slug);
  + const reality = await handle.getReality();
  ```

### FT-004: Update positional-graph domain history
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md
- **Issue**: The domain history table is stale and omits 076-P2.
- **Fix**: Add a 076-P2 history row documenting `cg wf show --detailed`, `cg wf run --json-events`, and the GH token pre-flight change.
- **Patch hint**:
  ```diff
  + | 076-P2 | CLI telemetry enhancement — `cg wf show --detailed`, `cg wf run --json-events`, GH token pre-flight validation | 2026-03-18 |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
