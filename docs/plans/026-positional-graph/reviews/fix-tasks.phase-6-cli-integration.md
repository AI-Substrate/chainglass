# Phase 6: CLI Integration — Fix Tasks

**Plan**: 026-positional-graph
**Phase**: Phase 6: CLI Integration
**Generated**: 2026-02-02
**Testing Approach**: Smoke testing for fixes (service layer fully tested)

---

## Priority Order

Fix tasks are ordered by severity: CRITICAL → HIGH → MEDIUM → LOW

---

## Blocking Fixes (Must Fix Before Merge)

### FIX-001: Add Input Validation for Enum Arguments (HIGH)

**Finding**: CORR-001
**File**: `apps/cli/src/commands/positional-graph.command.ts`
**Lines**: 177-181, 250-251, 325-326, 441-442

**Issue**: `options.transition` and `options.execution` are cast as `'auto' | 'manual'` or `'serial' | 'parallel'` without validating the actual values.

**Fix**:
```typescript
// Add at top of file
const VALID_TRANSITIONS = ['auto', 'manual'] as const;
const VALID_EXECUTIONS = ['serial', 'parallel'] as const;

function validateTransition(value: string | undefined): 'auto' | 'manual' | undefined {
  if (value === undefined) return undefined;
  if (!VALID_TRANSITIONS.includes(value as typeof VALID_TRANSITIONS[number])) {
    return undefined; // Will be caught by service validation
  }
  return value as 'auto' | 'manual';
}

function validateExecution(value: string | undefined): 'serial' | 'parallel' | undefined {
  if (value === undefined) return undefined;
  if (!VALID_EXECUTIONS.includes(value as typeof VALID_EXECUTIONS[number])) {
    return undefined; // Will be caught by service validation
  }
  return value as 'serial' | 'parallel';
}

// Then in handlers, replace:
transition: options.transition as 'auto' | 'manual' | undefined
// With:
transition: validateTransition(options.transition)

// And replace:
execution: options.execution as 'serial' | 'parallel' | undefined
// With:
execution: validateExecution(options.execution)
```

**Validation**: Run `cg wf line set-transition test-graph line-xxx invalid` — should return service error, not crash.

---

### FIX-002: Add NaN Checks for Number.parseInt (HIGH)

**Finding**: CORR-002
**File**: `apps/cli/src/commands/positional-graph.command.ts`
**Lines**: 177, 224, 323, 370

**Issue**: `Number.parseInt()` returns NaN for invalid input, which is silently passed to service.

**Fix**:
```typescript
// Add helper function
function parseIntOrUndefined(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

// Replace all occurrences of:
options.atIndex !== undefined ? Number.parseInt(options.atIndex, 10) : undefined
// With:
parseIntOrUndefined(options.atIndex)

// Same for atPosition and toIndex
```

**Validation**: Run `cg wf line add test-graph --at-index abc` — should return clear error, not NaN behavior.

---

### FIX-003: Add Log Anchors to Task Notes (HIGH)

**Finding**: LINK-001-010
**File**: `docs/plans/026-positional-graph/tasks/phase-6-cli-integration/tasks.md`

**Issue**: All 10 tasks are marked complete but lack log anchors in Notes column.

**Fix**: Update task table Notes column with execution log anchors:

| Task | Notes (Add) |
|------|-------------|
| T001 | `[📋](execution.log.md#tasks-t001-t004-command-implementations)` |
| T002 | `[📋](execution.log.md#tasks-t001-t004-command-implementations)` |
| T003 | `[📋](execution.log.md#tasks-t001-t004-command-implementations)` |
| T004 | `[📋](execution.log.md#tasks-t001-t004-command-implementations)` |
| T005 | `[📋](execution.log.md#task-t005--t006-di-registration--iworkunitloader-bridge)` |
| T006 | `[📋](execution.log.md#task-t005--t006-di-registration--iworkunitloader-bridge)` |
| T007 | `[📋](execution.log.md#task-t007-console-output-formatters)` |
| T008 | `[📋](execution.log.md#task-t008-json-output-verification)` |
| T009 | `[📋](execution.log.md#task-t009-quality-gate)` |
| T010 | `[📋](execution.log.md#task-t010-extract-shared-cli-command-helpers)` |

**Validation**: Links should navigate to correct execution log section.

---

## Recommended Fixes (Should Fix)

### FIX-004: Require --from-unit OR --from-node (MEDIUM)

**Finding**: CORR-003
**File**: `apps/cli/src/commands/positional-graph.command.ts`
**Lines**: 464-466

**Issue**: `options.fromUnit ?? ''` defaults to empty string when neither option provided.

**Fix**:
```typescript
// In handleNodeSetInput, add validation:
async function handleNodeSetInput(
  graphSlug: string,
  nodeId: string,
  inputName: string,
  options: SetInputOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Add validation for source requirement
  if (!options.fromUnit && !options.fromNode) {
    const result = { errors: [{
      code: 'E074',
      message: 'Missing input source',
      action: 'Provide either --from-unit <slug> or --from-node <nodeId>',
    }]};
    console.log(adapter.format('wf.node.set-input', result));
    process.exit(1);
  }

  // ... rest of handler
}
```

**Validation**: Run `cg wf node set-input g n i --output out` — should error with clear message.

---

### FIX-005: Add ok:false Check in handleNodeCollate (MEDIUM)

**Finding**: CORR-007
**File**: `apps/cli/src/commands/positional-graph.command.ts`
**Lines**: 512-516

**Issue**: `handleNodeCollate` doesn't exit with error code when `inputPack.ok === false`.

**Fix**:
```typescript
async function handleNodeCollate(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  // ... existing context resolution ...

  const service = getPositionalGraphService();
  const inputPack = await service.collateInputs(ctx, graphSlug, nodeId);
  
  // Wrap InputPack into a BaseResult-compatible shape for the adapter
  const result = { ...inputPack, errors: [] as { code: string; message: string }[] };
  console.log(adapter.format('wf.node.collate', result));

  // Add error check
  if (!inputPack.ok) {
    process.exit(1);
  }
}
```

**Validation**: Run `cg wf node collate` on node with unresolved inputs — should exit(1).

---

### FIX-006: Document resolveOrOverrideContext Test Coverage (MEDIUM)

**Finding**: TEST-001
**File**: `docs/plans/026-positional-graph/tasks/phase-6-cli-integration/execution.log.md`

**Issue**: `resolveOrOverrideContext` is listed as needing tests but has 0 unit tests.

**Fix Option A** (Add tests):
```typescript
// In test/unit/cli/command-helpers.test.ts, add:
describe('resolveOrOverrideContext', () => {
  // These require FakeWorkspaceService or integration setup
  it.skip('should resolve context from CWD when in workspace', async () => {
    // Integration test - requires real filesystem setup
  });

  it.skip('should override context with explicit path', async () => {
    // Integration test - requires real filesystem setup  
  });

  it.skip('should return null when not in workspace', async () => {
    // Integration test - requires non-workspace directory
  });
});
```

**Fix Option B** (Document coverage):
Add to execution.log.md under T010:
```markdown
**Note**: `resolveOrOverrideContext` testing is covered by T008 smoke tests and Phase 7 integration tests. Unit testing requires WorkspaceService integration which is out of scope for CLI helper unit tests.
```

**Validation**: Either tests exist or documentation explains coverage.

---

## Optional Improvements

### FIX-007: Exit Code for Stalled Workflows (LOW)

**Finding**: CORR-006
**File**: `apps/cli/src/commands/positional-graph.command.ts`
**Lines**: 550-552

**Issue**: `wf status` with 0 ready nodes and status !== 'complete' exits 0.

**Fix** (optional):
```typescript
if (result.readyNodes.length === 0 && result.status !== 'complete') {
  // Workflow is stalled (not complete but nothing can run)
  process.exit(2); // Distinct exit code for stalled state
}
```

**Validation**: Check exit code behavior matches expected semantics.

---

## Verification

After applying fixes, run:

```bash
# 1. Quality gate
just check

# 2. Smoke tests
cg wf create test-fix
cg wf line add test-fix --at-index abc     # Should error cleanly (FIX-002)
cg wf line set-transition test-fix line-xxx invalid  # Should error (FIX-001)
cg wf delete test-fix

# 3. Re-run review
/plan-7-code-review --phase "Phase 6: CLI Integration" --plan <path>
```

---

*Fix tasks generated by plan-7-code-review*
