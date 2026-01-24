# Fix Tasks: Subtask 001 - Message CLI Commands

**Generated**: 2026-01-23T07:47 UTC
**Review**: [review.001-subtask-message-cli-commands.md](./review.001-subtask-message-cli-commands.md)
**Testing Approach**: Full TDD

---

## Priority Order

Fix in this order (security first, then correctness, then documentation):

1. SEC-001: Path Traversal (CRITICAL)
2. SEC-002: JSON Parse Errors (HIGH)
3. COR-001: Race Condition Documentation (HIGH)
4. DOC-001: Execution Log Entries (HIGH)
5. LNT-001/002: Lint Fixes (MEDIUM/LOW)

---

## Fix Task 1: SEC-001 - Path Traversal Vulnerability

**Severity**: CRITICAL
**File**: `/home/jak/substrate/003-wf-basics/packages/workflow/src/services/message.service.ts`
**Testing**: Write test first (TDD)

### Step 1: Write Failing Test

Add to `/home/jak/substrate/003-wf-basics/test/unit/workflow/message-service.test.ts`:

```typescript
describe('Security: Path Traversal Prevention', () => {
  it('should reject phase names with path traversal sequences', async () => {
    /*
    Test Doc:
    - Why: Prevent directory traversal attacks via phase parameter
    - Contract: create() returns E064 for invalid phase names
    - Usage Notes: Phase names must be alphanumeric with hyphen/underscore only
    - Quality Contribution: Security hardening
    - Worked Example: create('../../malicious', ...) → E064
    */
    const result = await service.create('../../malicious', runDir, 'free_text', validContent);
    
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_VALIDATION_FAILED);
    expect(result.errors[0].message).toContain('Invalid phase name');
  });

  it('should reject message IDs with path traversal sequences', async () => {
    /*
    Test Doc:
    - Why: Prevent directory traversal attacks via message ID parameter
    - Contract: read() returns E060 for invalid message IDs
    - Usage Notes: Message IDs must be 3-digit strings only
    - Quality Contribution: Security hardening
    - Worked Example: read('001/../../../etc/passwd', ...) → E060
    */
    const result = await service.read(phase, runDir, '001/../../../etc/passwd');
    
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_NOT_FOUND);
  });
});
```

### Step 2: Implement Validation

Add validation helpers to `message.service.ts`:

```typescript
// Add near top of file, after imports
/**
 * Validates phase name to prevent path traversal.
 * Phase names must be alphanumeric with hyphen/underscore only.
 */
private validatePhaseName(phase: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(phase)) {
    throw new Error(`Invalid phase name: ${phase}`);
  }
}

/**
 * Validates message ID to prevent path traversal.
 * Message IDs must be 3-digit strings only.
 */
private validateMessageId(id: string): void {
  if (!/^\d{3}$/.test(id)) {
    throw new Error(`Invalid message ID: ${id}`);
  }
}
```

### Step 3: Apply Validation

Add validation at the start of each public method:

```typescript
// In create() - add after method signature
public async create(phase: string, runDir: string, ...): Promise<MessageCreateResult> {
  try {
    this.validatePhaseName(phase);
  } catch (e) {
    return this.createErrorResult<MessageCreateResult>(
      phase, runDir, MessageErrorCodes.MESSAGE_VALIDATION_FAILED,
      { message: (e as Error).message, action: 'Use alphanumeric phase name with hyphens/underscores only' },
      { phase, messageId: null, filePath: null, created_at: null }
    );
  }
  // ... rest of method
}

// In read(), answer(), list() - add similar validation
public async read(phase: string, runDir: string, id: string): Promise<MessageReadResult> {
  try {
    this.validatePhaseName(phase);
    this.validateMessageId(id);
  } catch (e) {
    return this.createErrorResult<MessageReadResult>(
      phase, runDir, MessageErrorCodes.MESSAGE_NOT_FOUND,
      { message: (e as Error).message, action: 'Provide valid 3-digit message ID' },
      { phase, message: null }
    );
  }
  // ... rest of method
}
```

### Step 4: Run Tests

```bash
pnpm test -- --run test/unit/workflow/message-service.test.ts
# Expected: New security tests pass
```

---

## Fix Task 2: SEC-002 - JSON Parse Error Handling

**Severity**: HIGH
**File**: `/home/jak/substrate/003-wf-basics/packages/workflow/src/services/message.service.ts`
**Lines**: 137, 211, 260, 417
**Testing**: Write test first (TDD)

### Step 1: Write Failing Test

Add to `/home/jak/substrate/003-wf-basics/test/unit/workflow/message-service.test.ts`:

```typescript
describe('Error Handling: Malformed Files', () => {
  it('should return E064 when message file contains invalid JSON', async () => {
    /*
    Test Doc:
    - Why: Gracefully handle corrupted message files
    - Contract: read() returns E064 for malformed JSON instead of crashing
    - Usage Notes: Malformed files may occur from manual editing or disk errors
    - Quality Contribution: Robustness
    - Worked Example: read() on file with "{ invalid json }" → E064
    */
    // Setup: Write invalid JSON to message file
    await fs.mkdir(`${runDir}/phases/${phase}/run/messages`, { recursive: true });
    await fs.writeFile(`${runDir}/phases/${phase}/run/messages/m-001.json`, '{ invalid json }');
    
    const result = await service.read(phase, runDir, '001');
    
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe(MessageErrorCodes.MESSAGE_VALIDATION_FAILED);
    expect(result.errors[0].message).toContain('Invalid JSON');
  });
});
```

### Step 2: Wrap JSON.parse Calls

Replace each `JSON.parse()` call with try-catch:

**Line ~137 (in read method):**
```typescript
// Before
const message: Message = JSON.parse(messageContent);

// After
let message: Message;
try {
  message = JSON.parse(messageContent);
} catch (e) {
  return this.createErrorResult<MessageReadResult>(
    phase, runDir, MessageErrorCodes.MESSAGE_VALIDATION_FAILED,
    { message: `Invalid JSON in message file: ${(e as Error).message}`, path: filePath, action: 'Check file integrity or recreate message' },
    { phase, message: null }
  );
}
```

Apply similar pattern to lines 211, 260, 417.

### Step 3: Run Tests

```bash
pnpm test -- --run test/unit/workflow/message-service.test.ts
# Expected: New error handling tests pass
```

---

## Fix Task 3: COR-001 - Document Single-Writer Constraint

**Severity**: HIGH
**File**: `/home/jak/substrate/003-wf-basics/packages/workflow/src/services/message.service.ts`
**Testing**: N/A (documentation only)

### Add JSDoc Warning

Add to the class-level JSDoc comment:

```typescript
/**
 * MessageService - Manages agent-orchestrator message communication.
 * 
 * @remarks
 * **IMPORTANT: Single-Writer Constraint**
 * 
 * This service follows the Facilitator Model where control passes between
 * agent and orchestrator. The status log (wf-phase.json) is updated using
 * a read-modify-write pattern that is NOT atomic.
 * 
 * **Concurrent calls from the same actor may result in lost status entries.**
 * 
 * This is acceptable under the Facilitator Model because:
 * - Only one actor (agent OR orchestrator) has control at a time
 * - The controlling actor should serialize their own operations
 * - Status log is for audit/discoverability, not critical state
 * 
 * If concurrent access is required in the future, implement file locking
 * in the appendStatusEntry() method.
 */
export class MessageService implements IMessageService {
```

---

## Fix Task 4: DOC-001 - Add Missing Execution Log Entries

**Severity**: HIGH
**File**: `/home/jak/substrate/003-wf-basics/docs/plans/003-wf-basics/tasks/phase-3-phase-operations/001-subtask-implement-message-cli-commands.execution.log.md`

### Add Missing Entries

The execution log groups tasks under combined headers. While acceptable, individual task entries improve traceability. Consider adding explicit task markers:

**Option A (Minimal)**: The grouped entries are acceptable. Mark task as "noted but accepted" in review.

**Option B (Complete)**: Add individual task status markers at the end of each grouped section:

```markdown
## Tasks ST007-ST010: list() and read() tests and verification
...existing content...

**Task Status:**
- ST007: ✅ Complete - 5 list() tests written
- ST008: ✅ Complete - list() implementation verified
- ST009: ✅ Complete - 3 read() tests written  
- ST010: ✅ Complete - read() implementation verified
```

---

## Fix Task 5: LNT-001/002 - Lint Fixes

**Severity**: MEDIUM/LOW
**Command**: Auto-fix available

### Run Auto-Fix

```bash
cd /home/jak/substrate/003-wf-basics
pnpm exec biome check --fix packages/ apps/ test/
```

### Manual Fix (if needed)

**LNT-001** (message.service.ts:286):
```typescript
// Before
const maxId = Math.max(...ids, 0);
return String(maxId + 1).padStart(3, '0');

// After  
const maxId = Math.max(...ids, 0);
return String(maxId + 1).padStart(3, '0');
// Note: The actual issue is using parseInt() somewhere - use Number.parseInt()
```

---

## Verification Checklist

After applying fixes:

- [ ] Security tests pass: `pnpm test -- --run test/unit/workflow/message-service.test.ts`
- [ ] Full test suite passes: `pnpm test`
- [ ] Type check passes: `pnpm typecheck`
- [ ] Lint cleaner: `pnpm exec biome check packages/ apps/ test/`
- [ ] Build succeeds: `pnpm build`

---

## Re-Review Command

After fixes are applied:

```
/plan-7-code-review --phase "Subtask 001" --plan "/home/jak/substrate/003-wf-basics/docs/plans/003-wf-basics/wf-basics-plan.md"
```

Expected outcome: **APPROVE** (all HIGH/CRITICAL findings resolved)
