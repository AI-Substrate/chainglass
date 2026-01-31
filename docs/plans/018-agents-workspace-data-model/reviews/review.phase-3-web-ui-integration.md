# Code Review: Phase 3 - Web UI Integration

**Plan**: Agent Workspace Data Model Migration (018)
**Phase**: Phase 3: Web UI Integration (Workspace-Scoped Agents Page)
**Review Date**: 2026-01-28
**Diff Range**: 88a5cf6..5c673fb
**Testing Approach**: Full TDD

---

## A) Verdict

**REQUEST_CHANGES**

Phase 3 implementation is functionally complete with strong TDD compliance and passing tests. However, graph integrity issues (missing footnotes/links) and several correctness/security findings require attention before merge.

---

## B) Summary

Phase 3 successfully delivers workspace-scoped agent pages, API routes, and UI components. Key achievements:
- 13 of 15 tasks completed (T013 E2E test, T014 manual smoke pending)
- All 387 contract tests passing (no prior phase regressions)
- Full TDD compliance with Fakes-only mock strategy (R-TEST-007)
- Clean lint and typecheck
- New ADR-0009 documents workspace-scoped SSE hook pattern

Critical blockers:
- **Graph integrity**: Footnote ledgers empty, no bidirectional Task↔Log links
- **Correctness**: Race condition in delete flow, missing error UI feedback
- **Security**: Medium concern - no workspace access control check

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log)
- [x] Tests as docs (assertions show behavioral expectations in contract tests)
- [x] Mock usage matches spec: **Fakes Only** (R-TEST-007 compliant - zero vi.mock usage)
- [x] Negative/edge cases covered (26 contract tests include error paths)

**Universal (all approaches)**:

- [x] BridgeContext patterns followed (paths via DI-injected resolvers)
- [x] Only in-scope files changed (verified against task table)
- [x] Linters/type checks are clean (581 files checked, 0 issues)
- [x] Absolute paths used (WorkspaceContext resolution throughout)

**Graph Integrity**:

- [ ] Task↔Log links present (Notes column missing log anchors)
- [ ] Task↔Footnote links present (No [^N] refs in tasks)
- [ ] Footnote↔File links valid (Ledger is placeholder only)
- [ ] Plan↔Dossier synchronized (Status mismatch: plan shows [ ], dossier shows [x])

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V1 | HIGH | Plan § 9 | Change Footnotes Ledger empty | Run plan-6a to populate footnotes |
| V2 | HIGH | tasks.md | Phase Footnote Stubs section empty | Run plan-6a to sync ledgers |
| V3 | HIGH | tasks.md | No log#anchor refs in Notes column | Add execution log anchors |
| V4 | MEDIUM | delete-session-button.tsx:43-46 | Race condition: push/refresh | Await router.push before refresh |
| V5 | MEDIUM | delete-session-button.tsx:47-50 | No user error feedback | Add toast/state for delete errors |
| V6 | MEDIUM | agents/[id]/page.tsx:98 | Back link drops worktree param | Preserve query param in href |
| V7 | MEDIUM | workspace access | No user-workspace membership check | Add access control before fs ops |
| V8 | LOW | route.ts:114-123 | No Zod schema for POST body | Add z.enum(['claude','copilot']) |
| V9 | LOW | agents/page.tsx:44 | Unhandled promise rejection | Add try-catch around context resolution |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Verdict: ✅ PASS**

- **Tests rerun**: 387 contract tests executed, 387 passed
- **Contract validation**: IAgentSessionAdapter and IAgentEventAdapter interfaces unchanged
- **Integration points**: Adapters correctly extend WorkspaceDataAdapterBase
- **Backward compatibility**: Subfolder storage migration is internal (no interface changes)

Phase 3 changes are non-breaking. Prior phase functionality fully preserved.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity Violations

**V1 - Footnotes Ledger Empty** (HIGH)
- **Link Type**: Footnote↔File
- **Issue**: Plan § 9 Change Footnotes Ledger contains only placeholder text: `[^1]: [To be added during implementation via plan-6a]`
- **Expected**: Actual footnote entries with FlowSpace node IDs for all 18 modified files
- **Fix**: Run `plan-6a-update-progress` to populate ledger atomically
- **Impact**: Cannot trace from code changes back to plan tasks

**V2 - Phase Footnote Stubs Empty** (HIGH)
- **Link Type**: Task↔Footnote
- **Issue**: tasks.md § Phase Footnote Stubs has empty table (no rows)
- **Expected**: Table with [^N], Task, Summary, FlowSpace Node IDs columns populated
- **Fix**: Run `plan-6a-update-progress` to populate stubs
- **Impact**: Breaks Task→File traversal for Phase 3

**V3 - Missing Log Anchors** (HIGH)
- **Link Type**: Task↔Log
- **Issue**: All 13 completed tasks ([x]) lack `log#anchor` in Notes column
- **Expected**: Notes like `[log#t001-di-container](execution.log.md#t001)` for bidirectional linking
- **Fix**: Add execution log anchors to Notes column for all completed tasks
- **Impact**: Cannot navigate from task to implementation evidence

**V4 - Plan↔Dossier Status Mismatch** (MEDIUM)
- **Link Type**: Plan↔Dossier
- **Issue**: Plan Phase 3 shows all tasks as `[ ]` (pending); Dossier shows `[x]` (completed)
- **Expected**: Status checkboxes match between plan and dossier
- **Fix**: Update plan Phase 3 task status to reflect completions

#### TDD Compliance

**Verdict: ✅ PASS**

- RED-GREEN-REFACTOR cycles documented in execution log
- Contract tests run against both FakeAgentSessionAdapter AND AgentSessionAdapter
- Zero vi.mock usage (Fakes Only per R-TEST-007)
- Test Doc comments include Why/Contract/Quality/Example sections
- `export const dynamic = 'force-dynamic'` present on all DI routes

### E.2) Semantic Analysis

Implementation matches spec requirements:
- ✅ Workspace-scoped API routes at `/api/workspaces/[slug]/agents`
- ✅ 307 redirect from `/agents` to first workspace
- ✅ Delete confirmation dialog with "cannot be undone" warning
- ✅ `notFound()` for invalid workspace/session per DYK-02

**Deviation noted**: Plan spec required dialog show session size, but DYK-05 decision simplified to no size display. This is documented and acceptable.

### E.3) Quality & Safety Analysis

**Safety Score: 72/100** (MEDIUM: 2, LOW: 2)

#### Correctness

**V4 - Race Condition in Delete Flow** (MEDIUM)
- **File**: apps/web/src/components/agents/delete-session-button.tsx:43-46
- **Issue**: `router.push()` followed immediately by `router.refresh()` without await
- **Impact**: Refresh may complete before navigation, causing UI inconsistency
- **Fix**:
```typescript
// Before
router.push(`/workspaces/${workspaceSlug}/agents`);
router.refresh();

// After
await router.push(`/workspaces/${workspaceSlug}/agents`);
router.refresh();
```

**V5 - Missing Error UI Feedback** (MEDIUM)
- **File**: apps/web/src/components/agents/delete-session-button.tsx:47-50
- **Issue**: Delete error logged to console but no user-facing feedback
- **Impact**: Users won't know deletion failed
- **Fix**: Add error state and toast/alert:
```typescript
const [error, setError] = useState<string | null>(null);
// In catch block:
setError(`Delete failed: ${error instanceof Error ? error.message : 'Unknown'}`);
```

**V6 - Back Link Drops Query Param** (MEDIUM)
- **File**: apps/web/app/(dashboard)/workspaces/[slug]/agents/[id]/page.tsx:98
- **Issue**: Back link to agents list doesn't preserve `?worktree=` param
- **Impact**: User loses worktree filter context
- **Fix**: `href={\`/workspaces/${slug}/agents${worktreePath ? \`?worktree=${encodeURIComponent(worktreePath)}\` : ''}\`}`

**V9 - Unhandled Promise in Context Resolution** (LOW)
- **File**: apps/web/app/(dashboard)/workspaces/[slug]/agents/page.tsx:44
- **Issue**: `resolveContextFromParams()` not wrapped in try-catch
- **Impact**: Page crashes instead of showing notFound()
- **Fix**: Wrap in try-catch, call `notFound()` on error

#### Security

**V7 - No Workspace Access Control** (MEDIUM)
- **File**: All workspace API routes
- **Issue**: `resolveContextFromParams()` validates workspace exists but not user membership
- **Impact**: Any authenticated user could access any workspace (if auth bypassed)
- **Fix**: Add membership check:
```typescript
const hasAccess = await checkUserWorkspaceAccess(currentUser, workspace.slug);
if (!hasAccess) return Response.json({ error: 'Forbidden' }, { status: 403 });
```
- **Note**: Verify existing auth middleware coverage

**V8 - No Zod Schema for POST Body** (LOW)
- **File**: apps/web/app/api/workspaces/[slug]/agents/route.ts:114-123
- **Issue**: Manual string comparison for `type` validation instead of Zod schema
- **Fix**: `const schema = z.object({ type: z.enum(['claude', 'copilot']) });`

### E.4) Doctrine Evolution Recommendations

**ADR Created**: ADR-0009 - Workspace-Scoped SSE Hooks ✅
- Documents `useWorkspaceSSE` as exemplar pattern
- Per DYK-04 decision

**No additional recommendations** - implementation follows existing ADRs and rules.

---

## F) Coverage Map

**Testing Approach**: Full TDD

| AC | Description | Test | Confidence |
|----|-------------|------|------------|
| AC-10 | API routes force-dynamic | routes have `export const dynamic` | 100% |
| AC-14 | Hard delete sessions | delete-session-button.tsx + route | 100% |
| AC-15 | /agents redirects to workspace | agents/page.tsx redirect logic | 100% |
| AC-16 | 307 redirect + deprecation | agents/page.tsx console.warn | 75% |
| T000 | Subfolder storage | agent-session-adapter.contract.test.ts | 100% |
| T001 | DI registration | di-container.test.ts (12 tests) | 100% |
| T002-T005 | API routes | Integration points verified | 75% (manual) |
| T007-T012 | UI components | Server components validated | 50% (no E2E) |

**Overall Coverage Confidence**: 75%

**Gap**: T013 (E2E test) and T014 (manual smoke) incomplete - reduces confidence for full flow validation.

---

## G) Commands Executed

```bash
# Static checks
cd /home/jak/substrate/015-better-agents && pnpm lint
cd /home/jak/substrate/015-better-agents && pnpm typecheck

# Tests
cd /home/jak/substrate/015-better-agents && pnpm test --filter=@chainglass/workflow
cd /home/jak/substrate/015-better-agents && pnpm test test/contracts/

# Diff analysis
git --no-pager diff 88a5cf6..5c673fb --stat
```

---

## H) Decision & Next Steps

**Verdict**: REQUEST_CHANGES

### Blocking Issues (must fix before merge):

1. **Run `plan-6a-update-progress`** to populate footnote ledgers (V1, V2)
2. **Add log anchors to task Notes column** (V3)
3. **Fix delete button race condition** (V4) - await router.push

### Recommended Issues (should fix):

4. Add error UI feedback for delete failures (V5)
5. Preserve worktree query param in back link (V6)
6. Verify workspace access control middleware (V7)

### Optional Improvements:

7. Add Zod schema for POST body (V8)
8. Add try-catch for context resolution (V9)
9. Complete T013 E2E test
10. Complete T014 manual smoke test

### After Fixes:

Re-run `/plan-7-code-review --phase "Phase 3: Web UI Integration"` to verify fixes.

---

## I) Footnotes Audit

**Status**: ❌ NOT POPULATED

Phase 3 modifies 18 files but Change Footnotes Ledger is empty. All files listed below lack corresponding footnote entries:

| File | Task | Footnote |
|------|------|----------|
| apps/web/app/(dashboard)/agents/page.tsx | T009 | ❌ Missing |
| apps/web/app/(dashboard)/agents/page.tsx.bak | T009 | ❌ Missing |
| apps/web/app/(dashboard)/workspaces/[slug]/agents/[id]/page.tsx | T008, T012 | ❌ Missing |
| apps/web/app/(dashboard)/workspaces/[slug]/agents/page.tsx | T007 | ❌ Missing |
| apps/web/app/(dashboard)/workspaces/[slug]/page.tsx | T010 | ❌ Missing |
| apps/web/app/api/workspaces/[slug]/agents/[id]/events/route.ts | T005 | ❌ Missing |
| apps/web/app/api/workspaces/[slug]/agents/[id]/route.ts | T004 | ❌ Missing |
| apps/web/app/api/workspaces/[slug]/agents/route.ts | T002, T003 | ❌ Missing |
| apps/web/src/components/agents/delete-session-button.tsx | T012 | ❌ Missing |
| apps/web/src/components/agents/delete-session-dialog.tsx | T011 | ❌ Missing |
| apps/web/src/hooks/useServerSession.ts | T005b | ❌ Missing |
| apps/web/src/hooks/useWorkspaceSSE.ts | T005a | ❌ Missing |
| apps/web/src/lib/di-container.ts | T001 | ❌ Missing |
| docs/adr/adr-0009-workspace-scoped-sse-hooks.md | T005a | ❌ Missing |
| packages/workflow/src/adapters/agent-session.adapter.ts | T000 | ❌ Missing |
| test/unit/web/app/agents/page.test.tsx | T012 | ❌ Missing |

**Action Required**: Run `plan-6a-update-progress --phase "Phase 3"` to generate footnote mappings.
