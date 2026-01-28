# Phase 3: Fake Service Updates — Fix Tasks

**Generated From**: review.phase-3-fake-service-updates.md
**Date**: 2026-01-28
**Status**: Required for merge

---

## Overview

2 HIGH severity issues must be resolved before Phase 3 can be merged.
4 MEDIUM severity issues are recommended but non-blocking.

---

## Required Fixes (HIGH)

### FIX-001: Populate Change Footnotes Ledger

**Severity**: HIGH  
**Finding ID**: DOC-001  
**File**: `docs/plans/021-workgraph-workspaces-upgrade/workgraph-workspaces-upgrade-plan.md`  
**Lines**: 971-975

**Current State**:
```markdown
## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]
[^4]: [To be added during implementation via plan-6a]
[^5]: [To be added during implementation via plan-6a]
```

**Required State**:
```markdown
## Change Footnotes Ledger

[^1]: `file:packages/workgraph/src/fakes/fake-workgraph-service.ts` - Added getKey() helper, composite keys for 6 Maps, ctx in call types
[^2]: `file:packages/workgraph/src/fakes/fake-worknode-service.ts` - Added getKey() helper, composite keys for 13 Maps, ctx in 14 call types, getAnswer support
[^3]: `file:packages/workgraph/src/fakes/fake-workunit-service.ts` - Added getKey() helper, composite keys for 4 Maps, ctx in call types
[^4]: `file:test/helpers/workspace-context.ts` - NEW: Shared createTestWorkspaceContext() helper
[^5]: `file:test/unit/workgraph/fake-workspace-isolation.test.ts` - NEW: 11 workspace isolation tests
```

**Action**: Run `/plan-6a-update-progress` to sync footnotes, or manually populate with FlowSpace node IDs.

---

### FIX-002: Document Testing Approach Deviation

**Severity**: HIGH  
**Finding ID**: TDD-001  
**File**: `docs/plans/021-workgraph-workspaces-upgrade/tasks/phase-3-fake-service-updates/execution.log.md`  
**Lines**: 5-6

**Current State**:
```markdown
- **Started**: 2026-01-28T10:54:00Z
- **Completed**: 2026-01-28T11:05:00Z
- **Testing Approach**: Lightweight (contract tests verify behavior)
```

**Issue**: Plan specifies "Full TDD" but execution used "Lightweight". This is undocumented.

**Option A - Add Justification** (Recommended):
Add section after line 6:
```markdown
- **Testing Approach**: Lightweight (contract tests verify behavior)

### Testing Approach Deviation Note

The plan specifies Full TDD, but Phase 3 used Lightweight approach for the following reasons:

1. **Fake services are not business logic** - They are test infrastructure, not features
2. **Contract tests already validate behavior** - 34 existing contract tests cover interface compliance
3. **Isolation tests verify design goals** - 11 new tests validate the Phase 3 objective (workspace isolation)
4. **TDD overhead not justified** - Writing failing tests for Map key changes adds process without value

This deviation is scoped to fake service phases only. Future phases with business logic will use Full TDD.
```

**Option B - Update Plan Testing Section**:
Edit `workgraph-workspaces-upgrade-plan.md` lines 292-301:
```markdown
### Testing Approach

**Selected Approach**: Full TDD for service implementations, Lightweight for test infrastructure (fakes)
**Rationale**: 
- Service implementations warrant comprehensive TDD (cross-cutting changes)
- Fake service updates are verified via existing contract tests and new isolation tests
```

---

## Recommended Fixes (MEDIUM)

### FIX-003: Add ctx.worktreePath Validation to getKey()

**Severity**: MEDIUM  
**Finding ID**: CORR-002  
**Files**:
- `packages/workgraph/src/fakes/fake-workgraph-service.ts:101-103`
- `packages/workgraph/src/fakes/fake-worknode-service.ts:201-203`
- `packages/workgraph/src/fakes/fake-workunit-service.ts:76-78`

**Current Code** (FakeWorkGraphService):
```typescript
private getKey(ctx: WorkspaceContext, ...parts: string[]): string {
  return `${ctx.worktreePath}|${parts.join(':')}`;
}
```

**Recommended Code**:
```typescript
private getKey(ctx: WorkspaceContext, ...parts: string[]): string {
  if (!ctx?.worktreePath) {
    throw new Error('FakeWorkGraphService: ctx.worktreePath is required for key generation');
  }
  return `${ctx.worktreePath}|${parts.join(':')}`;
}
```

**Apply to all 3 fake services**.

---

### FIX-004: Filter Empty Parts in getKey()

**Severity**: MEDIUM  
**Finding ID**: CORR-003  
**Files**: Same as FIX-003

**Issue**: Empty string parts create malformed keys like `/path|graph::unit`

**Current Code**:
```typescript
return `${ctx.worktreePath}|${parts.join(':')}`;
```

**Recommended Code**:
```typescript
return `${ctx.worktreePath}|${parts.filter(Boolean).join(':')}`;
```

---

### FIX-005: Add options to setPresetClearResult

**Severity**: MEDIUM  
**Finding ID**: CORR-001  
**File**: `packages/workgraph/src/fakes/fake-worknode-service.ts:676-683`

**Issue**: `setPresetClearResult()` can't distinguish between different `force` flag scenarios.

**Current Code**:
```typescript
setPresetClearResult(
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  result: ClearResult
): void {
  this.presetClearResults.set(this.getKey(ctx, graphSlug, nodeId), result);
}
```

**Recommended Code**:
```typescript
setPresetClearResult(
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  options: ClearOptions,
  result: ClearResult
): void {
  const forceKey = options.force ? 'force' : 'noforce';
  this.presetClearResults.set(this.getKey(ctx, graphSlug, nodeId, forceKey), result);
}
```

**Also update `clear()` method key lookup** to include force flag.

---

### FIX-006: Use crypto.randomUUID() for Question IDs

**Severity**: MEDIUM  
**Finding ID**: CORR-004  
**File**: `packages/workgraph/src/fakes/fake-worknode-service.ts:754`

**Issue**: `Date.now()` could collide in rapid sequential calls.

**Current Code**:
```typescript
const questionId = `q-${Date.now()}`;
```

**Recommended Code**:
```typescript
import { randomUUID } from 'node:crypto';
// ...
const questionId = `q-${randomUUID().slice(0, 8)}`;
```

---

## Verification Steps

After applying fixes:

1. **Run contract tests**:
   ```bash
   pnpm test -- test/contracts/work*.contract.test.ts
   ```
   Expected: 34/34 pass

2. **Run isolation tests**:
   ```bash
   pnpm test -- test/unit/workgraph/fake-workspace-isolation.test.ts
   ```
   Expected: 11/11 pass

3. **Re-run code review**:
   ```bash
   /plan-7-code-review --phase "Phase 3: Fake Service Updates" --plan docs/plans/021-workgraph-workspaces-upgrade/workgraph-workspaces-upgrade-plan.md
   ```
   Expected: Verdict changes from REQUEST_CHANGES to APPROVE

---

## Fix Priority Order

1. **FIX-001** (Required) - Populate footnotes ledger
2. **FIX-002** (Required) - Document testing deviation
3. **FIX-003** (Recommended) - Add ctx validation
4. **FIX-004** (Recommended) - Filter empty parts
5. **FIX-005** (Recommended) - Add options to setPresetClearResult
6. **FIX-006** (Recommended) - Use UUID for question IDs

---

*Generated by plan-7-code-review agent*
