# Research Report: Work Unit Worktree Resolution

**Generated**: 2026-03-01T06:10:00Z
**Research Query**: "Fix work unit pages to thread worktree context — data reads/writes currently target main workspace instead of active worktree"
**Mode**: Pre-Plan
**Location**: `docs/plans/061-workunit-worktree-resolution/research-dossier.md`
**FlowSpace**: Available
**Findings**: 23 (from 4 targeted subagents + prior session research)

## Executive Summary

### What's Broken
Work unit pages (`/work-units/`, `/work-units/[unitSlug]/`) always read from and write to the **main workspace path**, ignoring the active git worktree. Every other worktree-aware feature (workflows, file browser, samples) correctly threads `?worktree=` through the URL.

### Business Impact
Users on worktree branches cannot create, edit, or view work units that belong to their branch. Units checked into one worktree are invisible from the web UI. This breaks the core developer workflow of branch-per-feature development.

### Key Insights
1. The fix is mechanical — copy the proven pattern from `workflow-actions.ts` (inline worktree validation against `info.worktrees[]`)
2. Navigation sidebar already preserves `?worktree=` via `workspaceHref()` — no nav changes needed
3. Zero test coverage exists for server action worktree resolution — opportunity to add lightweight tests
4. There are 2 duplicated `resolveWorkspaceContext` helpers across actions files; canonical service method exists but isn't used

### Quick Stats
- **Files to change**: ~9 (1 action file, 2 pages, ~6 components)
- **Duplicated resolvers**: 2 (workunit-actions + workflow-actions, should be consolidated or at minimum aligned)
- **Test coverage for resolvers**: 0 (no server action tests exist)
- **Prior learnings surfaced**: 18 relevant discoveries from Plans 014, 041, 050, 058
- **Domains affected**: `058-workunit-editor` (primary), cross-domain nav already handles worktree

---

## How It Currently Works

### The Bug: Hardcoded Main Workspace Path

```typescript
// apps/web/app/actions/workunit-actions.ts — THE BROKEN CODE
async function resolveWorkspaceContext(slug: string): Promise<WorkspaceContext | null> {
  const info = await workspaceService.getInfo(slug);
  if (!info) return null;
  return {
    workspacePath: info.path,
    worktreePath: info.path,        // ← ALWAYS main workspace
    worktreeBranch: null,           // ← Never resolved
    isMainWorktree: true,           // ← Always true
    // ...
  };
}
```

### The Correct Pattern (from workflow-actions.ts)

```typescript
// apps/web/app/actions/workflow-actions.ts — THE REFERENCE PATTERN
async function resolveWorkspaceContext(
  slug: string,
  worktreePath?: string              // ← Accepts worktree param
): Promise<WorkspaceContext | null> {
  const info = await workspaceService.getInfo(slug);
  if (!info) return null;

  const resolvedWorktreePath = worktreePath
    ? (info.worktrees.find((w) => w.path === worktreePath)?.path ?? info.path)
    : info.path;                     // ← Validates then falls back
  const wt = info.worktrees.find((w) => w.path === resolvedWorktreePath);

  return {
    workspacePath: info.path,
    worktreePath: resolvedWorktreePath,      // ← Resolved, not hardcoded
    worktreeBranch: wt?.branch ?? null,
    isMainWorktree: resolvedWorktreePath === info.path,
    // ...
  };
}
```

### The Canonical Service Method

```typescript
// packages/workflow/src/services/workspace.service.ts
// resolveContextFromParams(slug, worktreePath?) — does the same thing
// Already used by workspace-actions.ts (samples)
// Could consolidate all action files to use this
```

### Three-Layer Pattern (established codebase convention)

| Layer | Responsibility | Example |
|-------|---------------|---------|
| **Page** | Read `searchParams.worktree` | `const wt = sp.worktree` |
| **Action** | Validate against `info.worktrees[]`, fall back to `info.path` | `info.worktrees.find(w => w.path === wt)` |
| **Component** | Preserve `?worktree=` in links and save calls | `encodeURIComponent(wt)` |

---

## Feature Comparison: Who's Worktree-Aware?

| Feature | Reads `?worktree=`? | Threads to actions? | Links preserve it? | Status |
|---------|:---:|:---:|:---:|:---:|
| Workflows | ✅ | ✅ | ✅ | Correct |
| File Browser | ✅ | ✅ | ✅ | Correct |
| Samples | ✅ | ✅ | ✅ | Correct |
| **Work Units** | ❌ (list) / ⚠️ (editor, return only) | ❌ | ❌ | **Broken** |
| Agents | ❌ | ❌ | ❌ | Pre-existing (separate plan) |

---

## Navigation: Already Handled

The sidebar navigation renderer already appends `?worktree=` to all nav links via `workspaceHref()`:

```typescript
// dashboard-sidebar.tsx
const href = workspaceHref(workspaceSlug, item.href, {
  worktree: currentWorktree ?? undefined,
});
```

**No navigation changes needed.** When a user clicks "Work Units" in the sidebar while on a worktree, the URL already includes `?worktree=`. The work-units page just needs to read and use it.

---

## Resolver Duplication Analysis

| File | Resolver | Worktree? | Pattern |
|------|----------|:---------:|---------|
| `workflow-actions.ts` | `resolveWorkspaceContext(slug, wt?)` | ✅ | Inline validation |
| `workunit-actions.ts` | `resolveWorkspaceContext(slug)` | ❌ | Hardcoded |
| `workspace-actions.ts` | `resolveContextFromParams(slug, wt?)` | ✅ | Service method |

**Consolidation opportunity** (ARCH-001): Extract shared helper or align all to use `resolveContextFromParams()`. However, for the immediate fix, aligning workunit-actions to match workflow-actions is sufficient and lower risk.

---

## Test Coverage

### Existing (infrastructure level)
- ✅ `workspace-context-resolution.test.ts` — 11 tests for `resolveFromPath()`
- ✅ `git-worktree-resolver.test.ts` — 14 tests for `detectWorktrees()`
- ✅ Contract tests for WorkspaceContextResolver (real + fake)
- ✅ Test fixtures: `createDefaultContext()`, `createWorktreeContext()`

### Missing (action level)
- ❌ **Zero tests** for `workflow-actions.ts` resolver
- ❌ **Zero tests** for `workunit-actions.ts` resolver
- ❌ No integration tests for worktree-aware page behavior

### Recommended testing approach
- **Lightweight**: Add unit tests for the fixed `resolveWorkspaceContext` in workunit-actions
- **Leverage**: Existing `FakeWorkspaceService` and context fixtures
- **Skip**: E2E browser tests (mechanical prop-threading, not novel behavior)

---

## Prior Learnings (Key Selections)

### PL-01: Three-Layer Worktree Pattern
**Source**: Plan 014 Phase 6 + Plan 041 Phase 5
**Insight**: Page → Action → Component pattern is the established convention. Don't invent a new one.

### PL-02: Backward-Compatible Fallback
**Source**: Plan 014 Phase 4
**Insight**: Missing/invalid `?worktree=` always falls back to `info.path`. Existing URLs without the param continue working identically.

### PL-03: URL Encoding Required
**Source**: Plan 041 deep-linking workshop
**Insight**: Worktree paths contain `/`. Always `encodeURIComponent()` when constructing URLs. `searchParams` auto-decodes on read.

### PL-04: Context-Parameterized Operations
**Source**: Plan 014 Phase 4
**Insight**: Services take context as a parameter, never inferred from environment. This enables multi-context web servers and testable code.

### PL-05: Edit Template Round-Trip
**Source**: Plan 058 Phase 4
**Insight**: The `?worktree=` param is already present in the "Edit Template" link from workflows. The editor page reads it for the return link but doesn't use it for data loading. The fix is to thread it to data operations.

---

## Domain Context

### Primary Domain: `058-workunit-editor`
- All changed files are within this domain
- Server actions, pages, and components
- No new contracts needed — just threading an existing parameter

### Consumed Domains
- `_platform/workspace-url`: `workspaceHref()` already handles worktree in nav — no changes
- `_platform/positional-graph`: `IWorkUnitService` methods already accept `WorkspaceContext` with `worktreePath` — no changes
- `workflow-ui`: "Edit Template" already passes `?worktree=` — no changes

### No Domain Changes Needed
All infrastructure is in place. This is purely a plumbing fix within `058-workunit-editor`.

---

## Scope Summary

### Files to Change

| # | File | Change | Size |
|---|------|--------|------|
| 1 | `apps/web/app/actions/workunit-actions.ts` | Add `worktreePath?` to resolver + all 8 actions | M |
| 2 | `apps/web/app/(dashboard)/.../work-units/page.tsx` | Read `searchParams.worktree`, pass to action + component | S |
| 3 | `apps/web/app/(dashboard)/.../work-units/[unitSlug]/page.tsx` | Thread existing `worktree` param to all action calls | S |
| 4 | `.../058-workunit-editor/components/unit-list.tsx` | Add `worktreePath?` prop, append to links | S |
| 5 | `.../058-workunit-editor/components/workunit-editor.tsx` | Add `worktreePath?` prop, thread to save callbacks | M |
| 6 | `.../058-workunit-editor/components/unit-creation-modal.tsx` | Pass `worktreePath?` to `createUnit` | S |
| 7 | `.../058-workunit-editor/components/metadata-panel.tsx` | Pass `worktreePath?` to save callbacks | S |
| 8 | Editor left-panel sidebar | Append `?worktree=` to unit links | S |
| 9 | `test/unit/web/actions/workunit-actions.test.ts` | New: test worktree resolution | M |

### What Does NOT Need Changing
- Navigation sidebar (already uses `workspaceHref()`)
- `IWorkUnitService` (already accepts `WorkspaceContext` with `worktreePath`)
- File watcher / SSE notifications (already worktree-scoped)
- Doping script (uses `import.meta.dirname` → current checkout)

---

## Modification Risk Assessment

### ✅ Safe to Modify
- `workunit-actions.ts` — well-understood pattern, copy from workflow-actions
- Page files — mechanical searchParams reading
- Component props — additive (new optional prop)

### ⚠️ Caution
- Save callbacks in WorkUnitEditor — must thread worktreePath to all `useCallback` deps arrays
- UnitCreationModal — must redirect to new unit with `?worktree=` preserved

### 🚫 Don't Touch
- `workflow-actions.ts` — already correct, don't consolidate in this plan
- `WorkspaceService.resolveContextFromParams()` — canonical and tested
- Navigation renderer — already correct

---

## Recommendations

### Approach
- **Simple Mode plan** (CS-2): Single implementation phase, ~9 files
- Follow Workshop 006 design exactly
- Add lightweight server action tests (new)
- Verify with `just fft` + Playwright on port 3001

### Testing Strategy
- Unit tests for the fixed resolver function
- Manual verification via Playwright (navigate to work-units with `?worktree=` param)
- `just fft` gate

---

## Next Steps

1. Run `/plan-1b-specify` to create the specification
2. Or skip to `/plan-3-architect` since the design is fully captured in Workshop 006

**Research Complete**: 2026-03-01T06:10:00Z
**Report Location**: `docs/plans/061-workunit-worktree-resolution/research-dossier.md`
