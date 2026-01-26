# Phase 5: Commands & Integration - Fix Tasks

**Plan**: `/home/jak/substrate/002-agents/docs/plans/002-agent-control/agent-control-plan.md`
**Phase**: Phase 5: Commands & Integration
**Created**: 2026-01-23
**Testing Approach**: Full TDD (write tests first, then fix)

---

## Summary

4 blocking issues require fixes before merge approval.

---

## Fix Tasks

### FIX-001: Timer Resource Leak (COR-001)

**Severity**: HIGH
**File**: `packages/shared/src/services/agent.service.ts`
**Lines**: 243-248

**Issue**: `_createTimeoutPromise` creates a setTimeout that is never cleared when the run Promise wins the race. This leaves dangling timers that fire unnecessarily.

**Current Code**:
```typescript
private _createTimeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}
```

**TDD Approach**:

1. **Write test first** in `test/unit/services/agent-service.test.ts`:
```typescript
describe('timeout cleanup', () => {
  it('should clear timeout timer when run completes before timeout', async () => {
    // Use vi.useFakeTimers() to verify timer is cleared
    vi.useFakeTimers();
    
    const fastAdapter = new FakeAgentAdapter({
      sessionId: 'fast-session',
      output: 'Fast response',
      tokens: null,
      runDuration: 10, // 10ms - completes quickly
    });
    
    const longConfig = new FakeConfigService({
      agent: { timeout: 60000 }, // 1 minute
    });
    
    const service = new AgentService(() => fastAdapter, longConfig, fakeLogger);
    
    // Run should complete quickly
    const resultPromise = service.run({ prompt: 'test', agentType: 'fast' });
    await vi.runAllTimersAsync();
    await resultPromise;
    
    // Verify no pending timers
    expect(vi.getTimerCount()).toBe(0);
    
    vi.useRealTimers();
  });
});
```

2. **Fix implementation**:
```typescript
private _createTimeoutPromise(timeoutMs: number): { promise: Promise<never>; cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return { 
    promise, 
    cancel: () => clearTimeout(timeoutId) 
  };
}

// Update run() method:
async run(options: AgentServiceRunOptions): Promise<AgentResult> {
  // ... existing setup code ...
  
  const timeout = this._createTimeoutPromise(this._timeout);
  const runPromise = adapter.run({ prompt, sessionId, cwd });
  
  let result: AgentResult;
  let timedOut = false;
  
  try {
    result = await Promise.race([runPromise, timeout.promise]);
    timeout.cancel(); // Clear timer on success
  } catch (error) {
    timedOut = true;
    // ... existing timeout handling ...
  } finally {
    if (!timedOut) {
      timeout.cancel(); // Ensure cleanup in all paths
    }
  }
  
  // ... rest of method ...
}
```

**Validation**: Run `pnpm vitest run test/unit/services/agent-service.test.ts` - new test passes.

---

### FIX-002: Incomplete Timeout Termination (COR-002)

**Severity**: HIGH
**File**: `packages/shared/src/services/agent.service.ts`
**Lines**: 136-140

**Issue**: On timeout, `terminate()` is only called if `sessionId` was provided in options. For new sessions (no sessionId), the running process is never terminated.

**Current Code**:
```typescript
if (sessionId) {
  await adapter.terminate(sessionId).catch(() => {
    // Per DYK-01: Suppress late errors
  });
}
```

**TDD Approach**:

1. **Write test first**:
```typescript
describe('timeout termination', () => {
  it('should terminate adapter even without sessionId on timeout', async () => {
    const slowAdapter = new FakeAgentAdapter({
      sessionId: 'generated-session',
      output: 'Slow response',
      tokens: null,
      runDuration: 500,
    });
    
    const shortConfig = new FakeConfigService({
      agent: { timeout: 100 },
    });
    
    const service = new AgentService(() => slowAdapter, shortConfig, fakeLogger);
    
    // Run without providing sessionId (new session)
    const result = await service.run({ prompt: 'slow task', agentType: 'slow' });
    
    expect(result.status).toBe('failed');
    expect(slowAdapter.wasTerminated()).toBe(true); // Adapter should still be terminated
  });
});
```

2. **Fix implementation**:
```typescript
// Always attempt termination on timeout, using empty string if no sessionId
await adapter.terminate(sessionId ?? '').catch(() => {
  // Per DYK-01: Suppress late errors
});
```

**Validation**: Run test - should pass.

---

### FIX-003: Unbounded Session Tracking (PERF-001)

**Severity**: HIGH
**File**: `packages/shared/src/services/agent.service.ts`
**Lines**: 68-71, 153-163

**Issue**: `_activeSessions` Map grows indefinitely as sessions are only removed on explicit `terminate()` calls, not on normal completion.

**TDD Approach**:

1. **Write test first**:
```typescript
describe('session tracking cleanup', () => {
  it('should not track completed sessions indefinitely', async () => {
    const adapter = new FakeAgentAdapter({
      sessionId: 'test-session',
      output: 'Response',
      tokens: null,
    });
    
    const service = new AgentService(() => adapter, fakeConfig, fakeLogger);
    
    // Run 100 sessions
    for (let i = 0; i < 100; i++) {
      await service.run({ prompt: 'test', agentType: 'test' });
    }
    
    // Sessions should not accumulate (implementation detail, but important)
    // Alternative: expose getActiveSessionCount() for testing
    // Or: verify memory doesn't grow linearly
  });
  
  it('should only track sessions that might need termination', async () => {
    const adapter = new FakeAgentAdapter({
      sessionId: 'tracked-session',
      output: 'Response',
      tokens: null,
    });
    
    const service = new AgentService(() => adapter, fakeConfig, fakeLogger);
    
    // Run and complete
    const result = await service.run({ prompt: 'test', agentType: 'test' });
    
    // Completed sessions shouldn't be tracked for termination
    // Terminate should handle gracefully
    const terminateResult = await service.terminate(result.sessionId, 'test');
    // Should work but may indicate "session not active"
  });
});
```

2. **Fix implementation** - Two options:

**Option A**: Remove sessions after run completes (simple):
```typescript
async run(options: AgentServiceRunOptions): Promise<AgentResult> {
  // ... existing code ...
  
  // Don't track completed sessions - they're done
  // Only track during execution for potential terminate() calls
  return result;
}
```

**Option B**: Track only during execution, cleanup after:
```typescript
async run(options: AgentServiceRunOptions): Promise<AgentResult> {
  const adapter = this._adapterFactory(agentType);
  const tempSessionId = `pending-${Date.now()}-${Math.random()}`;
  
  // Track during execution
  this._activeSessions.set(tempSessionId, { adapter, agentType });
  
  try {
    const result = await Promise.race([runPromise, timeout.promise]);
    // ... handle result ...
    return result;
  } finally {
    // Always cleanup pending tracking
    this._activeSessions.delete(tempSessionId);
  }
}
```

**Recommended**: Option A - don't track completed sessions at all. The purpose of `_activeSessions` is to enable `terminate()` during long-running operations, not after completion.

---

### FIX-004: Add agentType Validation (SEC-001)

**Severity**: HIGH
**File**: `packages/shared/src/services/agent.service.ts`
**Lines**: 100-111

**Issue**: `agentType` parameter is passed directly to factory without validation in AgentService itself.

**TDD Approach**:

1. **Write test first**:
```typescript
describe('input validation', () => {
  it('should reject invalid agentType before calling factory', async () => {
    const factorySpy = vi.fn();
    const service = new AgentService(factorySpy, fakeConfig, fakeLogger);
    
    await expect(
      service.run({ prompt: 'test', agentType: 'hacker-type' })
    ).rejects.toThrow(/Invalid agent type/);
    
    // Factory should NOT have been called
    expect(factorySpy).not.toHaveBeenCalled();
  });
  
  it('should accept valid agentType values', async () => {
    for (const validType of ['claude-code', 'copilot']) {
      const result = await service.run({ prompt: 'test', agentType: validType });
      expect(result).toBeDefined();
    }
  });
});
```

2. **Fix implementation**:
```typescript
// Add at top of file
const ALLOWED_AGENT_TYPES = new Set(['claude-code', 'copilot']);

// Add validation in run()
async run(options: AgentServiceRunOptions): Promise<AgentResult> {
  const { prompt, agentType, sessionId, cwd } = options;
  
  // Input validation - fail fast
  if (!ALLOWED_AGENT_TYPES.has(agentType)) {
    throw new Error(`Invalid agent type: ${agentType}. Allowed: ${[...ALLOWED_AGENT_TYPES].join(', ')}`);
  }
  
  this._logger.debug('AgentService.run() called', { /* ... */ });
  
  // ... rest of method ...
}
```

**Validation**: Run tests - should pass.

---

## Test Commands

```bash
# Run specific Phase 5 tests
pnpm vitest run test/unit/services/agent-service.test.ts

# Run all tests to verify no regressions
pnpm test

# Type check
pnpm typecheck
```

---

## Completion Checklist

- [x] FIX-001: Timer cleanup implemented and tested
- [x] FIX-002: Timeout termination always fires
- [x] FIX-003: Session tracking cleaned up after run
- [x] FIX-004: agentType validation added
- [x] All existing tests still pass (463 passed)
- [x] Type check passes
- [ ] Re-run code review: `/plan-7-code-review --phase "Phase 5: Commands & Integration"`

---

*Fix tasks generated: 2026-01-23*
*Next: Implement fixes following TDD approach, then re-review*
