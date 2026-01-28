# Fix Tasks: Phase 1 – AgentSession Entity

**Review**: [review.phase-1-agentsession-entity.md](./review.phase-1-agentsession-entity.md)
**Date**: 2026-01-28

---

## Priority Order

Execute fixes in this order (highest severity first):

### 1. CRITICAL: Graph Integrity (GRAPH-001, GRAPH-002, GRAPH-003, GRAPH-004)

**Task**: Run plan-6a-update-progress to sync all documentation

```bash
# This command should:
# 1. Update plan task table (lines 614-631) from [ ] to [x] for completed tasks
# 2. Populate Change Footnotes Ledger (line 1438) with FlowSpace node IDs
# 3. Sync Phase Footnote Stubs in tasks.md
# 4. Add backlink metadata to execution log entries

plan-6a-update-progress --plan "/home/jak/substrate/015-better-agents/docs/plans/018-agents-workspace-data-model/agents-workspace-data-model-plan.md" --phase "Phase 1: AgentSession Entity + AgentSessionAdapter + Contract Tests"
```

**Manual Alternative** (if plan-6a unavailable):

1. Update plan.md lines 616-631, change all `| [ ]` to `| [x]`
2. Add footnotes to Change Footnotes Ledger (line 1438+):
```markdown
[^1]: Task 1.1 - IAgentSessionAdapter interface
  - `file:/home/jak/substrate/015-better-agents/packages/workflow/src/interfaces/agent-session-adapter.interface.ts`
[^2]: Task 1.2 - Zod schema for AgentSession
  - `file:/home/jak/substrate/015-better-agents/packages/shared/src/schemas/agent-session.schema.ts`
[^3]: Task 1.4 - AgentSession entity
  - `file:/home/jak/substrate/015-better-agents/packages/workflow/src/entities/agent-session.ts`
...
```

---

### 2. CRITICAL: Silent Error Swallowing (COR-001)

**File**: `/home/jak/substrate/015-better-agents/packages/workflow/src/adapters/agent-session.adapter.ts`
**Lines**: 162-164

**Current**:
```typescript
      } catch {
        // Skip corrupt files
      }
```

**Fix**:
```typescript
      } catch (error) {
        // Log warning for debugging, then skip
        console.warn(`Skipping corrupt session file: ${file}`, error);
      }
```

**Test**: Run `pnpm test test/contracts/agent-session-adapter.contract.test.ts` to verify no regression.

---

### 3. ~~HIGH: Missing validateSessionId() (SEC-001)~~ – FALSE POSITIVE

**Status**: ✅ NO ACTION NEEDED

The security review subagent incorrectly reported this as missing. Actual code at lines 212-222 DOES have validateSessionId():

```typescript
  async exists(ctx: WorkspaceContext, sessionId: string): Promise<boolean> {
    // Validate session ID to prevent path traversal
    try {
      validateSessionId(sessionId);
    } catch {
      return false;
    }

    const path = this.getEntityPath(ctx, sessionId);
    return this.fs.exists(path);
  }
```

**Verification**: The validation is correctly implemented. No fix required.

---

### 4. HIGH: Error Message Disclosure (SEC-002)

**File**: `/home/jak/substrate/015-better-agents/packages/workflow/src/adapters/agent-session.adapter.ts`
**Lines**: 91-99

**Current**:
```typescript
    try {
      validateSessionId(session.id);
    } catch (error) {
      return {
        ok: false,
        errorCode: AgentSessionErrorCodes.INVALID_DATA,
        errorMessage: error instanceof Error ? error.message : 'Invalid session ID',
      };
    }
```

**Fix**:
```typescript
    try {
      validateSessionId(session.id);
    } catch (error) {
      // Log actual error for debugging
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Session ID validation failed:', error);
      }
      return {
        ok: false,
        errorCode: AgentSessionErrorCodes.INVALID_DATA,
        errorMessage: 'Invalid session ID format',
      };
    }
```

**Test**: Run `pnpm test test/contracts/agent-session-adapter.contract.test.ts`

---

### 5. HIGH: Type Safety in listEntityFiles (COR-002)

**File**: `/home/jak/substrate/015-better-agents/packages/workflow/src/adapters/workspace-data-adapter-base.ts`
**Lines**: ~235 (in listEntityFiles method)

**Fix**: Add explicit type assertion to readDir result:
```typescript
const entries: string[] = await this.fs.readDir(domainPath);
// or
const entries = (await this.fs.readDir(domainPath)) as string[];
```

---

### 6. HIGH: Missing Unit Test File (PLAN-001)

**Task T009 Specification**: Create `/home/jak/substrate/015-better-agents/test/unit/workflow/agent-session-adapter.test.ts`

**Option A** (Strict Compliance): Create the file with adapter-specific tests:
```typescript
/**
 * Unit tests for AgentSessionAdapter.
 * 
 * Note: Most adapter behavior is covered by contract tests.
 * This file focuses on adapter-specific implementation details.
 */
import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import { AgentSessionAdapter } from '@chainglass/workflow';
import { describe, expect, it, beforeEach } from 'vitest';

describe('AgentSessionAdapter', () => {
  let adapter: AgentSessionAdapter;
  let fs: FakeFileSystem;
  
  beforeEach(() => {
    fs = new FakeFileSystem();
    adapter = new AgentSessionAdapter(fs, new FakePathResolver());
  });
  
  describe('domain property', () => {
    it('should have domain set to "agents"', () => {
      expect(adapter.domain).toBe('agents');
    });
  });
  
  // Additional adapter-specific tests...
});
```

**Option B** (Pragmatic): Update task T009 in tasks.md to note:
```markdown
| [x] | T009 | Write unit tests for AgentSessionAdapter (TDD RED) | 2 | Test | T006 | N/A - Covered by contract tests | – | Contract tests provide complete coverage |
```

---

### 7. MEDIUM: Missing Test Doc Blocks (DOC-001)

**File**: `/home/jak/substrate/015-better-agents/test/unit/workflow/agent-session-service.test.ts`

Add Test Doc blocks to these 7 tests:

**Line ~53** (should create copilot session):
```typescript
    it('should create copilot session', async () => {
      /*
      Test Doc:
      - Why: Verify service supports both agent types
      - Contract: createSession(ctx, 'copilot') → session.type = 'copilot'
      - Usage Notes: Same flow as claude, different type enum
      - Quality Contribution: Ensures agent type enum is correctly passed through
      - Worked Example: createSession(ctx, 'copilot') → { success: true, session: { type: 'copilot' } }
      */
```

**Line ~60** (should save session to adapter):
```typescript
    it('should save session to adapter', async () => {
      /*
      Test Doc:
      - Why: Verify service calls adapter.save() for persistence
      - Contract: createSession → adapter.save() called once
      - Usage Notes: Check adapter.saveCalls for call inspection
      - Quality Contribution: Ensures session is persisted, not just created in memory
      - Worked Example: createSession → saveCalls.length === 1
      */
```

*(Continue pattern for remaining 5 tests)*

---

### 8. MEDIUM: Inconsistent Error Codes (COR-003)

**File**: `/home/jak/substrate/015-better-agents/packages/workflow/src/adapters/agent-session.adapter.ts`
**Lines**: 181-189

**Current** (remove method catch block):
```typescript
    } catch {
      return {
        ok: false,
        errorCode: AgentSessionErrorCodes.SESSION_NOT_FOUND,
        errorMessage: `Session '${sessionId}' not found`,
      };
    }
```

**Fix**: Use INVALID_DATA for validation failures:
```typescript
    } catch {
      return {
        ok: false,
        errorCode: AgentSessionErrorCodes.INVALID_DATA,
        errorMessage: `Invalid session ID: '${sessionId}'`,
      };
    }
```

---

## Verification Commands

After applying fixes:

```bash
cd /home/jak/substrate/015-better-agents

# Run all Phase 1 tests
pnpm test packages/workflow packages/shared test/contracts test/unit/workflow

# Type check
pnpm typecheck

# Lint
pnpm lint

# Quality gate
just fft
```

**Expected**: All tests pass, zero lint errors, zero type errors.

---

## Re-Review

After fixes are applied, re-run code review:

```bash
plan-7-code-review --plan "/home/jak/substrate/015-better-agents/docs/plans/018-agents-workspace-data-model/agents-workspace-data-model-plan.md" --phase "Phase 1: AgentSession Entity + AgentSessionAdapter + Contract Tests"
```

**Target Verdict**: APPROVE

---

*Fix tasks generated by plan-7-code-review on 2026-01-28*
