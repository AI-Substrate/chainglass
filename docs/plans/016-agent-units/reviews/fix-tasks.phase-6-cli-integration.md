# Phase 6: CLI Integration – Fix Tasks

**Review**: [review.phase-6-cli-integration.md](./review.phase-6-cli-integration.md)
**Status**: REQUEST_CHANGES
**Priority**: Fix CRITICAL → HIGH before merge

---

## Fix Tasks (Ordered by Severity)

### FIX-001: State Mutation in Query Command (CRITICAL)

**Issue**: `handleNodeCanEnd()` calls `service.end()` which actually ends the node instead of just checking.

**File**: `apps/cli/src/commands/workgraph.command.ts`
**Lines**: 323-347

**Current Code**:
```typescript
async function handleNodeCanEnd(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const service = getWorkNodeService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.end(graphSlug, nodeId);  // BUG!
  // ...
}
```

**Fix Steps**:

1. Add `canEnd()` method to IWorkNodeService interface:
```typescript
// packages/workgraph/src/interfaces/worknode-service.interface.ts
canEnd(graphSlug: string, nodeId: string): Promise<CanEndResult>;
```

2. Add CanEndResult type:
```typescript
// packages/workgraph/src/types/result.types.ts
export interface CanEndResult extends BaseResult {
  nodeId: string;
  canEnd: boolean;
  missingOutputs?: string[];
}
```

3. Implement canEnd() in WorkNodeService:
```typescript
// packages/workgraph/src/services/worknode.service.ts
async canEnd(graphSlug: string, nodeId: string): Promise<CanEndResult> {
  const errors: ResultError[] = [];
  
  const graph = await this.workGraphService.load(graphSlug);
  if (graph.errors.length > 0) {
    return { nodeId, canEnd: false, missingOutputs: [], errors: graph.errors };
  }
  
  const node = graph.graph?.nodes.find(n => n.id === nodeId);
  if (!node) {
    errors.push({ code: 'E101', message: `Node not found: ${nodeId}`, action: '...' });
    return { nodeId, canEnd: false, missingOutputs: [], errors };
  }
  
  // Check if node is in valid state to end (running or waiting-answer)
  if (!['running', 'waiting-answer'].includes(node.status)) {
    errors.push({ code: 'E114', message: `Node cannot end from status: ${node.status}`, action: '...' });
    return { nodeId, canEnd: false, missingOutputs: [], errors };
  }
  
  // Check for missing required outputs
  const missingOutputs = await this.findMissingRequiredOutputs(graphSlug, nodeId, node);
  
  return {
    nodeId,
    canEnd: missingOutputs.length === 0,
    missingOutputs,
    errors: []
  };
}
```

4. Update handleNodeCanEnd() to use new method:
```typescript
async function handleNodeCanEnd(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const service = getWorkNodeService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.canEnd(graphSlug, nodeId);  // NEW: Query, not mutation
  const output = adapter.format('wg.node.can-end', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}
```

5. Update FakeWorkNodeService with canEnd() method

6. Add unit tests for canEnd() behavior

**Validation**: Run `pnpm test test/unit/workgraph/worknode-service.test.ts`

---

### FIX-002: DI Token Mismatch (HIGH)

**Issue**: Uses string literals instead of DI token constants.

**File**: `apps/cli/src/commands/workgraph.command.ts`
**Lines**: 236-237

**Current Code**:
```typescript
const fs = container.resolve<import('@chainglass/shared').IFileSystem>('IFileSystem');
const pathResolver =
  container.resolve<import('@chainglass/shared').IPathResolver>('IPathResolver');
```

**Fixed Code**:
```typescript
import {
  ConsoleOutputAdapter,
  type IFileSystem,       // ADD
  type IOutputAdapter,
  type IPathResolver,     // ADD
  JsonOutputAdapter,
  SHARED_DI_TOKENS,       // ADD
  WORKGRAPH_DI_TOKENS,
} from '@chainglass/shared';

// ...

async function handleNodeExec(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);
  const container = createCliProductionContainer();

  // Get services needed for bootstrap prompt
  const fs = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
  // ...
}
```

**Validation**: Run `pnpm typecheck && pnpm lint`

---

### FIX-003: Missing Error Handling in Async Actions (HIGH)

**Issue**: All async action handlers lack try-catch blocks.

**Files**:
- `apps/cli/src/commands/unit.command.ts` (lines 181-211)
- `apps/cli/src/commands/workgraph.command.ts` (lines 561-767)

**Fix Option A (Individual)**: Wrap each action in try-catch:
```typescript
unit
  .command('list')
  .description('List all available units')
  .option('--json', 'Output as JSON', false)
  .action(async (options: ListOptions) => {
    try {
      await handleUnitList(options);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
```

**Fix Option B (Wrapper Pattern - Recommended)**:

Add helper at top of each command file:
```typescript
function wrapAction<T extends unknown[]>(
  handler: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await handler(...args);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  };
}
```

Then use it:
```typescript
unit
  .command('list')
  .action(wrapAction(async (options: ListOptions) => {
    await handleUnitList(options);
  }));
```

**Validation**: Manually test with invalid inputs that might throw

---

### FIX-004: Path Traversal Validation (MEDIUM)

**Issue**: `sourcePath` not validated for path traversal.

**File**: `apps/cli/src/commands/workgraph.command.ts`
**Lines**: 467-485

**Add Validation**:
```typescript
async function handleNodeSaveOutputFile(
  graphSlug: string,
  nodeId: string,
  outputName: string,
  sourcePath: string,
  options: BaseOptions
): Promise<void> {
  // Path traversal validation
  if (sourcePath.includes('..')) {
    console.error('Error: Path traversal (..) not allowed in source path');
    process.exit(1);
  }
  
  const service = getWorkNodeService();
  // ... rest of implementation
}
```

**Note**: The underlying service also validates, but defense-in-depth at CLI layer is recommended.

---

## Recommended Fixes (Non-blocking)

### REC-001: Add Footnotes to Task Table

Update `tasks/phase-6-cli-integration/tasks.md`:
- Add `[^1]` to T001 Notes (console-output.adapter.ts)
- Add `[^2]` to T002-T006 Notes (unit.command.ts)
- Add `[^3]` to T007-T016 Notes (workgraph.command.ts)
- Update Phase Footnote Stubs section with entries
- Update plan § 10 Change Footnotes Ledger

### REC-002: Improve Test Coverage

Add explicit tests for:
- `cg wg show` tree format output
- `cg wg status` table output
- `cg wg node remove --cascade`
- `cg wg node exec` bootstrap prompt generation
- Node lifecycle transitions

---

## Completion Checklist

- [ ] FIX-001: Add canEnd() method (CRITICAL)
- [ ] FIX-002: Replace string tokens with constants (HIGH)
- [ ] FIX-003: Add try-catch wrappers (HIGH)
- [ ] FIX-004: Add path traversal validation (MEDIUM)
- [ ] Run `pnpm test` (all 177+ tests pass)
- [ ] Run `pnpm typecheck && pnpm lint`
- [ ] Re-run code review for final approval

---

*Generated by plan-7-code-review*
