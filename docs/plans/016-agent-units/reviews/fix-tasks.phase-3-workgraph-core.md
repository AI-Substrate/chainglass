# Phase 3: WorkGraph Core - Fix Tasks

**Review**: [review.phase-3-workgraph-core.md](./review.phase-3-workgraph-core.md)
**Date**: 2026-01-27
**Status**: REQUEST_CHANGES

---

## Overview

This document contains actionable fix tasks for the Phase 3 code review findings. Tasks are ordered by severity (CRITICAL first), with test-first approach per Full TDD testing strategy.

---

## FIX-001: Add Slug Validation to Read Operations [CRITICAL]

**Finding**: SEC-001
**Severity**: CRITICAL
**File**: `packages/workgraph/src/services/workgraph.service.ts`
**Lines**: 144, 235, 306

### Problem

`load()`, `show()`, and `status()` methods accept slug parameter without validation, enabling path traversal attacks.

### Fix Steps (TDD Approach)

#### Step 1: Write Failing Tests (RED)

Add tests to `test/unit/workgraph/workgraph-service.test.ts`:

```typescript
describe('load()', () => {
  it('should return E104 for path traversal in load()', async () => {
    /*
    Test Doc:
    - Why: Per Discovery 10 - path security in all methods
    - Contract: load('../evil') returns E104 error
    - Usage Notes: Validates slug BEFORE path construction
    - Quality Contribution: Prevents arbitrary file read
    - Worked Example: load('../etc') → { errors: [{ code: 'E104' }] }
    */
    const result = await ctx.service.load('../etc');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E104');
    expect(result.graph).toBeUndefined();
  });
});

describe('show()', () => {
  it('should return E104 for path traversal in show()', async () => {
    const result = await ctx.service.show('../etc');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E104');
  });
});

describe('status()', () => {
  it('should return E104 for path traversal in status()', async () => {
    const result = await ctx.service.status('../etc');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E104');
  });
});
```

#### Step 2: Implement Fix (GREEN)

**File**: `packages/workgraph/src/services/workgraph.service.ts`

**Patch for load() (line 144)**:
```diff
   async load(slug: string): Promise<GraphLoadResult> {
+    // Validate slug format and security (per Discovery 10)
+    if (!this.isValidSlug(slug)) {
+      return {
+        graph: undefined,
+        status: undefined,
+        errors: [invalidGraphSlugError(slug)],
+      };
+    }
+
     const graphPath = this.pathResolver.join(this.graphsDir, slug);
```

**Patch for show() (line 235)**:
```diff
   async show(slug: string): Promise<GraphShowResult> {
+    // Validate slug format and security (per Discovery 10)
+    if (!this.isValidSlug(slug)) {
+      return {
+        graphSlug: slug,
+        tree: { id: 'start', type: 'start', children: [] },
+        errors: [invalidGraphSlugError(slug)],
+      };
+    }
+
     // Load graph first
     const loadResult = await this.load(slug);
```

**Patch for status() (line 306)**:
```diff
   async status(slug: string): Promise<GraphStatusResult> {
+    // Validate slug format and security (per Discovery 10)
+    if (!this.isValidSlug(slug)) {
+      return {
+        graphSlug: slug,
+        graphStatus: 'pending',
+        nodes: [],
+        errors: [invalidGraphSlugError(slug)],
+      };
+    }
+
     const graphPath = this.pathResolver.join(this.graphsDir, slug);
```

#### Step 3: Verify (REFACTOR)

```bash
pnpm vitest run test/unit/workgraph/workgraph-service.test.ts
# All tests should pass including new path traversal tests
```

---

## FIX-002: Return Error Results from Unimplemented Methods [CRITICAL]

**Finding**: COR-001
**Severity**: CRITICAL
**File**: `packages/workgraph/src/services/workgraph.service.ts`
**Lines**: 434, 451

### Problem

`addNodeAfter()` and `removeNode()` throw exceptions instead of returning error results, violating Critical Discovery 02.

### Fix Steps

#### Step 1: Add Error Factory (if not exists)

Check if `unimplementedFeatureError` exists in `packages/workgraph/src/errors/workgraph-errors.ts`. If not, add:

```typescript
/**
 * Create error for unimplemented features.
 * Per CD02: Methods should return errors, not throw.
 *
 * @param feature - Feature name (e.g., 'addNodeAfter')
 * @param targetPhase - Phase where feature will be implemented
 * @returns ResultError with code E199
 */
export function unimplementedFeatureError(
  feature: string,
  targetPhase: string
): ResultError {
  return {
    code: 'E199',
    message: `Feature '${feature}' is not yet implemented`,
    details: `This feature is planned for ${targetPhase}. Current phase does not include this functionality.`,
    action: `Wait for ${targetPhase} implementation or check plan for timeline.`,
  };
}
```

#### Step 2: Apply Fix

**Patch for addNodeAfter() (line 427-435)**:
```diff
   async addNodeAfter(
     graphSlug: string,
     afterNodeId: string,
     unitSlug: string,
     options?: AddNodeOptions
   ): Promise<AddNodeResult> {
-    // TODO: Implement in Phase 4
-    throw new Error('Not implemented');
+    // Per CD02: Return error result, not throw
+    // TODO: Implement in Phase 4
+    return {
+      nodeId: '',
+      inputs: {},
+      errors: [unimplementedFeatureError('addNodeAfter', 'Phase 4')],
+    };
   }
```

**Patch for removeNode() (line 444-452)**:
```diff
   async removeNode(
     graphSlug: string,
     nodeId: string,
     options?: RemoveNodeOptions
   ): Promise<RemoveNodeResult> {
-    // TODO: Implement in Phase 4
-    throw new Error('Not implemented');
+    // Per CD02: Return error result, not throw
+    // TODO: Implement in Phase 4
+    return {
+      removedNodes: [],
+      errors: [unimplementedFeatureError('removeNode', 'Phase 4')],
+    };
   }
```

#### Step 3: Update Import

Add to imports at top of file if using new error factory:
```typescript
import {
  graphAlreadyExistsError,
  graphNotFoundError,
  invalidGraphSlugError,
  schemaValidationError,
  yamlParseError,
  unimplementedFeatureError,  // Add this
} from '../errors/index.js';
```

---

## FIX-003: Use Atomic Writes in create() [HIGH]

**Finding**: SEC-002
**Severity**: HIGH
**File**: `packages/workgraph/src/services/workgraph.service.ts`
**Lines**: 98, 110

### Problem

`create()` uses `fs.writeFile()` directly instead of atomic write utilities.

### Fix Steps

#### Step 1: Add Import

```diff
 import { YamlParseError } from '@chainglass/shared';
+import { atomicWriteFile, atomicWriteJson } from './atomic-file.js';
```

#### Step 2: Apply Fix

**Patch for lines 97-113**:
```diff
     // Create work-graph.yaml with start node
     const graphDefinition = {
       slug,
       version: '1.0.0',
       created_at: new Date().toISOString(),
       nodes: ['start'],
       edges: [],
     };
     const graphYaml = this.yamlParser.stringify(graphDefinition);
-    await this.fs.writeFile(this.pathResolver.join(graphPath, 'work-graph.yaml'), graphYaml);
+    await atomicWriteFile(this.fs, this.pathResolver.join(graphPath, 'work-graph.yaml'), graphYaml);

     // Create state.json with start node complete (per DYK#1)
     const stateData = {
       graph_status: 'pending',
       updated_at: new Date().toISOString(),
       nodes: {
         start: {
           status: 'complete',
         },
       },
     };
-    await this.fs.writeFile(
-      this.pathResolver.join(graphPath, 'state.json'),
-      JSON.stringify(stateData, null, 2)
-    );
+    await atomicWriteJson(this.fs, this.pathResolver.join(graphPath, 'state.json'), stateData);
```

---

## FIX-004: Add Start Node Special Case in status() [HIGH]

**Finding**: COR-002
**Severity**: HIGH
**File**: `packages/workgraph/src/services/workgraph.service.ts`
**Lines**: 376-387

### Problem

`status()` returns `'ready'` for start node if stored status is missing. Per DYK#1, start should always be `'complete'`.

### Fix Steps

#### Step 1: Write Failing Test (RED)

```typescript
it('should return complete for start node even without stored status', async () => {
  /*
  Test Doc:
  - Why: Per DYK#1 - start node is always complete
  - Contract: status() returns 'complete' for start even if state.json missing
  - Usage Notes: Start is a gate, not work
  - Quality Contribution: Robust status computation
  - Worked Example: Graph with missing state → start still 'complete'
  */
  // Setup graph with no state.json
  const graphPath = '.chainglass/work-graphs/no-state';
  ctx.fs.setDir(graphPath);
  ctx.fs.setFile(`${graphPath}/work-graph.yaml`, SAMPLE_EMPTY_GRAPH_YAML);
  ctx.yamlParser.setPresetParseResult(SAMPLE_EMPTY_GRAPH_YAML, PARSED_EMPTY_GRAPH);
  // Note: NO state.json file

  const result = await ctx.service.status('my-workflow');

  const startNode = result.nodes.find(n => n.id === 'start');
  expect(startNode?.status).toBe('complete');  // Not 'ready'
});
```

#### Step 2: Apply Fix (GREEN)

**Patch for lines 376-387**:
```diff
       // Use stored status if present, otherwise compute
       let nodeStatus: NodeStatus;
-      if (storedNode) {
+      if (nodeId === 'start') {
+        // Start node is always complete (per DYK#1)
+        nodeStatus = 'complete';
+      } else if (storedNode) {
         nodeStatus = storedNode.status as NodeStatus;
       } else {
```

---

## FIX-005: Correct Test Comment [LOW]

**Finding**: DOC-001
**Severity**: LOW
**File**: `test/unit/workgraph/workgraph-service.test.ts`
**Line**: 329

### Fix

```diff
     it('should return E106 for duplicate slug', async () => {
       /*
       Test Doc:
       - Why: Error handling - prevent graph overwrite
-      - Contract: create(existingSlug) returns { errors: [{ code: 'E106' }] }
-      - Usage Notes: E106 = "Invalid graph structure" repurposed as "graph exists"
+      - Contract: create(existingSlug) returns { errors: [{ code: 'E105' }] }
+      - Usage Notes: E105 = graphAlreadyExistsError
```

---

## Verification Checklist

After applying all fixes:

- [ ] Run all tests: `pnpm vitest run test/unit/workgraph test/integration/workgraph`
- [ ] Type check: `just typecheck`
- [ ] Lint: `just lint`
- [ ] Re-run code review: `/plan-7-code-review --phase "Phase 3: WorkGraph Core"`

---

## Summary

| Fix ID | Severity | Effort | Tests Required |
|--------|----------|--------|----------------|
| FIX-001 | CRITICAL | 10 min | 3 new tests |
| FIX-002 | CRITICAL | 5 min | 0 (already stubbed) |
| FIX-003 | HIGH | 5 min | 0 (existing tests cover) |
| FIX-004 | HIGH | 5 min | 1 new test |
| FIX-005 | LOW | 1 min | 0 |

**Total Estimated Time**: 30 minutes

---

*Fix tasks generated 2026-01-27*
