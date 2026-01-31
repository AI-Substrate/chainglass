# Fix Tasks: Phase 3 - Web UI Integration

**Plan**: Agent Workspace Data Model Migration (018)
**Phase**: Phase 3: Web UI Integration
**Generated**: 2026-01-28
**Testing Approach**: Full TDD

---

## Priority Order

Tasks ordered by severity: HIGH → MEDIUM → LOW

---

## FIX-001: Populate Footnote Ledgers (HIGH)

**Issue**: V1, V2 - Change Footnotes Ledger and Phase Footnote Stubs are empty
**Files**: 
- `docs/plans/018-agents-workspace-data-model/agents-workspace-data-model-plan.md` § 9
- `docs/plans/018-agents-workspace-data-model/tasks/phase-3-web-ui-integration/tasks.md` § Phase Footnote Stubs

**Fix**:
Run the footnote update command:
```bash
/plan-6a-update-progress --phase "Phase 3: Web UI Integration" --plan /home/jak/substrate/015-better-agents/docs/plans/018-agents-workspace-data-model/agents-workspace-data-model-plan.md
```

This will atomically update BOTH:
1. Plan § 9 Change Footnotes Ledger with [^N] entries
2. Dossier § Phase Footnote Stubs with matching entries

**Validation**: Verify 16+ footnotes created, one per modified file minimum.

---

## FIX-002: Add Log Anchors to Task Notes (HIGH)

**Issue**: V3 - All 13 completed tasks lack log#anchor refs in Notes column
**File**: `docs/plans/018-agents-workspace-data-model/tasks/phase-3-web-ui-integration/tasks.md`

**Fix**: Update Notes column for each completed task to include execution log anchor:

```markdown
| [x] | T000 | ... | ... | [log#t000](execution.log.md#task-t000-backport-refactor-agenttSessionadapter-to-subfolder-storage) |
| [x] | T001 | ... | ... | [log#t001](execution.log.md#task-t001-register-agent-adaptersservices-in-web-di-container) |
| [x] | T002 | ... | ... | [log#t002](execution.log.md#task-t002-get-apiworkspacesslugagents-route) |
...
```

**Alternative**: Add explicit anchor tags to execution log headings:
```markdown
## Task T000: Backport... {#t000}
## Task T001: Register... {#t001}
```

Then use short anchors: `[log#t000](execution.log.md#t000)`

**Validation**: Each [x] task has clickable link to execution log.

---

## FIX-003: Fix Delete Button Race Condition (HIGH)

**Issue**: V4 - `router.push()` and `router.refresh()` called without proper sequencing
**File**: `apps/web/src/components/agents/delete-session-button.tsx:43-46`

**Current Code**:
```typescript
router.push(`/workspaces/${workspaceSlug}/agents`);
router.refresh();
```

**Fix** (await the push):
```typescript
// Use startTransition to properly sequence navigation
startTransition(async () => {
  try {
    const response = await fetch(
      `/api/workspaces/${workspaceSlug}/agents/${sessionId}`,
      { method: 'DELETE' }
    );
    
    if (!response.ok) {
      throw new Error(`Delete failed: ${response.status}`);
    }
    
    setOpen(false);
    // Navigate first, then refresh
    router.push(`/workspaces/${workspaceSlug}/agents`);
    // refresh() not needed - push already loads fresh data
  } catch (error) {
    console.error('Failed to delete session:', error);
    setError(error instanceof Error ? error.message : 'Delete failed');
  }
});
```

**Test First** (TDD RED):
```typescript
it('should navigate to agents list after successful delete', async () => {
  /*
  Test Doc:
  - Why: Verify delete flow completes navigation before any refresh
  - Contract: Delete → navigate → show agents list
  - Quality Contribution: Prevents race condition UI glitch
  - Worked Example: Click delete → success → /workspaces/slug/agents shown
  */
  const mockPush = vi.fn().mockResolvedValue(undefined);
  // ... test implementation
});
```

**Validation**: Delete flow navigates cleanly without flash/glitch.

---

## FIX-004: Add Error UI Feedback for Delete (MEDIUM)

**Issue**: V5 - Delete errors logged to console but no user-facing feedback
**File**: `apps/web/src/components/agents/delete-session-button.tsx:47-50`

**Current Code**:
```typescript
} catch (error) {
  console.error('Failed to delete session:', error);
  // Keep dialog open on error
}
```

**Fix** (add error state):
```typescript
// Add state at component top
const [error, setError] = useState<string | null>(null);

// In catch block
} catch (err) {
  console.error('Failed to delete session:', err);
  setError(err instanceof Error ? err.message : 'Failed to delete session');
  // Dialog stays open, error shown
}

// In dialog render, add error display
{error && (
  <div className="text-red-600 text-sm mb-4">
    {error}
  </div>
)}
```

**Test First** (TDD RED):
```typescript
it('should display error message when delete fails', async () => {
  /*
  Test Doc:
  - Why: Users need feedback when delete fails
  - Contract: Delete fails → error message shown in dialog
  - Quality Contribution: Improves UX for error cases
  - Worked Example: Network error → "Failed to delete session" shown
  */
  // Mock fetch to reject
  // Click delete
  // Assert error message visible
});
```

**Validation**: Failed delete shows error text in dialog.

---

## FIX-005: Preserve Worktree Query Param in Back Link (MEDIUM)

**Issue**: V6 - Back link drops `?worktree=` parameter
**File**: `apps/web/app/(dashboard)/workspaces/[slug]/agents/[id]/page.tsx:98-100`

**Current Code**:
```typescript
<Link href={`/workspaces/${slug}/agents`} className="hover:underline">
```

**Fix**:
```typescript
// At top of component, get worktreePath from searchParams
const { worktree: worktreePath } = await searchParams;

// In Link href
<Link 
  href={`/workspaces/${slug}/agents${worktreePath ? `?worktree=${encodeURIComponent(worktreePath)}` : ''}`} 
  className="hover:underline"
>
```

**Validation**: Navigate to agent detail with `?worktree=`, click back, verify param preserved.

---

## FIX-006: Verify Workspace Access Control (MEDIUM)

**Issue**: V7 - No user-workspace membership verification
**Files**: All `/api/workspaces/[slug]/agents/*` routes

**Investigation Required**:
1. Check if auth middleware exists on `/api/workspaces/*` routes
2. Verify if user-workspace associations are managed elsewhere
3. Determine if explicit membership check is needed

**If fix required**:
```typescript
// In route handler after resolving context
const currentUser = await getCurrentUser(request);
if (!currentUser) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

const hasAccess = await checkWorkspaceMembership(currentUser.id, context.workspaceSlug);
if (!hasAccess) {
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}
```

**Validation**: Test that authenticated user without workspace access gets 403.

---

## FIX-007: Add Zod Schema for POST Body (LOW)

**Issue**: V8 - Manual string validation instead of Zod schema
**File**: `apps/web/app/api/workspaces/[slug]/agents/route.ts:114-123`

**Current Code**:
```typescript
if (!body.type || (body.type !== 'claude' && body.type !== 'copilot')) {
  return Response.json({ error: 'Invalid type' }, { status: 400 });
}
```

**Fix**:
```typescript
import { z } from 'zod';

const createSessionSchema = z.object({
  type: z.enum(['claude', 'copilot']),
});

// In POST handler
const parseResult = createSessionSchema.safeParse(body);
if (!parseResult.success) {
  return Response.json({ 
    error: 'Invalid request body',
    details: parseResult.error.issues 
  }, { status: 400 });
}
const { type } = parseResult.data;
```

**Validation**: POST with invalid type returns detailed validation error.

---

## FIX-008: Add Try-Catch for Context Resolution (LOW)

**Issue**: V9 - Unhandled promise in `resolveContextFromParams()`
**File**: `apps/web/app/(dashboard)/workspaces/[slug]/agents/page.tsx:44`

**Current Code**:
```typescript
const context = await workspaceService.resolveContextFromParams(slug, worktreePath);
```

**Fix**:
```typescript
let context: WorkspaceContext | null;
try {
  context = await workspaceService.resolveContextFromParams(slug, worktreePath);
} catch (error) {
  console.error('Failed to resolve workspace context:', error);
  notFound();
}

if (!context) {
  notFound();
}
```

**Validation**: Invalid workspace params result in 404 page, not crash.

---

## FIX-009: Complete E2E Test (T013) (RECOMMENDED)

**Issue**: E2E test for create → view → delete flow not implemented
**File**: `test/e2e/agent-workspace-integration.test.ts` (create)

**Scope**:
1. Create workspace with session
2. Navigate to `/workspaces/[slug]/agents`
3. Verify session appears in list
4. Click session to view detail
5. Delete session
6. Verify removal from list

**Test First approach**: Write test shell, verify it fails (RED), then ensure existing code passes (GREEN).

---

## FIX-010: Complete Manual Smoke Test (T014) (RECOMMENDED)

**Issue**: Manual verification not documented
**Scope**: Start dev server, manually verify:

1. `/workspaces/[slug]/agents` lists sessions
2. `/agents` redirects with deprecation warning in console
3. Delete flow shows confirmation dialog
4. SSE events stream correctly
5. Session detail page shows events

**Evidence**: Add screenshots or notes to execution log.

---

## Verification Checklist

After all fixes applied:

- [ ] Footnote ledgers populated (FIX-001)
- [ ] Task Notes have log anchors (FIX-002)
- [ ] Delete button navigates cleanly (FIX-003)
- [ ] Delete errors shown to user (FIX-004)
- [ ] Back link preserves worktree param (FIX-005)
- [ ] Access control verified (FIX-006)
- [ ] Re-run: `pnpm lint && pnpm typecheck && pnpm test`
- [ ] Re-run: `/plan-7-code-review --phase "Phase 3: Web UI Integration"`

Expected verdict after fixes: **APPROVE**
