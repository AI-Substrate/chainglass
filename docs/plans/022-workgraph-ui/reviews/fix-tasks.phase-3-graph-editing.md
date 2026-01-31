# Fix Tasks: Phase 3 - Graph Editing

**Review**: [review.phase-3-graph-editing.md](./review.phase-3-graph-editing.md)
**Created**: 2026-01-29
**Priority**: CRITICAL issues first, then HIGH, then MEDIUM

---

## 🔴 CRITICAL: Constitution Violations (Must Fix First)

### FIX-001: Replace vi.fn() in drop-handler.test.ts

**File**: `test/unit/web/features/022-workgraph-ui/drop-handler.test.ts`
**Lines**: 112, 142, 167, 171, 173, 191, 224, 245, 249, 251, 268, 270

**Task**: Create FakeDragEvent and FakeCallback classes, replace 12 `vi.fn()` instances.

**Steps**:
1. Create `FakeDragEvent` class in `apps/web/src/features/022-workgraph-ui/`:
```typescript
export class FakeDragEvent {
  private dragData: Map<string, string> = new Map();
  public defaultPrevented = false;

  setData(type: string, data: string): void {
    this.dragData.set(type, data);
  }

  getData(type: string): string {
    return this.dragData.get(type) ?? '';
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  get dataTransfer() {
    return {
      getData: (type: string) => this.getData(type),
      setData: (type: string, data: string) => this.setData(type, data),
    };
  }
}
```

2. Create `FakeErrorCallback` class:
```typescript
export class FakeErrorCallback {
  public calls: string[] = [];

  handler = (message: string): void => {
    this.calls.push(message);
  };

  wasCalledWith(message: string): boolean {
    return this.calls.includes(message);
  }

  get callCount(): number {
    return this.calls.length;
  }
}
```

3. Update tests to use Fakes instead of `vi.fn()`.

---

### FIX-002: Replace vi.fn() in auto-save.test.ts

**File**: `test/unit/web/features/022-workgraph-ui/auto-save.test.ts`
**Lines**: 29, 55, 85, 105, 125, 128, 145

**Task**: Create FakeSaveFunction, replace 7 `vi.fn()` instances.

**Steps**:
1. Create `FakeSaveFunction` class:
```typescript
export class FakeSaveFunction {
  public calls: { timestamp: number }[] = [];
  private result: { errors: Array<{ code: string; message: string }> } = { errors: [] };

  setResult(result: { errors: Array<{ code: string; message: string }> }): void {
    this.result = result;
  }

  save = async (): Promise<{ errors: Array<{ code: string; message: string }> }> => {
    this.calls.push({ timestamp: Date.now() });
    return this.result;
  };

  get callCount(): number {
    return this.calls.length;
  }

  reset(): void {
    this.calls = [];
  }
}
```

2. Update tests to use `FakeSaveFunction.save` instead of `vi.fn().mockResolvedValue()`.

---

### FIX-003: Replace vi.fn() in workunit-toolbox.test.tsx

**File**: `test/unit/web/features/022-workgraph-ui/workunit-toolbox.test.tsx`
**Lines**: 34, 190

**Task**: Use existing FakeFetch pattern or create minimal Fake.

**Steps**:
1. If `FakeFetch` doesn't exist, create in feature folder:
```typescript
export class FakeFetchResponse {
  constructor(private data: unknown, private status = 200) {}

  json(): Promise<unknown> {
    return Promise.resolve(this.data);
  }

  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }
}

export class FakeFetch {
  public calls: Array<{ url: string; init?: RequestInit }> = [];
  private responses: Map<string, FakeFetchResponse> = new Map();

  setResponse(url: string, data: unknown, status = 200): void {
    this.responses.set(url, new FakeFetchResponse(data, status));
  }

  fetch = async (url: string, init?: RequestInit): Promise<FakeFetchResponse> => {
    this.calls.push({ url, init });
    return this.responses.get(url) ?? new FakeFetchResponse({ error: 'Not found' }, 404);
  };
}
```

2. Update tests to use `FakeFetch.fetch` instead of `vi.fn()`.

---

### FIX-004: Replace vi.fn() in edge-connection.test.ts & node-deletion.test.ts

**Files**:
- `test/unit/web/features/022-workgraph-ui/edge-connection.test.ts:99`
- `test/unit/web/features/022-workgraph-ui/node-deletion.test.ts:97`

**Task**: Create FakeSubscriber, replace 2 `vi.fn()` instances.

**Steps**:
1. Create `FakeSubscriber` class:
```typescript
export class FakeSubscriber<T = unknown> {
  public calls: T[] = [];

  handler = (event: T): void => {
    this.calls.push(event);
  };

  wasCalledWith(event: T): boolean {
    return this.calls.some(c => JSON.stringify(c) === JSON.stringify(event));
  }

  get callCount(): number {
    return this.calls.length;
  }
}
```

2. Update both test files to use `FakeSubscriber.handler` instead of `vi.fn()`.

---

### FIX-005: Sanitize Error Messages in API Routes

**File**: `apps/web/app/api/workspaces/[slug]/workgraphs/[graphSlug]/nodes/route.ts`
**Line**: 119

**Task**: Remove raw error.message from response.

**Patch**:
```diff
  } catch (error) {
-   const errorMessage = error instanceof Error ? error.message : 'Failed to add node';
-   return Response.json({ errors: [{ code: 'E500', message: errorMessage }] }, { status: 500 });
+   console.error('[POST /nodes] Internal error:', error);
+   return Response.json(
+     { errors: [{ code: 'E500', message: 'Internal server error' }] },
+     { status: 500 }
+   );
  }
```

**Also apply to**:
- `edges/route.ts` (similar pattern)
- `units/route.ts` (similar pattern)

---

## 🟠 HIGH: Correctness Issues

### FIX-006: Use UUID for Edge IDs

**File**: `apps/web/src/features/022-workgraph-ui/workgraph-ui.instance.ts`
**Line**: 492

**Task**: Replace index-based edge ID with UUID.

**Patch**:
```diff
  async connectNodes(...): Promise<ConnectNodesResult> {
    // ...
-   const edgeId = `edge-${this._edges.length}`;
+   const edgeId = `edge-${crypto.randomUUID().slice(0, 8)}`;
    const newEdge: UIEdge = {
      id: edgeId,
      source: sourceNodeId,
      target: targetNodeId,
    };
```

---

### FIX-007: Fix Result Type Check in Drop Handler

**File**: `apps/web/src/features/022-workgraph-ui/drop-handler.ts`
**Line**: 151 (approximate)

**Task**: Check `errors` array instead of `success` property.

**Patch**:
```diff
  const result = await instance.addUnconnectedNode(unitSlug, position);
- if (!result.success) {
+ if (result.errors && result.errors.length > 0) {
    onError?.(result.errors[0]?.message ?? 'Failed to add node');
    return;
  }
```

---

### FIX-008: Define MutationResult Type

**File**: `apps/web/src/features/022-workgraph-ui/workgraph-ui.types.ts`

**Task**: Add missing type definition.

**Add**:
```typescript
export interface MutationResult {
  success: boolean;
  errors: Array<{ code: string; message: string; action?: string }>;
}
```

**Then update**: `use-workgraph-api.ts` to use this type.

---

## 🟡 MEDIUM: Path Validation & Documentation

### FIX-009: Add Path Validation to API Routes

**Files**: All 3 API routes

**Task**: Validate `worktreePath` parameter.

**Add utility**:
```typescript
function isValidPath(path: string | null): boolean {
  if (!path) return true; // null is OK (uses default)
  if (path.includes('..') || path.includes('\0')) return false;
  return /^[a-zA-Z0-9/_.-]+$/.test(path);
}
```

**Use in routes**:
```typescript
if (!isValidPath(worktreePath)) {
  return Response.json(
    { errors: [{ code: 'E400', message: 'Invalid worktree path' }] },
    { status: 400 }
  );
}
```

---

### FIX-010: Add Runtime Validation to Drop Handler

**File**: `apps/web/src/features/022-workgraph-ui/drop-handler.ts`
**Line**: ~95

**Task**: Validate parsed drag data at runtime.

**Patch**:
```diff
  try {
    const parsed = JSON.parse(data);
+   // Runtime validation
+   if (typeof parsed.unitSlug !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(parsed.unitSlug)) {
+     return null;
+   }
+   if (typeof parsed.unitType !== 'string') {
+     return null;
+   }
    return parsed as WorkUnitDragData;
  } catch {
    return null;
  }
```

---

### FIX-011: Add Missing Execution Log Entries

**File**: `docs/plans/022-workgraph-ui/tasks/phase-3-graph-editing/execution.log.md`

**Task**: Add dedicated sections for:
- T007 (Edge Connection Implementation)
- T008 (Node Deletion Tests)
- T009 (Node Deletion Implementation)
- T011 (Auto-Save Implementation)
- T015 (Optimistic Rollback Tests)
- T018 (PlanPak Symlinks)

Each entry should include: Started timestamp, What I Did, Evidence, Files Changed, Completed timestamp.

---

## Testing After Fixes

After applying all fixes, run:

```bash
# Verify no vi.fn() remaining
grep -r "vi\.fn\(\)" test/unit/web/features/022-workgraph-ui/

# Run tests
pnpm test

# Type check
pnpm typecheck

# Re-run review
# /plan-7-code-review --phase "Phase 3: Graph Editing"
```

---

## Verification Checklist

- [ ] FIX-001: FakeDragEvent created, drop-handler.test.ts updated
- [ ] FIX-002: FakeSaveFunction created, auto-save.test.ts updated
- [ ] FIX-003: FakeFetch created, workunit-toolbox.test.tsx updated
- [ ] FIX-004: FakeSubscriber created, edge/node tests updated
- [ ] FIX-005: Error messages sanitized in all API routes
- [ ] FIX-006: Edge IDs use UUID
- [ ] FIX-007: Drop handler checks errors array
- [ ] FIX-008: MutationResult type defined
- [ ] FIX-009: Path validation added to routes
- [ ] FIX-010: Runtime validation in drop handler
- [ ] FIX-011: Missing log entries added
- [ ] All tests pass
- [ ] No grep matches for `vi.fn()` in Phase 3 tests
