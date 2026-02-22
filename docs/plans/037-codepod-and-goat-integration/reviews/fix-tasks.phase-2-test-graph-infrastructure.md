# Phase 2: Test Graph Infrastructure — Fix Tasks

**Review Date**: 2026-02-18
**Priority**: CRITICAL → HIGH → MEDIUM → LOW
**Testing Approach**: Full TDD (test-first for all fixes)

---

## CRITICAL Priority (Must Fix Before Merge)

### CRIT-01: Re-sequence T006/T008 with RED-GREEN-REFACTOR Evidence

**Severity**: CRITICAL | **Finding**: TDD-001  
**File**: docs/plans/037-codepod-and-goat-integration/tasks/phase-2-test-graph-infrastructure/execution.log.md

**Issue**: T006 (makeScriptsExecutable) and T008 (completeUserInputNode) were implemented (07:27-07:28) before RED smoke test (07:29), violating test-first discipline.

**Fix**:
1. Write failing tests for makeScriptsExecutable:
   ```typescript
   // test/unit/dev/test-graphs/shared/helpers.test.ts
   it('should chmod +x all .sh files in directory tree', async () => {
     // Create temp dir with .sh files with 0o644
     // Call makeScriptsExecutable(dir)
     // Expect: AssertionError - files still 0o644
   });
   ```
2. Run test, capture RED output (test fails)
3. Implement makeScriptsExecutable to make test GREEN
4. Write failing tests for completeUserInputNode:
   ```typescript
   it('should raise node:accepted with source human', async () => {
     // Setup: node in user-input status
     // Call completeUserInputNode(service, ctx, slug, nodeId, outputs)
     // Expect: AssertionError - event not raised
   });
   ```
5. Run test, capture RED output
6. Implement completeUserInputNode to make test GREEN
7. REFACTOR: Extract common patterns, run tests again
8. Update execution.log.md with full RED→GREEN→REFACTOR cycle for each helper

**Validation**: Both helpers have dedicated failing tests, implementation makes tests pass, REFACTOR documented.

---

### CRIT-02: Add RED Tests for Assertion Library (T007)

**Severity**: CRITICAL | **Finding**: TDD-002  
**File**: dev/test-graphs/shared/assertions.ts

**Issue**: Assertion library implemented without test-first evidence. No tests prove assertions work or validate their error messages.

**Fix**:
1. Write failing tests for assertGraphComplete:
   ```typescript
   // test/unit/dev/test-graphs/shared/assertions.test.ts
   it('should throw when graph is not complete', async () => {
     // Setup: graph in 'in-progress' status
     // Expect: assertGraphComplete throws with message including graph slug + status
   });
   
   it('should not throw when graph is complete', async () => {
     // Setup: graph in 'complete' status
     // Expect: no throw
   });
   ```
2. Repeat for assertNodeComplete and assertOutputExists
3. Run tests, capture RED output (tests fail - assertions don't exist yet)
4. Implement assertions to make tests GREEN
5. REFACTOR: Improve error messages, extract common patterns
6. Update execution.log.md with RED→GREEN→REFACTOR cycle

**Validation**: All 3 assertions have passing tests covering success and failure cases.

---

### CRIT-03: Document REFACTOR Phase for All Tasks

**Severity**: CRITICAL (TDD completeness) | **Finding**: TDD-003  
**File**: docs/plans/037-codepod-and-goat-integration/tasks/phase-2-test-graph-infrastructure/execution.log.md

**Issue**: Execution log shows RED and GREEN sections but no REFACTOR phase for any task, violating complete TDD cycle.

**Fix**:
For each task (T001-T009), add REFACTOR section:
```markdown
## Task TXXX: [Task Name]
...
### GREEN Evidence
[existing content]

### REFACTOR Phase
**What was refactored**: [Describe cleanup/improvements]
- Extracted common pattern X into helper Y
- Simplified error handling in Z
- Renamed variable A to B for clarity

**Test re-run**:
```bash
pnpm test -- --run test/path/to/test.ts
```
**Output**: ✅ All tests still pass after refactor
```

**Validation**: All 9 tasks have REFACTOR section with test re-run proof.

---

### CRIT-04: Add Task↔Log Bidirectional Links (18 Missing)

**Severity**: HIGH (graph integrity) | **Finding**: LINK-001  
**File**: docs/plans/037-codepod-and-goat-integration/tasks/phase-2-test-graph-infrastructure/execution.log.md

**Issue**: All execution log entries missing **Dossier Task** and **Plan Task** markdown backlinks, breaking bidirectional navigation.

**Fix**:
Update execution log metadata for all 9 entries:

```markdown
## Task T001: [Task Name]
**Dossier Task**: [T001](./tasks.md#t001) | **Plan Task**: [2.1](../../codepod-and-goat-integration-plan.md#phase-2-test-graph-infrastructure)
**Started**: 2026-02-18T07:20Z
**Status**: ✅ Complete
```

Repeat for T002-T009 with correct task IDs and plan section anchors.

**Note**: T006/T008 combined log heading requires special handling (see CRIT-05).

**Validation**: Every log entry has clickable Dossier Task and Plan Task links that navigate correctly.

---

### CRIT-05: Fix T006/T008 Log Anchor Mismatches

**Severity**: HIGH (graph integrity) | **Finding**: LINK-002  
**File**: docs/plans/037-codepod-and-goat-integration/tasks/phase-2-test-graph-infrastructure/tasks.md

**Issue**: Tasks table has separate log anchors for T006 and T008, but execution log has combined heading "Task T006: makeScriptsExecutable + T008: completeUserInputNode".

**Fix Option A** (Recommended - Split log headings):
```markdown
## Task T006: makeScriptsExecutable
**Dossier Task**: [T006](./tasks.md#t006) | **Plan Task**: [2.6](...)
[T006 implementation details]

## Task T008: completeUserInputNode
**Dossier Task**: [T008](./tasks.md#t008) | **Plan Task**: [2.5](...)
[T008 implementation details]
```

**Fix Option B** (Update task table anchors):
Update tasks.md Notes column for T006 and T008:
```markdown
| T006 | [x] | makeScriptsExecutable | ... | log#task-t006-makescriptsexecutable-t008-completeuserinputnode | [^8] |
| T008 | [x] | completeUserInputNode | ... | log#task-t006-makescriptsexecutable-t008-completeuserinputnode | [^10] |
```

**Validation**: Click log links in tasks table for T006 and T008 - both navigate to correct log entries.

---

### CRIT-06: Fix TypeScript Compilation Errors

**Severity**: HIGH (blocking build) | **Finding**: TYPE-001, TYPE-002

**TYPE-001**: graph-test-runner.ts:49 - Expected 2 arguments, got 1
```typescript
// Line 49 (current - BROKEN):
await mkdir(unitsTarget);

// Fix:
await mkdir(unitsTarget, { recursive: true });
```

**TYPE-002**: helpers.ts:19 - Property 'path' does not exist on type 'Dirent<string>'
```typescript
// Line 19 (current - BROKEN):
if (entry.isFile() && entry.name.endsWith('.sh')) {
  const scriptPath = entry.path;  // ❌ 'path' doesn't exist on Dirent
  await chmod(scriptPath, 0o755);
}

// Fix:
if (entry.isFile() && entry.name.endsWith('.sh')) {
  const scriptPath = path.join(dir, entry.name);  // ✅ Construct path manually
  await chmod(scriptPath, 0o755);
}
```

**Validation**: `pnpm run typecheck` exits with code 0, no errors.

---

## HIGH Priority (Must Fix)

### HIGH-01: Implement WorkspaceService Lifecycle in withTestGraph

**Severity**: HIGH | **Finding**: SEM-001, UNI-002, AC-11  
**Files**: dev/test-graphs/shared/graph-test-runner.ts:108-167

**Issue**: withTestGraph creates temp workspace but never registers it via WorkspaceService.add/remove, violating AC-11 and causing Phase 3/4 tests to diverge from production workspace lookup flow.

**Fix**:
```typescript
// Current (BROKEN):
export async function withTestGraph(
  fixtureName: string,
  testFn: (context: TestGraphContext) => Promise<void>
): Promise<void> {
  const tmpDir = await mkdtemp(path.join(tmpdir(), `tg-${fixtureName}-`));
  try {
    // ... copy units, build loader ...
    const stack = await createTestServiceStack(`tg-${fixtureName}`, loader);
    const tgc: TestGraphContext = {
      ctx: { workspaceSlug: `tg-${fixtureName}`, workspacePath: tmpDir, ... },
      service: stack.service,
      workspacePath: tmpDir
    };
    await testFn(tgc);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

// Fixed:
export async function withTestGraph(
  fixtureName: string,
  testFn: (context: TestGraphContext) => Promise<void>
): Promise<void> {
  const tmpDir = await mkdtemp(path.join(tmpdir(), `tg-${fixtureName}-`));
  const workspaceSlug = `tg-${fixtureName}`;
  
  try {
    // ... copy units, build loader ...
    const stack = await createTestServiceStack(`tg-${fixtureName}`, loader);
    
    // Register workspace via service
    await stack.workspaceService.add(workspaceSlug, tmpDir);
    
    // Get registered workspace context from service
    const ctx = await stack.workspaceService.getContext(workspaceSlug);
    
    const tgc: TestGraphContext = {
      ctx,  // Use service-provided context, not manual construction
      service: stack.service,
      workspacePath: tmpDir
    };
    
    await testFn(tgc);
  } finally {
    // Remove workspace registration
    try {
      await stack.workspaceService.remove(workspaceSlug);
    } catch (err) {
      // Log but don't fail cleanup
    }
    await rm(tmpDir, { recursive: true, force: true });
  }
}
```

**Test**:
```typescript
it('should register workspace via service', async () => {
  await withTestGraph('smoke', async ({ ctx, service }) => {
    // Verify workspace is registered
    const workspaces = await service.workspaceService.list();
    expect(workspaces).toContain(ctx.workspaceSlug);
  });
  
  // After cleanup, workspace should be removed
  const workspaces = await service.workspaceService.list();
  expect(workspaces).not.toContain('tg-smoke');
});
```

**Validation**: AC-11 passes, workspace registered and removed via service API.

---

### HIGH-02: Add Path Traversal Protection (Security)

**Severity**: HIGH | **Finding**: SEC-001, SEC-002

**SEC-001**: ods.ts:185-191 - Script path enables traversal
```typescript
// Current (VULNERABLE):
const scriptPath = path.join(workspacePath, '.chainglass', 'units', node.unitSlug, 'scripts', loadResult.unit.code.script);

// Fixed:
const baseDir = path.join(workspacePath, '.chainglass', 'units', node.unitSlug);
const candidatePath = path.join(baseDir, 'scripts', loadResult.unit.code.script);
const resolvedPath = path.resolve(candidatePath);

// Enforce containment
if (!resolvedPath.startsWith(baseDir + path.sep)) {
  throw new Error(`Script path "${loadResult.unit.code.script}" escapes unit directory`);
}

// Reject absolute paths and traversal segments
if (loadResult.unit.code.script.includes('..') || path.isAbsolute(loadResult.unit.code.script)) {
  throw new Error(`Invalid script path: "${loadResult.unit.code.script}"`);
}

const scriptPath = resolvedPath;
```

**SEC-002**: graph-test-runner.ts:113-114 - fixtureName validation
```typescript
// Current (VULNERABLE):
const fixtureDir = path.join(FIXTURES_ROOT, fixtureName);

// Fixed:
// Validate fixtureName against strict allowlist
if (!/^[a-z0-9_-]+$/.test(fixtureName)) {
  throw new Error(`Invalid fixtureName: "${fixtureName}" (must match ^[a-z0-9_-]+$)`);
}

const fixtureDir = path.join(FIXTURES_ROOT, fixtureName);
const resolvedDir = path.resolve(fixtureDir);

// Enforce containment under FIXTURES_ROOT
if (!resolvedDir.startsWith(FIXTURES_ROOT + path.sep)) {
  throw new Error(`Fixture "${fixtureName}" escapes FIXTURES_ROOT`);
}
```

**Test** (SEC-001):
```typescript
it('should reject script paths with traversal', async () => {
  const maliciousUnit = { code: { script: '../../evil.sh' } };
  await expect(ods.buildPodParams(..., maliciousUnit)).rejects.toThrow(/escapes unit directory/);
});
```

**Test** (SEC-002):
```typescript
it('should reject fixtureName with traversal', async () => {
  await expect(withTestGraph('../etc/passwd', async () => {})).rejects.toThrow(/Invalid fixtureName/);
});
```

**Validation**: Both exploits blocked with clear error messages.

---

### HIGH-03: Sync Plan Authority Footnotes

**Severity**: HIGH | **Finding**: AUTH-001, AUTH-002  
**File**: docs/plans/037-codepod-and-goat-integration/tasks/phase-2-test-graph-infrastructure/tasks.md

**Issue**: Plan § 13 has [^1] and [^2] marked as "[To be added during implementation via plan-6a]", but these were never added to dossier Phase Footnote Stubs section.

**Fix**:
```bash
# Run plan-6a to sync footnotes from plan to dossier
plan-6a --sync-footnotes --footnote 1
plan-6a --sync-footnotes --footnote 2

# Or manually add to dossier tasks.md § Phase Footnote Stubs:
```markdown
## § Phase Footnote Stubs

[^1]: [To be added during implementation via plan-6a]

[^2]: [To be added during implementation via plan-6a]

[^3]: Task 2.1 (T001) - Added onRun callback to FakeAgentInstance
  - `class:packages/shared/src/features/034-agentic-cli/fakes/fake-agent-instance.ts:FakeAgentInstance`
  ...
```

**Validation**: Dossier Phase Footnote Stubs section contains [^1] and [^2] matching plan § 13.

---

### HIGH-04: Fix Scope Creep - Split Phase 1 Changes

**Severity**: HIGH | **Finding**: PLAN-002  
**Files**: Multiple Phase 1 orchestration files in Phase 2 diff

**Issue**: Phase 2 implementation diff includes Phase 1 files (ods.ts, script-runner.ts, pod.test.ts, script-runner.test.ts, ods.test.ts) not listed in T001-T009 target paths.

**Fix Option A** (Recommended - Amend History):
```bash
# Extract Phase 1 fixes to separate commit
git rebase -i <parent-of-phase-2-commit>
# Split commit, move Phase 1 fixes to earlier commit

# Result:
# Commit 1: "Fix Plan 037 Phase 1 review findings" (ods.ts, script-runner.ts, tests)
# Commit 2: "Implement Plan 037 Phase 2: test graph infrastructure" (dev/test-graphs/, FakeAgentInstance.onRun)
```

**Fix Option B** (Add Explicit Plan Tasks):
Add tasks to Phase 2 plan justifying Phase 1 edits:
```markdown
| 2.10 | [x] | Fix Phase 1 review findings: script timeout, ODS error wrapping | ... |
```

**Validation**: Phase 2 diff contains ONLY files listed in T001-T009 target paths + explicitly justified neighbors.

---

### HIGH-05: Move Review Artifacts to Separate Commit

**Severity**: MEDIUM (cleanup) | **Finding**: PLAN-003  
**Files**: docs/plans/037-codepod-and-goat-integration/reviews/review.phase-1-*.md, fix-tasks.phase-1-*.md

**Issue**: Phase 1 review artifacts included in Phase 2 implementation diff. Review artifacts should be in dedicated review commits, not implementation commits.

**Fix**:
```bash
# Move review artifacts to separate commit
git rebase -i <parent-of-phase-2-commit>
# Split commit:
# Commit 1: "Review Plan 037 Phase 1" (review.phase-1-*.md, fix-tasks.phase-1-*.md)
# Commit 2: "Implement Plan 037 Phase 2" (dev/test-graphs/, FakeAgentInstance.onRun)
```

**Validation**: Phase 2 implementation commit contains NO review artifacts from other phases.

---

### HIGH-06: Add Error Handling to FakeAgentInstance.onRun

**Severity**: HIGH | **Finding**: COR-001  
**File**: packages/shared/src/features/034-agentic-cli/fakes/fake-agent-instance.ts:146-154

**Issue**: If `onRun` callback throws, `run()` exits early leaving instance stuck in `working` state. Subsequent calls fail with "already running".

**Fix**:
```typescript
// Current (BROKEN):
async run(options: AgentRunOptions): Promise<AgentResult> {
  if (this._status === 'working') {
    throw new Error('Cannot run: instance already working');
  }
  
  this._status = 'working';
  this._updatedAt = new Date();
  
  if (this.options.onRun) {
    await this.options.onRun(options);  // ❌ If throws, _status stuck
  }
  
  this._status = 'stopped';
  this._updatedAt = new Date();
  return this.result;
}

// Fixed:
async run(options: AgentRunOptions): Promise<AgentResult> {
  if (this._status === 'working') {
    throw new Error('Cannot run: instance already working');
  }
  
  this._status = 'working';
  this._updatedAt = new Date();
  
  try {
    if (this.options.onRun) {
      await this.options.onRun(options);
    }
    
    return this.result;
  } finally {
    // Always reset state, even on exception
    this._status = 'stopped';
    this._updatedAt = new Date();
  }
}
```

**Test**:
```typescript
it('should reset state when onRun throws', async () => {
  const instance = new FakeAgentInstance({
    onRun: async () => { throw new Error('Boom'); }
  });
  
  await expect(instance.run({})).rejects.toThrow('Boom');
  expect(instance.status).toBe('stopped');  // ✅ Not stuck in 'working'
  
  // Should be able to run again
  await expect(instance.run({})).resolves.not.toThrow();
});
```

**Validation**: Test proves state reset on exception; subsequent runs work.

---

### HIGH-07: Add Structured Logging for Pod Creation Failures

**Severity**: HIGH | **Finding**: OBS-001  
**File**: packages/positional-graph/src/features/030-orchestration/ods.ts:116-127

**Issue**: POD_CREATION_FAILED returned without structured error log or correlation fields, making cross-service debugging difficult.

**Fix**:
```typescript
// Current (MISSING LOGS):
try {
  const podParams = await this.buildPodParams(node, graphSlug, workspaceCtx);
  const pod = await this.deps.podManager.create(podParams);
  return { pod };
} catch (err) {
  return { error: orchestrationErrorCode.POD_CREATION_FAILED };
}

// Fixed:
try {
  const podParams = await this.buildPodParams(node, graphSlug, workspaceCtx);
  const pod = await this.deps.podManager.create(podParams);
  return { pod };
} catch (err) {
  // Structured error log with correlation fields
  this.deps.logger.error('pod_creation_failed', {
    event: 'pod_creation_failed',
    graphSlug,
    nodeId: node.id,
    unitSlug: node.unitSlug,
    workspaceSlug: workspaceCtx.workspaceSlug,
    workspacePath: workspaceCtx.workspacePath,
    errorCode: 'POD_CREATION_FAILED',
    errorMessage: err instanceof Error ? err.message : String(err),
    errorStack: err instanceof Error ? err.stack : undefined
  });
  
  // Increment failure counter metric
  this.deps.metrics?.increment('orchestration.pod_creation_failures_total', {
    unitType: node.unitType,
    errorCode: 'POD_CREATION_FAILED'
  });
  
  return { error: orchestrationErrorCode.POD_CREATION_FAILED };
}
```

**Validation**: Pod creation failure produces structured log searchable by graphSlug, nodeId, workspaceSlug.

---

### HIGH-08: Add Metrics for Script Execution Timeouts

**Severity**: HIGH | **Finding**: OBS-002  
**File**: packages/positional-graph/src/features/030-orchestration/script-runner.ts:32-37,50-57

**Issue**: Timeout handling only mutates exitCode/stderr without structured logs or performance metrics, making timeouts hard to monitor at scale.

**Fix**:
```typescript
async run(script: string, options: ScriptRunOptions): Promise<ScriptResult> {
  const startTime = Date.now();
  const { timeout = 60, cwd, env } = options;
  
  // ... spawn child process ...
  
  const timeoutHandle = setTimeout(() => {
    const elapsedMs = Date.now() - startTime;
    
    // Structured timeout log
    this.logger.warn('script_timeout', {
      event: 'script_timeout',
      script,
      cwd,
      timeoutSeconds: timeout,
      elapsedMs,
      pid: child.pid,
      ...extractCorrelationIds(env)  // CG_GRAPH_SLUG, CG_NODE_ID, etc.
    });
    
    // Increment timeout counter
    this.metrics?.increment('orchestration.script_timeouts_total', {
      script: path.basename(script),
      timeoutSeconds: String(timeout)
    });
    
    // Kill and update result
    this.kill();
    exitCode = 124;
    stderr += `\n[ScriptRunner] Timeout after ${timeout}s`;
  }, timeout * 1000);
  
  // ... wait for exit ...
  
  clearTimeout(timeoutHandle);
  const durationMs = Date.now() - startTime;
  
  // Emit duration metric
  this.metrics?.histogram('orchestration.script_run_duration_ms', durationMs, {
    script: path.basename(script),
    exitCode: String(exitCode)
  });
  
  return { exitCode, stdout, stderr };
}
```

**Validation**: Script timeout produces structured log + 2 metrics (timeout counter, duration histogram).

---

### HIGH-09: Replace sleep-based Test with Deterministic Time Control

**Severity**: HIGH | **Finding**: PLAN-004  
**File**: test/unit/positional-graph/features/030-orchestration/script-runner.test.ts

**Issue**: Timeout test uses script with `sleep 30`, violating R-TEST-005 (no sleep in unit tests).

**Fix**:
```typescript
// Current (VIOLATES R-TEST-005):
it('should timeout long-running script', async () => {
  const runner = new ScriptRunner();
  const script = '/tmp/slow.sh';  // Contains: sleep 30
  const result = await runner.run(script, { timeout: 1 });
  expect(result.exitCode).toBe(124);
}, 5000);  // ❌ 5-second timeout for unit test

// Fixed (deterministic):
it('should timeout when script exceeds limit', async () => {
  // Use a script that checks for kill signal instead of sleep
  const script = await createTempScript(`
    #!/bin/bash
    trap 'exit 143' SIGTERM
    while true; do
      sleep 0.1  # Minimal sleep just to avoid busy-wait
    done
  `);
  
  const runner = new ScriptRunner();
  const result = await runner.run(script, { timeout: 0.2 });  // 200ms timeout
  
  expect(result.exitCode).toBe(124);
  expect(result.stderr).toContain('Timeout after 0.2s');
}, 1000);  // ✅ Completes in <1s
```

**Alternative**: Use fake time control (if test framework supports):
```typescript
it('should timeout when script exceeds limit', async () => {
  vi.useFakeTimers();
  
  const runner = new ScriptRunner();
  const promise = runner.run('/tmp/infinite.sh', { timeout: 30 });
  
  // Fast-forward time
  vi.advanceTimersByTime(30000);
  
  const result = await promise;
  expect(result.exitCode).toBe(124);
  
  vi.useRealTimers();
});
```

**Validation**: Test completes in <1 second; no long sleep or wall-clock wait.

---

### HIGH-10: Use Path Aliases for Cross-Package Imports

**Severity**: HIGH | **Finding**: UNI-003  
**File**: test/contracts/script-runner.contract.test.ts:14-15

**Issue**: Contract test imports via relative paths `../../packages/...`, violating R-CODE-004 path-alias requirement.

**Fix**:
```typescript
// Current (VIOLATES R-CODE-004):
import { ScriptRunner } from '../../packages/positional-graph/src/features/030-orchestration/script-runner.js';
import { FakeScriptRunner } from '../../packages/positional-graph/src/features/030-orchestration/script-runner.types.js';

// Fixed:
import { ScriptRunner, FakeScriptRunner } from '@chainglass/positional-graph/orchestration';

// Or expose via test entrypoint:
import { ScriptRunner, FakeScriptRunner } from '@chainglass/positional-graph/test';
```

**Prerequisite**: Add exports to packages/positional-graph/package.json:
```json
{
  "exports": {
    "./orchestration": {
      "types": "./dist/features/030-orchestration/index.d.ts",
      "import": "./dist/features/030-orchestration/index.js"
    },
    "./test": {
      "types": "./dist/features/030-orchestration/script-runner.types.d.ts",
      "import": "./dist/features/030-orchestration/script-runner.types.js"
    }
  }
}
```

**Validation**: Import resolves via path alias; `../../` paths removed.

---

### HIGH-11: Extend withTestGraph API with Wiring Callback (T004 Completion)

**Severity**: HIGH | **Finding**: PLAN-001, SEM-003  
**File**: dev/test-graphs/shared/graph-test-runner.ts:108-111

**Issue**: withTestGraph missing setup/wiring extensibility callback specified in T004 for Phase 3 orchestration wiring.

**Fix**:
```typescript
// Current (INCOMPLETE):
export async function withTestGraph(
  fixtureName: string,
  testFn: (context: TestGraphContext) => Promise<void>
): Promise<void> {
  // ...
}

// Fixed (with extensibility):
export interface TestGraphSetupOptions {
  /** Optional setup callback before test execution */
  setupGraph?: (context: TestGraphContext) => Promise<void>;
  /** Optional wiring callback for Phase 3 orchestration stack */
  wiring?: <T>(context: TestGraphContext) => Promise<T>;
}

export async function withTestGraph(
  fixtureName: string,
  testFn: (context: TestGraphContext) => Promise<void>,
  options?: TestGraphSetupOptions
): Promise<void> {
  const tmpDir = await mkdtemp(...);
  
  try {
    // ... workspace registration, unit copy, service stack creation ...
    
    const tgc: TestGraphContext = { ctx, service, workspacePath: tmpDir };
    
    // Execute setup callback if provided
    if (options?.setupGraph) {
      await options.setupGraph(tgc);
    }
    
    // Execute wiring callback if provided (for orchestration stack)
    if (options?.wiring) {
      const wiringResult = await options.wiring(tgc);
      // Store wiring result in context (extend TestGraphContext if needed)
    }
    
    await testFn(tgc);
  } finally {
    // ... cleanup ...
  }
}
```

**Usage Example** (Phase 3):
```typescript
await withTestGraph('simple-serial', async ({ ctx, service }) => {
  // Test logic
}, {
  setupGraph: async ({ ctx, service }) => {
    // Create graph schema
    await service.addNode(ctx, 'simple-serial', 'setup', { ... });
  },
  wiring: async ({ ctx, service }) => {
    // Wire orchestration stack
    const orchestrationService = await createOrchestrationService({ ... });
    return orchestrationService;
  }
});
```

**Validation**: T004 acceptance criteria met; Phase 3 can inject setup/wiring without changing withTestGraph signature.

---

## MEDIUM Priority (Should Fix)

### MED-01: Clean Stack Temp Workspace in withTestGraph

**Severity**: MEDIUM | **Finding**: COR-003, SEM-002  
**File**: dev/test-graphs/shared/graph-test-runner.ts:143-166

**Issue**: withTestGraph creates temp workspace via mkdtemp, but createTestServiceStack also creates its own temp dir (stack.workspacePath). Only tmpDir is cleaned up, leaking stack.workspacePath.

**Fix**:
```typescript
export async function withTestGraph(...): Promise<void> {
  const tmpDir = await mkdtemp(path.join(tmpdir(), `tg-${fixtureName}-`));
  let stackWorkspacePath: string | undefined;
  
  try {
    const stack = await createTestServiceStack(`tg-${fixtureName}`, loader);
    stackWorkspacePath = stack.workspacePath;
    
    // Use tmpDir as the canonical workspace (or stackWorkspacePath)
    // ...
    
    await testFn(tgc);
  } finally {
    // Clean both temp directories
    if (stackWorkspacePath && stackWorkspacePath !== tmpDir) {
      await rm(stackWorkspacePath, { recursive: true, force: true }).catch(() => {});
    }
    await rm(tmpDir, { recursive: true, force: true });
  }
}
```

**Better**: Refactor createTestServiceStack to accept existing workspace path:
```typescript
const stack = await createTestServiceStack(`tg-${fixtureName}`, loader, { workspacePath: tmpDir });
```

**Validation**: After withTestGraph completes, no orphan temp dirs remain in `/tmp`.

---

### MED-02: Fix ScriptRunner Timeout to Use Local Child Process

**Severity**: MEDIUM | **Finding**: COR-002  
**File**: packages/positional-graph/src/features/030-orchestration/script-runner.ts:32-37

**Issue**: Timeout handler calls `this.kill()` (shared mutable state), causing concurrent `run()` calls to interfere with each other.

**Fix**:
```typescript
async run(script: string, options: ScriptRunOptions): Promise<ScriptResult> {
  // ... setup ...
  
  const child = spawn('bash', [script], { cwd, env });
  
  const timeoutHandle = setTimeout(() => {
    // Kill local child process, not shared this.childProcess
    child.kill('SIGTERM');
    exitCode = 124;
    stderr += `\n[ScriptRunner] Timeout after ${timeout}s`;
  }, timeout * 1000);
  
  // Remove assignment: this.childProcess = child;  ❌ Shared state
  
  // ... wait for exit, clear timeout ...
}

kill(): void {
  // Kill current child process if exists (for external kill() calls)
  if (this.currentChild && !this.currentChild.killed) {
    this.currentChild.kill('SIGTERM');
  }
}
```

**Test** (concurrency):
```typescript
it('should handle concurrent runs without interference', async () => {
  const runner = new ScriptRunner();
  
  const promises = [
    runner.run('/tmp/fast.sh', { timeout: 10 }),
    runner.run('/tmp/slow.sh', { timeout: 0.5 }),  // Times out
    runner.run('/tmp/fast.sh', { timeout: 10 })
  ];
  
  const results = await Promise.allSettled(promises);
  
  expect(results[0].status).toBe('fulfilled');  // ✅ Fast script 1 completes
  expect(results[1].value.exitCode).toBe(124);  // ⏱️ Slow script times out
  expect(results[2].status).toBe('fulfilled');  // ✅ Fast script 2 completes (not killed)
});
```

**Validation**: Concurrent runs isolated; one timeout doesn't kill another's process.

---

### MED-03: Cap ScriptRunner Output Buffer

**Severity**: HIGH (memory) | **Finding**: PERF-001  
**File**: packages/positional-graph/src/features/030-orchestration/script-runner.ts:28-48

**Issue**: ScriptRunner accumulates unbounded stdout/stderr in memory. 200MB script output retains ~200MB in-process.

**Fix Option A** (Cap buffer):
```typescript
const MAX_OUTPUT_BYTES = 1024 * 1024;  // 1MB max

async run(script: string, options: ScriptRunOptions): Promise<ScriptResult> {
  const child = spawn('bash', [script], { cwd, env });
  
  let stdout = '';
  let stderr = '';
  let stdoutTruncated = false;
  let stderrTruncated = false;
  
  child.stdout.on('data', (chunk: Buffer) => {
    if (stdout.length < MAX_OUTPUT_BYTES) {
      stdout += chunk.toString();
    } else if (!stdoutTruncated) {
      stdout += '\n[Output truncated - exceeded 1MB limit]';
      stdoutTruncated = true;
    }
  });
  
  child.stderr.on('data', (chunk: Buffer) => {
    if (stderr.length < MAX_OUTPUT_BYTES) {
      stderr += chunk.toString();
    } else if (!stderrTruncated) {
      stderr += '\n[Output truncated - exceeded 1MB limit]';
      stderrTruncated = true;
    }
  });
  
  // ... rest of implementation ...
}
```

**Fix Option B** (Stream to file):
```typescript
interface ScriptResult {
  exitCode: number;
  stdoutPath?: string;  // Path to full stdout if > 1MB
  stderrPath?: string;  // Path to full stderr if > 1MB
  stdoutPreview: string;  // First/last N KB
  stderrPreview: string;
}
```

**Validation**: 200MB script output consumes <2MB in-process memory; preview/path available.

---

### MED-04: Add Structured Logging for Script Spawn Errors

**Severity**: MEDIUM | **Finding**: OBS-003  
**File**: packages/positional-graph/src/features/030-orchestration/script-runner.ts:61-64

**Issue**: Process spawn/runtime errors rejected without structured logging, losing errno/code/signal context.

**Fix**:
```typescript
return new Promise<ScriptResult>((resolve, reject) => {
  // ... setup child, timeout, stdout/stderr ...
  
  child.on('error', (err: Error & { code?: string; errno?: number; syscall?: string }) => {
    // Structured error log
    this.logger.error('script_spawn_error', {
      event: 'script_spawn_error',
      script,
      cwd,
      pid: child.pid,
      errorName: err.name,
      errorMessage: err.message,
      errorCode: err.code,
      errorErrno: err.errno,
      errorSyscall: err.syscall,
      ...extractCorrelationIds(env)
    });
    
    // Increment failure counter
    this.metrics?.increment('orchestration.script_spawn_failures_total', {
      errorCode: err.code || 'UNKNOWN',
      syscall: err.syscall || 'UNKNOWN'
    });
    
    clearTimeout(timeoutHandle);
    reject(err);
  });
  
  // ... rest of promise setup ...
});
```

**Validation**: ENOENT, EACCES, and other spawn errors produce structured logs with errno/code/syscall fields.

---

### MED-05: Add Rejection Handler for Fire-and-Forget pod.execute()

**Severity**: MEDIUM | **Finding**: OBS-004  
**File**: packages/positional-graph/src/features/030-orchestration/ods.ts:132-136

**Issue**: Fire-and-forget `pod.execute()` has no .catch handler, causing silent background crashes.

**Fix**:
```typescript
// Current (SILENT FAILURES):
void pod.execute(handleCtx);

// Fixed:
void pod.execute(handleCtx).catch((err) => {
  // Structured error log
  this.deps.logger.error('pod_execution_dispatch_failed', {
    event: 'pod_execution_dispatch_failed',
    graphSlug: handleCtx.graphSlug,
    nodeId: handleCtx.nodeId,
    sessionId: handleCtx.sessionId,
    errorMessage: err instanceof Error ? err.message : String(err),
    errorStack: err instanceof Error ? err.stack : undefined
  });
  
  // Increment failure counter
  this.deps.metrics?.increment('orchestration.pod_dispatch_failures_total', {
    nodeType: handleCtx.nodeType
  });
});

// Also emit success event for audit trail
this.deps.metrics?.increment('orchestration.pod_dispatch_attempts_total', {
  nodeType: handleCtx.nodeType
});
```

**Validation**: Background pod.execute() failures produce searchable error logs + metrics.

---

### MED-06: Optimize makeScriptsExecutable with Streaming Traversal

**Severity**: MEDIUM | **Finding**: PERF-002  
**File**: dev/test-graphs/shared/helpers.ts:16-21

**Issue**: Unbounded recursive readdir materializes full directory tree (O(n) memory) before processing.

**Fix**:
```typescript
// Current (O(n) memory):
export async function makeScriptsExecutable(dir: string): Promise<void> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.sh')) {
      const scriptPath = entry.path;  // ❌ Doesn't exist
      await chmod(scriptPath, 0o755);
    }
  }
}

// Fixed (streaming with async iteration):
export async function makeScriptsExecutable(dir: string): Promise<void> {
  async function* walk(directory: string): AsyncGenerator<string> {
    for await (const entry of await opendir(directory)) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        yield* walk(fullPath);  // Recurse
      } else if (entry.isFile() && entry.name.endsWith('.sh')) {
        yield fullPath;
      }
    }
  }
  
  // Process scripts with bounded concurrency
  const scripts = walk(dir);
  const chmodPromises: Promise<void>[] = [];
  const CONCURRENCY = 10;
  
  for await (const scriptPath of scripts) {
    chmodPromises.push(chmod(scriptPath, 0o755));
    
    // Limit concurrent chmod operations
    if (chmodPromises.length >= CONCURRENCY) {
      await Promise.race(chmodPromises);
      chmodPromises.splice(chmodPromises.findIndex(p => p === await Promise.race(chmodPromises)), 1);
    }
  }
  
  await Promise.all(chmodPromises);
}
```

**Validation**: Large fixture tree (10K files) processes with <10MB memory footprint.

---

### MED-07: Batch completeUserInputNode Output Saves

**Severity**: LOW | **Finding**: PERF-003  
**File**: dev/test-graphs/shared/helpers.ts:42-44

**Issue**: Sequential saveOutputData calls create N+1 I/O (latency = n × per-call latency).

**Fix**:
```typescript
// Current (sequential):
for (const [name, value] of Object.entries(outputs)) {
  await service.saveOutputData(ctx, graphSlug, nodeId, name, value);
}

// Fixed (parallel):
await Promise.all(
  Object.entries(outputs).map(([name, value]) =>
    service.saveOutputData(ctx, graphSlug, nodeId, name, value)
  )
);
```

**Better**: Add batch API to service:
```typescript
// service.ts:
async saveOutputsData(ctx: WorkspaceContext, graphSlug: string, nodeId: string, outputs: Record<string, unknown>): Promise<void> {
  // Batch write all outputs in single transaction
}

// helpers.ts:
await service.saveOutputsData(ctx, graphSlug, nodeId, outputs);
```

**Validation**: 10 outputs save in ~1× latency instead of ~10× latency.

---

### MED-08: Update Footnote Node IDs to Include Symbols

**Severity**: MEDIUM | **Finding**: FOOT-001  
**File**: docs/plans/037-codepod-and-goat-integration/codepod-and-goat-integration-plan.md § 13

**Issue**: 8 footnote node IDs missing symbol segment (format should be `file:<path>:<symbol>` not just `file:<path>`).

**Fix**:
Update plan § 13 footnotes to include symbol segment:
```markdown
[^3]: Task 2.1 (T001) - Added onRun callback to FakeAgentInstance
  - `class:packages/shared/src/features/034-agentic-cli/fakes/fake-agent-instance.ts:FakeAgentInstance`
  - `file:test/unit/shared/features/034-agentic-cli/fakes/fake-agent-instance.test.ts:main` ✅

[^4]: Task 2.2 (T002) - Created dev/test-graphs directory structure
  - `file:dev/test-graphs/README.md:main` ✅

[^5]: Task 2.3 (T003) - RED smoke test with minimal fixture
  - `file:test/integration/test-graph-infrastructure.test.ts:main` ✅
  - `file:dev/test-graphs/smoke/units/ping/unit.yaml:main` ✅
  - `file:dev/test-graphs/smoke/units/ping/scripts/ping.sh:main` ✅

[^6]: Task 2.4 (T004) - withTestGraph() lifecycle manager
  - `function:dev/test-graphs/shared/graph-test-runner.ts:withTestGraph` ✅

[^7]: Task 2.8 (T005) - Smoke test GREEN
  - `file:test/integration/test-graph-infrastructure.test.ts:main` ✅

[^9]: Task 2.7 (T007) - Assertion library
  - `function:dev/test-graphs/shared/assertions.ts:assertGraphComplete` ✅
  - `function:dev/test-graphs/shared/assertions.ts:assertNodeComplete` ✅
  - `function:dev/test-graphs/shared/assertions.ts:assertOutputExists` ✅
```

**Validation**: All footnotes follow format `(file|function|class):<path>:<symbol>`.

---

### MED-09: Replace file:all with Concrete File List

**Severity**: HIGH (broken provenance) | **Finding**: FOOT-002  
**File**: docs/plans/037-codepod-and-goat-integration/codepod-and-goat-integration-plan.md § 13, [^11]

**Issue**: `file:all` is not a concrete file path, breaks File→Task traversal provenance.

**Fix**:
```markdown
[^11]: Task 2.9 (T009) - Quality gate validation
  - `file:test/integration/test-graph-infrastructure.test.ts:main` (re-run smoke tests)
  - `file:dev/test-graphs/shared/graph-test-runner.ts:main` (validation passes)
  - `file:dev/test-graphs/shared/helpers.ts:main` (validation passes)
  - `file:dev/test-graphs/shared/assertions.ts:main` (validation passes)
  - (Or list actual files validated during T009)
```

**Validation**: [^11] contains concrete file paths pointing to actual modified files.

---

## LOW Priority (Nice to Have)

### LOW-01: Add Negative Test for addNode Validation (AC-13)

**Severity**: LOW | **Coverage gap**  
**File**: test/integration/test-graph-infrastructure.test.ts

**Issue**: AC-13 test shows addNode validates units on disk, but doesn't verify failure case (invalid unit path rejected).

**Enhancement**:
```typescript
it('should reject addNode for non-existent unit', async () => {
  await withTestGraph('smoke', async ({ ctx, service }) => {
    await expect(
      service.addNode(ctx, 'smoke', 'invalid-unit', { ... })
    ).rejects.toThrow(/unit not found/i);
  });
});
```

**Validation**: AC-13 confidence increases to 100%.

---

## Summary

**Total Fix Tasks**: 32
- CRITICAL: 6 (TDD order, graph integrity, TypeScript errors)
- HIGH: 11 (security, workspace lifecycle, scope creep, observability)
- MEDIUM: 14 (correctness, performance, logging, footnote format)
- LOW: 1 (test coverage improvement)

**Estimated Effort**: 8-12 hours
**Blocking Issues**: CRIT-01 through CRIT-06, HIGH-01 through HIGH-11

**Recommended Sequence**:
1. Fix TypeScript errors (CRIT-06) - enables compilation
2. Re-sequence TDD violations (CRIT-01, CRIT-02, CRIT-03) - proves test-first discipline
3. Fix graph integrity (CRIT-04, CRIT-05) - restores bidirectional navigation
4. Implement workspace lifecycle (HIGH-01) - satisfies AC-11
5. Add security protections (HIGH-02) - prevents path traversal exploits
6. Clean up scope creep (HIGH-04, HIGH-05) - proper commit hygiene
7. Add error handling and observability (HIGH-06, HIGH-07, HIGH-08) - production readiness
8. Address remaining HIGH/MEDIUM items in priority order

**Next Review**: After all CRITICAL and HIGH items fixed, re-run `/plan-7-code-review` to verify corrections and check for new issues.
