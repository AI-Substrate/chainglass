# Phase 2: AgentEventAdapter - Fix Tasks

**Plan**: Agent Workspace Data Model Migration (Plan 018)  
**Phase**: Phase 2: AgentEventAdapter  
**Generated**: 2026-01-28  
**Review**: [review.phase-2-agenteventadapter.md](./review.phase-2-agenteventadapter.md)

---

## Fix Order (TDD Approach)

Per Testing Philosophy: Write tests first (RED), then implement (GREEN).

---

## SEC-001: Session ID Validation Missing in 4 Methods [CRITICAL]

**Severity**: CRITICAL  
**Impact**: Path traversal vulnerability allows reading/checking arbitrary files  
**Files**: 
- `/home/jak/substrate/015-better-agents/packages/workflow/src/adapters/agent-event.adapter.ts`
- `/home/jak/substrate/015-better-agents/test/unit/workflow/agent-event-adapter.test.ts`

### Step 1: Write Tests (RED Phase)

Add tests for session ID validation in each method:

**File**: `/home/jak/substrate/015-better-agents/test/unit/workflow/agent-event-adapter.test.ts`

Add the following test cases after the existing `append() - Session ID Validation` describe block:

```typescript
describe('getAll() - Session ID Validation', () => {
  it('should reject session ID with path traversal (..)', async () => {
    /*
    Test Doc:
    - Why: Per AC-11 - prevent path traversal attacks in read operations
    - Contract: getAll() returns empty array or throws for invalid sessionId
    - Quality Contribution: Security - no file read outside session dir
    */
    // First, create a valid session to ensure we're not just testing "file not found"
    await adapter.append(ctx, 'valid-session', TEST_EVENT_1);
    
    // Attempt path traversal - should NOT read events from valid-session
    const events = await adapter.getAll(ctx, '../valid-session');
    
    // Should return empty or throw, NOT return events from valid-session
    expect(events).toEqual([]);
  });

  it('should reject session ID with forward slash', async () => {
    /*
    Test Doc:
    - Why: Slashes could read from unexpected paths
    - Contract: getAll() returns empty for invalid sessionId
    */
    const events = await adapter.getAll(ctx, 'session/nested');
    expect(events).toEqual([]);
  });
});

describe('getSince() - Session ID Validation', () => {
  it('should reject session ID with path traversal (..)', async () => {
    /*
    Test Doc:
    - Why: Per AC-11 - prevent path traversal in incremental read
    - Contract: getSince() throws for invalid sessionId before filesystem access
    */
    await expect(
      adapter.getSince(ctx, '../../../etc/passwd', 'some-id')
    ).rejects.toThrow(/Invalid session ID|Event ID not found/);
  });
});

describe('archive() - Session ID Validation', () => {
  it('should reject session ID with path traversal (..)', async () => {
    /*
    Test Doc:
    - Why: Per AC-11 - prevent archiving arbitrary files
    - Contract: archive() returns error result for invalid sessionId
    */
    const result = await adapter.archive(ctx, '../../../etc/passwd');
    
    expect(result.ok).toBe(false);
    expect(result.errorMessage).toContain('Invalid session ID');
  });
});

describe('exists() - Session ID Validation', () => {
  it('should reject session ID with path traversal (..)', async () => {
    /*
    Test Doc:
    - Why: Per AC-11 - prevent checking existence of arbitrary paths
    - Contract: exists() returns false for invalid sessionId
    */
    const exists = await adapter.exists(ctx, '../../../etc/passwd');
    
    // Should return false for invalid sessionId, NOT check actual path
    expect(exists).toBe(false);
  });
});
```

**Run tests to verify RED phase**:
```bash
pnpm test test/unit/workflow/agent-event-adapter.test.ts
# Expected: 4 new tests fail (current implementation doesn't validate)
```

### Step 2: Implement Validation (GREEN Phase)

**File**: `/home/jak/substrate/015-better-agents/packages/workflow/src/adapters/agent-event.adapter.ts`

#### Patch for getAll() (line 174):

```diff
  async getAll(ctx: WorkspaceContext, sessionId: string): Promise<StoredAgentEvent[]> {
+   // Per AC-11: Validate sessionId before filesystem operations
+   if (!isValidSessionId(sessionId)) {
+     return [];
+   }
+
    const eventsPath = this.getEventsPath(ctx, sessionId);

    try {
```

#### Patch for getSince() (line 199):

```diff
  async getSince(
    ctx: WorkspaceContext,
    sessionId: string,
    sinceId: string
  ): Promise<StoredAgentEvent[]> {
+   // Per AC-11: Validate sessionId before filesystem operations
+   if (!isValidSessionId(sessionId)) {
+     throw new Error(`Invalid session ID: '${sessionId}'`);
+   }
+
    const events = await this.getAll(ctx, sessionId);
```

#### Patch for archive() (line 221):

```diff
  async archive(
    ctx: WorkspaceContext,
    sessionId: string,
    options?: ArchiveOptions
  ): Promise<ArchiveResult> {
+   // Per AC-11: Validate sessionId before filesystem operations
+   if (!isValidSessionId(sessionId)) {
+     return {
+       ok: false,
+       errorMessage: `Invalid session ID: '${sessionId}'`,
+     };
+   }
+
    try {
      const eventsPath = this.getEventsPath(ctx, sessionId);
```

#### Patch for exists() (line 254):

```diff
  async exists(ctx: WorkspaceContext, sessionId: string): Promise<boolean> {
+   // Per AC-11: Validate sessionId before filesystem operations
+   if (!isValidSessionId(sessionId)) {
+     return false;
+   }
+
    const eventsPath = this.getEventsPath(ctx, sessionId);
```

### Step 3: Verify (GREEN Phase)

```bash
pnpm test test/unit/workflow/agent-event-adapter.test.ts
# Expected: All tests pass (including 4 new validation tests)

pnpm test
# Expected: Full test suite passes
```

---

## TASK-001: SSE Integration Test Missing [MEDIUM]

**Severity**: MEDIUM  
**Impact**: T013 marked complete but test file doesn't exist  
**File**: `/home/jak/substrate/015-better-agents/test/integration/sse-workspace-integration.test.ts`

### Option A: Create the Test File

The test should verify SSE still works with new workspace-scoped paths. See existing `test/integration/web/api/sse-route.test.ts` for patterns.

### Option B: Update Task Status

If SSE is verified manually or through other tests, update:
- `tasks.md`: Change T013 status to `⏭️ SKIP` with justification
- Remove T013 from Architecture Diagram if not needed

---

## ORPHAN-001: Remove Unused EVENT_STORAGE Token [LOW]

**Severity**: LOW  
**Impact**: Dead code, minor confusion  
**File**: `/home/jak/substrate/015-better-agents/packages/shared/src/di-tokens.ts`

### Patch (line 24):

```diff
  /** IOutputAdapter interface (per Phase 1a) */
  OUTPUT_ADAPTER: 'IOutputAdapter',
- /** IEventStorage interface (Plan 015: Phase 1) */
- EVENT_STORAGE: 'IEventStorage',
  /** IProcessManager interface (for git operations) */
  PROCESS_MANAGER: 'IProcessManager',
```

**Verify**: No remaining references to `SHARED_DI_TOKENS.EVENT_STORAGE` in codebase.

---

## Verification Checklist

After applying fixes:

- [ ] Run `pnpm test` - all tests pass
- [ ] Run `pnpm typecheck` - no type errors
- [ ] Run `pnpm lint` - no lint errors
- [ ] Verify AC-11 checkbox can be checked in tasks.md
- [ ] Re-run `plan-7-code-review` for APPROVE verdict

---

**Fix Tasks Generated**: 2026-01-28T07:45:00Z
