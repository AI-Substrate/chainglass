# Fix Tasks: Phase 1 — Context Engine — Types, Schema, and Rules

**Generated**: 2026-02-21  
**Review**: [review.phase-1-context-engine-types-schema-and-rules.md](./review.phase-1-context-engine-types-schema-and-rules.md)  
**Status**: ❌ REQUEST_CHANGES (42 findings: 14 CRITICAL, 28 HIGH)

---

## Priority 1: Graph Integrity (CRITICAL — Blocks Merge)

### FIX-001: Synchronize Footnote Ledgers

**Severity**: CRITICAL  
**Files**:
- `docs/plans/039-advanced-e2e-pipeline/advanced-e2e-pipeline-plan.md` § 12
- `docs/plans/039-advanced-e2e-pipeline/tasks/phase-1-context-engine-types-schema-and-rules/tasks.md` § Phase Footnote Stubs

**Issue**: Footnote ledgers are completely out of sync:
- Plan § 12 has placeholder [^2] with no FlowSpace node IDs
- Dossier stubs use [^ph1-1]..[^ph1-5] format instead of numeric [^N]
- All 11 tasks missing [^N] footnote tags in Notes column

**Expected**:
- Plan § 12 and dossier stubs use numeric [^N] format
- Both ledgers have matching content (same footnote numbers, same node IDs)
- All 11 tasks have [^N] footnote tags in Notes column

**Fix**:
1. **Run**: `plan-6a --sync-footnotes` (automated tool)
2. **Manual steps** if plan-6a not available:

**Step 1**: Replace plan § 12 [^2] placeholder with concrete node IDs:
```markdown
## 15. Change Footnotes Ledger

[^1]: Phase 1 complete — modified: `orchestrator-settings.schema.ts` (noContext/contextFrom fields), `positional-graph-service.interface.ts` (NodeStatusResult fields), `positional-graph.service.ts` (getNodeStatus + addNode wiring), `reality.types.ts` (NodeReality + ReadinessDetail stub), `reality.builder.ts` (status→reality wiring), `agent-context.ts` (6-rule engine replacement), `agent-context.test.ts` (20 tests rewrite), `reality.view.ts` (deleted getFirstAgentOnPreviousLine), `reality.test.ts` (removed 4 dead tests), plus 3 integration test files gated with RUN_INTEGRATION=1.

**FlowSpace Node IDs**:
- `file:packages/positional-graph/src/schemas/orchestrator-settings.schema.ts:NodeOrchestratorSettingsSchema` — Added noContext and contextFrom fields
- `file:packages/positional-graph/src/interfaces/positional-graph-service.interface.ts:NodeStatusResult` — Added noContext? and contextFrom? fields
- `file:packages/positional-graph/src/services/positional-graph.service.ts:getNodeStatus` — Exposed noContext/contextFrom from node.config
- `file:packages/positional-graph/src/services/positional-graph.service.ts:addNode` — Cherry-picked noContext/contextFrom to persisted settings
- `file:packages/positional-graph/src/features/030-orchestration/reality.types.ts:NodeReality` — Added noContext? and contextFrom? fields
- `file:packages/positional-graph/src/features/030-orchestration/reality.types.ts:ReadinessDetail` — Added contextFromReady? stub
- `file:packages/positional-graph/src/features/030-orchestration/reality.builder.ts:buildPositionalGraphReality` — Wired noContext/contextFrom from status → reality
- `file:packages/positional-graph/src/features/030-orchestration/agent-context.ts:getContextSource` — Replaced 5-rule engine with 6-rule implementation
- `file:test/unit/positional-graph/features/030-orchestration/agent-context.test.ts:getContextSource` — Rewrote 13 tests → 20 tests (R0-R5)
- `file:packages/positional-graph/src/features/030-orchestration/reality.view.ts:getFirstAgentOnPreviousLine` — Deleted dead method
- `file:test/unit/positional-graph/features/030-orchestration/reality.test.ts:getFirstAgentOnPreviousLine` — Removed 4 dead tests
- `file:test/integration/orchestration-drive.test.ts:RUN_INTEGRATION` — Added env var gate
- `file:test/integration/positional-graph/node-event-system-e2e.test.ts:RUN_INTEGRATION` — Added env var gate
- `file:test/integration/positional-graph/orchestration-e2e.test.ts:RUN_INTEGRATION` — Added env var gate
```

**Step 2**: Convert dossier Phase Footnote Stubs to numeric format:
```markdown
### § Phase Footnote Stubs

[^1]: `file:packages/positional-graph/src/schemas/orchestrator-settings.schema.ts:NodeOrchestratorSettingsSchema` — Added noContext and contextFrom fields

[^2]: `file:packages/positional-graph/src/interfaces/positional-graph-service.interface.ts:NodeStatusResult` — Added noContext? and contextFrom? fields

[^3]: `file:packages/positional-graph/src/services/positional-graph.service.ts:getNodeStatus` — Exposed noContext/contextFrom from node.config
`file:packages/positional-graph/src/services/positional-graph.service.ts:addNode` — Cherry-picked noContext/contextFrom to persisted settings

[^4]: `file:packages/positional-graph/src/features/030-orchestration/reality.types.ts:NodeReality` — Added noContext? and contextFrom? fields
`file:packages/positional-graph/src/features/030-orchestration/reality.types.ts:ReadinessDetail` — Added contextFromReady? stub

[^5]: `file:packages/positional-graph/src/features/030-orchestration/reality.builder.ts:buildPositionalGraphReality` — Wired noContext/contextFrom from status → reality

[^6]: `file:packages/positional-graph/src/features/030-orchestration/agent-context.ts:getContextSource` — Replaced 5-rule engine with 6-rule implementation

[^7]: `file:test/unit/positional-graph/features/030-orchestration/agent-context.test.ts:getContextSource` — Rewrote 13 tests → 20 tests (R0-R5)

[^8]: `file:packages/positional-graph/src/features/030-orchestration/reality.view.ts:getFirstAgentOnPreviousLine` — Deleted dead method
`file:test/unit/positional-graph/features/030-orchestration/reality.test.ts:getFirstAgentOnPreviousLine` — Removed 4 dead tests

[^9]: `file:packages/positional-graph/src/features/030-orchestration/fake-agent-context.ts:getContextSource` — Verified unchanged (override-map, no rule logic)

[^10]: `file:test/integration/orchestration-drive.test.ts:RUN_INTEGRATION` — Added env var gate
`file:test/integration/positional-graph/node-event-system-e2e.test.ts:RUN_INTEGRATION` — Added env var gate
`file:test/integration/positional-graph/orchestration-e2e.test.ts:RUN_INTEGRATION` — Added env var gate
```

**Step 3**: Add footnote tags to all 11 tasks' Notes column:
```markdown
| Status | ID | Task | ... | Notes |
|--------|------|------|-----|-------|
| [x] | T001 | Add noContext/contextFrom to schema | ... | [^1] |
| [x] | T002 | Add fields to NodeStatusResult | ... | [^2] |
| [x] | T003 | Expose fields in getNodeStatus() + addNode() | ... | [^3] |
| [x] | T004 | Add fields to NodeReality + ReadinessDetail | ... | [^4] |
| [x] | T005 | Wire fields in reality builder | ... | [^5] |
| [x] | T006 | Compile check | ... | (no files modified) |
| [x] | T007 | Write tests for new engine | ... | [^7] |
| [x] | T008 | Replace getContextSource() | ... | [^6] |
| [x] | T009 | Update FakeAgentContextService | ... | [^9] |
| [x] | T010 | Delete dead code | ... | [^8] |
| [x] | T011 | Run full test suite | ... | [^10] |
```

**Validation**:
```bash
# Check footnote sync
grep -n "\[^[0-9]\+\]" docs/plans/039-advanced-e2e-pipeline/advanced-e2e-pipeline-plan.md
grep -n "\[^[0-9]\+\]" docs/plans/039-advanced-e2e-pipeline/tasks/phase-1-context-engine-types-schema-and-rules/tasks.md

# Should see matching numeric [^N] in both files
```

---

### FIX-002: Add Log Anchors to All Tasks

**Severity**: HIGH  
**Files**:
- `docs/plans/039-advanced-e2e-pipeline/tasks/phase-1-context-engine-types-schema-and-rules/tasks.md` (task table Notes column)
- `docs/plans/039-advanced-e2e-pipeline/tasks/phase-1-context-engine-types-schema-and-rules/execution.log.md` (section headers)

**Issue**: All 11 tasks missing `log#anchor` in Notes column; execution log has no anchors

**Expected**: Every completed task has clickable log anchor in Notes; execution log has matching section headers

**Fix**:

**Step 1**: Add section headers to execution log:
```markdown
# Execution Log: Phase 1 — Context Engine — Types, Schema, and Rules

**Plan**: 039-advanced-e2e-pipeline
**Phase**: Phase 1: Context Engine — Types, Schema, and Rules
**Started**: 2026-02-21T04:36:00Z

---

## Entry 1 — Phase 1 Complete (All 11 Tasks) {#entry-1-phase-1-complete}

**Date**: 2026-02-21
**Duration**: Single session
**Result**: ✅ All 11 tasks complete — 274 test files passed, 0 failures

**Dossier Task**: [T001-T011](./tasks.md#tasks)  
**Plan Task**: [Phase 1 Tasks 1.1-1.10](../../advanced-e2e-pipeline-plan.md#phase-1-context-engine--types-schema-and-rules)

### Task Execution Summary

#### T001: Add noContext/contextFrom to schema {#task-t001-add-nocontext-contextfrom-to-schema}

**Status**: ✅ Done  
**Dossier Task**: [T001](./tasks.md#t001)  
**Plan Task**: [1.1](../../advanced-e2e-pipeline-plan.md#phase-1-context-engine--types-schema-and-rules)

Added `noContext: z.boolean().default(false)` and `contextFrom: z.string().min(1).optional()` to `NodeOrchestratorSettingsSchema`.

#### T002: Add fields to NodeStatusResult {#task-t002-add-fields-to-nodestatusresult}

**Status**: ✅ Done  
**Dossier Task**: [T002](./tasks.md#t002)  
**Plan Task**: [1.2](../../advanced-e2e-pipeline-plan.md#phase-1-context-engine--types-schema-and-rules)

Added `noContext?: boolean` and `contextFrom?: string` to `NodeStatusResult` interface.

[Continue for T003-T011...]
```

**Step 2**: Update task table Notes column with log anchors:
```markdown
| Status | ID | Task | ... | Notes |
|--------|------|------|-----|-------|
| [x] | T001 | Add noContext/contextFrom to schema | ... | [^1]; [log](./execution.log.md#task-t001-add-nocontext-contextfrom-to-schema) |
| [x] | T002 | Add fields to NodeStatusResult | ... | [^2]; [log](./execution.log.md#task-t002-add-fields-to-nodestatusresult) |
| [x] | T003 | Expose fields in getNodeStatus() + addNode() | ... | [^3]; [log](./execution.log.md#task-t003-expose-fields-in-getnodestatus-addnode) |
[Continue for T004-T011...]
```

**Validation**:
```bash
# Check all anchors resolve
for i in {001..011}; do
  grep -q "#task-t$i-" docs/plans/039-advanced-e2e-pipeline/tasks/phase-1-context-engine-types-schema-and-rules/execution.log.md || echo "Missing anchor for T$i"
done
```

---

### FIX-003: Add Execution Log Links to Plan

**Severity**: HIGH  
**Files**: `docs/plans/039-advanced-e2e-pipeline/advanced-e2e-pipeline-plan.md` § 6 Phase 1 Tasks table

**Issue**: 10 plan tasks (1.1-1.10, excluding 1.6 which has T006/T007) missing [📋] execution log links in Log column

**Expected**: Every plan task has [📋] link to corresponding execution log anchor

**Fix**:

Update plan task table Log column:
```markdown
| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [x] | Add noContext/contextFrom to schema | 1 | Schema compiles | [📋](./tasks/phase-1-context-engine-types-schema-and-rules/execution.log.md#task-t001-add-nocontext-contextfrom-to-schema) | [^1] |
| 1.2 | [x] | Add fields to NodeStatusResult | 1 | Interface compiles | [📋](./tasks/phase-1-context-engine-types-schema-and-rules/execution.log.md#task-t002-add-fields-to-nodestatusresult) | [^2] |
| 1.3 | [x] | Expose fields in getNodeStatus() | 2 | Fields populated | [📋](./tasks/phase-1-context-engine-types-schema-and-rules/execution.log.md#task-t003-expose-fields-in-getnodestatus-addnode) | [^3] |
[Continue for 1.4-1.10...]
```

**Validation**:
```bash
# Check all plan tasks have log links
grep -c "\[📋\]" docs/plans/039-advanced-e2e-pipeline/advanced-e2e-pipeline-plan.md
# Should return at least 10 (one per task)
```

---

## Priority 2: Correctness (HIGH — Code Defect)

### FIX-004: Add Self-Reference Guard to contextFrom

**Severity**: HIGH  
**File**: `packages/positional-graph/src/features/030-orchestration/agent-context.ts`  
**Lines**: 54-66

**Issue**: `contextFrom` override does not guard against self-reference (`contextFrom === nodeId`), allowing node to inherit context from itself. This creates invalid dependency cycle.

**Expected**: Self-reference detected and rejected with clear reason

**Fix**:

```diff
--- a/packages/positional-graph/src/features/030-orchestration/agent-context.ts
+++ b/packages/positional-graph/src/features/030-orchestration/agent-context.ts
@@ -52,6 +52,11 @@ export function getContextSource(
   // R2: contextFrom override
   if (node.contextFrom) {
+    // Guard: Prevent self-reference (creates dependency cycle)
+    if (node.contextFrom === nodeId) {
+      return { source: 'new', reason: `contextFrom '${node.contextFrom}' cannot reference self — runtime guard` };
+    }
+
     const targetNode = view.getNode(node.contextFrom);
     if (!targetNode || targetNode.unitType !== 'agent') {
       return {
```

**Test** (add to `agent-context.test.ts`):
```typescript
test('R2 guard: contextFrom self-reference rejected', () => {
  // Purpose: Prevent dependency cycle where node waits for itself
  // Quality Contribution: Regression-prone — cycle would hang readiness gate
  const reality = makeRealityFromLines([
    [makeNode('A', { unitType: 'agent', execution: 'serial', contextFrom: 'A' })],
  ]);

  const result = getContextSource(reality, 'A');
  expect(result.source).toBe('new');
  expect(result.reason).toContain('cannot reference self');
});
```

**Validation**:
```bash
# Run tests
pnpm test -- --run agent-context

# Check self-ref guard exists
grep -A 3 "contextFrom === nodeId" packages/positional-graph/src/features/030-orchestration/agent-context.ts
```

---

## Priority 3: Scope & Traceability (HIGH — Process Violations)

### FIX-005: Resolve Scope Creep

**Severity**: HIGH  
**Files**: 7 workshop/spec/docs files in diff

**Issue**: Implementation diff includes planning artifacts (workshop 01, 02, 03, spec, research, plan, symlink) that are not in T001-T011 task target paths

**Expected**: Implementation diff contains only task target files plus tightly-coupled evidence artifacts

**Fix Options**:

**Option A** (Recommended): Split planning from implementation
1. Create separate planning PR with workshop/spec/research docs
2. Rebase implementation commit to exclude planning files
3. Merge planning PR first, then implementation PR

**Option B**: Add explicit task T000 for planning
1. Add Phase 0 task to plan § 6:
   ```markdown
   | 0.1 | [x] | Workshop 03: Simplified Context Model | 2 | 6 rules defined | [📋](...) | Planning task |
   | 0.2 | [x] | Workshop 01: E2E Test Design | 2 | Topology defined | [📋](...) | Planning task |
   | 0.3 | [x] | Create spec and research dossier | 1 | Docs complete | [📋](...) | Planning task |
   ```
2. Add T000 to dossier tasks with target paths including workshop files
3. Justify in "Pre-Implementation Audit" section

**Validation**:
```bash
# Check diff only contains implementation files
git diff --name-only fcdda70^..fcdda70 | grep -v "^docs/plans/039" | grep -v "^docs/how"
# Should return only packages/ and test/ files
```

---

### FIX-006: Document RUN_INTEGRATION Gating

**Severity**: MEDIUM  
**Files**: 3 integration test files

**Issue**: `RUN_INTEGRATION=1` env var gating introduced in T011 without explicit task/acceptance criteria

**Expected**: Deviation documented with rationale

**Fix**:

Add to plan § 14 Deviation Ledger:
```markdown
## 14. Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| ... existing rows ... |
| **R-TEST-001** (all tests run in CI) | Integration tests (orchestration-drive, node-event-system-e2e, orchestration-e2e) were timing out at 210s in CI | Running all integration tests unconditionally | Added `RUN_INTEGRATION=1` env var gate; documented in test file headers; CI job can opt-in via env var |
```

Add T011 note clarifying this was intentional:
```markdown
| [x] | T011 | Run full test suite | 1 | pnpm test all pass; just fft passes | [📋](...) | Added RUN_INTEGRATION=1 gate to 3 integration tests (timeout workaround); see Deviation Ledger |
```

---

### FIX-007: Fix Universal Pattern Violations

**Severity**: HIGH (2) + MEDIUM (1)

#### Part A: Fix Relative Paths in Integration Tests

**Files**:
- `test/integration/positional-graph/node-event-system-e2e.test.ts:38`
- `test/integration/positional-graph/orchestration-e2e.test.ts:39`

**Issue**: Integration tests use `__dirname + ../../..` for cwd (relative path assumption)

**Fix**:
```diff
--- a/test/integration/positional-graph/node-event-system-e2e.test.ts
+++ b/test/integration/positional-graph/node-event-system-e2e.test.ts
@@ -35,7 +35,11 @@ describe.skipIf(!process.env.RUN_INTEGRATION)('Node event system E2E', () => {
       'pnpm exec vitest run --no-coverage test/integration/positional-graph/fixtures/events-e2e-fixture.test.ts',
       {
         stdio: 'pipe',
-        cwd: resolve(__dirname, '../../..'),
+        cwd: process.env.REPO_ROOT_ABS ?? (() => {
+          throw new Error('REPO_ROOT_ABS env var required for integration tests');
+        })(),
         encoding: 'utf-8',
         timeout: 180_000,
       }
```

Apply same pattern to `orchestration-e2e.test.ts`.

**Add to justfile**:
```justfile
# Run integration tests
test-integration:
    REPO_ROOT_ABS={{justfile_directory()}} pnpm test test/integration
```

**Validation**:
```bash
# Check no __dirname + relative traversal
grep -r "resolve(__dirname" test/integration/
# Should return 0 results
```

#### Part B: Fix Deep Relative Imports

**File**: `test/unit/positional-graph/features/030-orchestration/agent-context.test.ts:27-28`

**Issue**: Test uses deep relative imports (`../../../../../packages/...`)

**Fix**:
```diff
--- a/test/unit/positional-graph/features/030-orchestration/agent-context.test.ts
+++ b/test/unit/positional-graph/features/030-orchestration/agent-context.test.ts
@@ -24,8 +24,8 @@
  */
 
 import { describe, test, expect } from 'vitest';
-import { getContextSource } from '../../../../../packages/positional-graph/src/features/030-orchestration/agent-context.js';
-import type { InheritContextResult } from '../../../../../packages/positional-graph/src/features/030-orchestration/agent-context.schema.js';
+import { getContextSource } from '@chainglass/positional-graph/features/030-orchestration/agent-context.js';
+import type { InheritContextResult } from '@chainglass/positional-graph/features/030-orchestration/agent-context.schema.js';
```

**Validation**:
```bash
# Check no deep relative imports
grep -r "\.\./\.\./\.\./\.\./\.\." test/unit/
# Should return 0 results
```

---

## Priority 4: Observability (MEDIUM — Production Debugging)

### FIX-008: Add Error Logging for Invalid contextFrom

**Severity**: HIGH  
**File**: `packages/positional-graph/src/features/030-orchestration/agent-context.ts:4006-4013`

**Issue**: Invalid `contextFrom` silently downgrades to `source: 'new'` with no error/warn log

**Fix**:
```diff
--- a/packages/positional-graph/src/features/030-orchestration/agent-context.ts
+++ b/packages/positional-graph/src/features/030-orchestration/agent-context.ts
@@ -58,6 +58,13 @@ export function getContextSource(
 
     const targetNode = view.getNode(node.contextFrom);
     if (!targetNode || targetNode.unitType !== 'agent') {
+      // Log validation failure for debugging/alerting
+      logger.warn('context_from_invalid', {
+        nodeId,
+        contextFrom: node.contextFrom,
+        lineIndex: node.lineIndex,
+        positionInLine: node.positionInLine,
+      });
       return {
         source: 'new',
         reason: `contextFrom '${node.contextFrom}' invalid (not found or not agent) — runtime guard`,
```

**Prerequisite**: Ensure logger is imported:
```typescript
import { logger } from '../../infrastructure/logging.js'; // Or wherever logger lives
```

**Validation**:
```bash
# Check logger call exists
grep -A 5 "logger.warn.*context_from_invalid" packages/positional-graph/src/features/030-orchestration/agent-context.ts
```

---

### FIX-009: Add Audit Logging for Context Decisions

**Severity**: MEDIUM  
**File**: `packages/positional-graph/src/features/030-orchestration/agent-context.ts:4044-4094`

**Issue**: Global-agent selection and fallback path have no audit log/trace event

**Fix**:
```diff
--- a/packages/positional-graph/src/features/030-orchestration/agent-context.ts
+++ b/packages/positional-graph/src/features/030-orchestration/agent-context.ts
@@ -45,6 +45,7 @@ export function getContextSource(
   // R3: Global agent at position 0
   const globalAgentId = findGlobalAgent(reality);
   if (!globalAgentId || globalAgentId === nodeId) {
+    logger.debug('context_decision', { rule: 'R3', nodeId, globalAgentId, decision: 'new' });
     return { source: 'new', reason: 'Global agent — no prior context' };
   }
 
@@ -85,6 +86,7 @@ export function getContextSource(
   // R5 fallback: No left neighbor — inherit from global agent
   if (!leftNeighborAgent) {
+    logger.debug('context_decision', { rule: 'R5-global-fallback', nodeId, fromNodeId: globalAgentId, decision: 'inherit' });
     return {
       source: 'inherit',
       fromNodeId: globalAgentId,
```

**Validation**:
```bash
# Check debug events exist
grep -c "logger.debug.*context_decision" packages/positional-graph/src/features/030-orchestration/agent-context.ts
# Should return at least 2
```

---

## Priority 5: Performance (Optional — Non-Blocking)

### FIX-010: Cache globalAgentId in Reality Snapshot

**Severity**: MEDIUM  
**Files**:
- `packages/positional-graph/src/features/030-orchestration/reality.types.ts`
- `packages/positional-graph/src/features/030-orchestration/reality.builder.ts`
- `packages/positional-graph/src/features/030-orchestration/agent-context.ts`

**Issue**: `findGlobalAgent()` performs O(N) scan on every `getContextSource()` call, even though global agent is invariant per reality snapshot

**Fix**:

**Step 1**: Add field to NodeReality:
```diff
--- a/packages/positional-graph/src/features/030-orchestration/reality.types.ts
+++ b/packages/positional-graph/src/features/030-orchestration/reality.types.ts
@@ -18,6 +18,7 @@ export interface PositionalGraphReality {
   readonly nodes: Map<string, NodeReality>;
   readonly noContext?: boolean;
   readonly contextFrom?: string;
+  readonly globalAgentId?: string;
 }
```

**Step 2**: Compute once in builder:
```diff
--- a/packages/positional-graph/src/features/030-orchestration/reality.builder.ts
+++ b/packages/positional-graph/src/features/030-orchestration/reality.builder.ts
@@ -53,6 +53,7 @@ export function buildPositionalGraphReality(options: BuildRealityOptions): Posit
     lines,
     nodes,
     transitionMetadata: options.transitionMetadata,
+    globalAgentId: computeGlobalAgentId(lines, nodes),
   };
 }
+
+function computeGlobalAgentId(lines: LineReality[], nodes: Map<string, NodeReality>): string | undefined {
+  for (const line of lines) {
+    for (const nodeId of line.nodeIds) {
+      const node = nodes.get(nodeId);
+      if (node && node.unitType === 'agent' && node.noContext !== true) {
+        return node.nodeId;
+      }
+    }
+  }
+  return undefined;
+}
```

**Step 3**: Use cached value in engine:
```diff
--- a/packages/positional-graph/src/features/030-orchestration/agent-context.ts
+++ b/packages/positional-graph/src/features/030-orchestration/agent-context.ts
@@ -43,7 +43,7 @@ export function getContextSource(
   }
 
   // R3: Global agent at position 0
-  const globalAgentId = findGlobalAgent(reality);
+  const globalAgentId = reality.globalAgentId;
   if (!globalAgentId || globalAgentId === nodeId) {
     logger.debug('context_decision', { rule: 'R3', nodeId, globalAgentId, decision: 'new' });
     return { source: 'new', reason: 'Global agent — no prior context' };
@@ -100,20 +100,6 @@ export function getContextSource(
   };
 }
 
-function findGlobalAgent(reality: PositionalGraphReality): string | undefined {
-  for (const line of reality.lines) {
-    for (const nodeId of line.nodeIds) {
-      const node = reality.nodes.get(nodeId);
-      if (node && node.unitType === 'agent' && node.noContext !== true) {
-        return node.nodeId;
-      }
-    }
-  }
-  return undefined;
-}
-
 // ... rest of file
```

**Validation**:
```bash
# Check findGlobalAgent deleted
grep -c "findGlobalAgent" packages/positional-graph/src/features/030-orchestration/agent-context.ts
# Should return 0

# Check globalAgentId cached
grep "globalAgentId:" packages/positional-graph/src/features/030-orchestration/reality.builder.ts
```

---

## Testing After Fixes

### Validation Commands

```bash
# 1. Graph integrity
just fft  # Must pass
pnpm test  # Must pass (274 files, 0 failures)

# 2. Correctness
pnpm test -- --run agent-context  # Must pass (21/21 after adding self-ref test)
grep -q "contextFrom === nodeId" packages/positional-graph/src/features/030-orchestration/agent-context.ts

# 3. Scope
git log --oneline fcdda70^..fcdda70  # Should show planning PR separate from implementation
grep -c "\[^[0-9]\+\]" docs/plans/039-advanced-e2e-pipeline/tasks/phase-1-context-engine-types-schema-and-rules/tasks.md  # Should return 11

# 4. Observability
grep -c "logger.warn.*context_from_invalid" packages/positional-graph/src/features/030-orchestration/agent-context.ts  # Should return 1

# 5. Universal patterns
grep -r "resolve(__dirname" test/integration/  # Should return 0
grep -r "\.\./\.\./\.\./\.\./\.\." test/unit/  # Should return 0
```

---

## Summary

**Total Fixes**: 10 fix tasks (4 CRITICAL, 4 HIGH, 2 MEDIUM)

**Estimated Effort**: 2-3 hours
- Priority 1 (graph integrity): 1 hour (mostly mechanical ledger sync)
- Priority 2 (correctness): 15 minutes (simple guard + test)
- Priority 3 (scope): 30 minutes (git rebase or add T000)
- Priority 4 (observability): 30 minutes (add logger calls)
- Priority 5 (performance): 30 minutes (cache optimization)

**Order of Execution**:
1. FIX-001, FIX-002, FIX-003 (graph integrity) — Required for merge
2. FIX-004 (self-ref guard) — Required for merge
3. FIX-005, FIX-006, FIX-007 (scope/patterns) — Required for merge
4. FIX-008, FIX-009 (observability) — Recommended before merge
5. FIX-010 (performance) — Optional post-merge

**Re-Review**: Run `plan-7-code-review` again after applying Priority 1-3 fixes to verify all CRITICAL and HIGH findings resolved.

---

**End of Fix Tasks**
