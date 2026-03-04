# Fix Tasks: Phase 4: Cross-Worktree & Left Menu

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Restrict badge aggregation to agent-owned entries
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/worktree-activity/route.ts
- **Issue**: `hasQuestions` / `hasErrors` / `hasWorking` use all entries, allowing non-agent work units to trigger sidebar badges.
- **Fix**: Filter to `creator.type === 'agent'` before deriving all three booleans and `agentCount`.
- **Patch hint**:
  ```diff
  -function summarize(worktreePath: string, entries: WorkUnitEntry[]): WorktreeActivitySummary {
  +function summarize(worktreePath: string, entries: WorkUnitEntry[]): WorktreeActivitySummary {
  +  const agentEntries = entries.filter((e) => e.creator?.type === 'agent');
     return {
       worktreePath,
  -    hasQuestions: entries.some((e) => e.status === 'waiting_input'),
  -    hasErrors: entries.some((e) => e.status === 'error'),
  -    hasWorking: entries.some((e) => e.status === 'working'),
  -    agentCount: entries.filter((e) => e.creator?.type === 'agent').length,
  +    hasQuestions: agentEntries.some((e) => e.status === 'waiting_input'),
  +    hasErrors: agentEntries.some((e) => e.status === 'error'),
  +    hasWorking: agentEntries.some((e) => e.status === 'working'),
  +    agentCount: agentEntries.length,
     };
   }
  ```

### FT-002: Remove infra → business coupling in workspace badge path
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/workspaces/workspace-nav.tsx
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/workspaces/activity-dot.tsx
- **Issue**: `_platform/panel-layout` imports `agents` internals (`use-worktree-activity` type/hook) and violates dependency-direction rules.
- **Fix**: Move activity-fetching ownership into business domain (agents) and pass plain badge props into panel-layout, or expose a contract/public export that preserves direction rules.
- **Patch hint**:
  ```diff
  -import { useWorktreeActivity } from '../../hooks/use-worktree-activity';
  -import type { WorktreeActivity } from '../../hooks/use-worktree-activity';
  +import type { WorktreeBadgeState } from '@/lib/contracts/worktree-activity';
  +// activity data injected via props/context from business domain wrapper
  ```

### FT-003: Add direct AC-29/30/31 verification with deterministic tests
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/test/unit/web/components/dashboard-sidebar.test.tsx
  - /Users/jordanknight/substrate/059-fix-agents/test/integration/web/dashboard-navigation.test.tsx
  - (new targeted tests allowed) /Users/jordanknight/substrate/059-fix-agents/test/unit/web/components/workspace-nav-activity.test.tsx
- **Issue**: Current test edits do not directly assert badge state mapping, other-worktree filtering, or badge click navigation; test run emits URL parse + `act(...)` warnings.
- **Fix**: Add focused assertions for AC-29/30/31 and fake/mocked fetch responses to remove nondeterministic network behavior.
- **Patch hint**:
  ```diff
  +const fetchMock = vi.fn().mockResolvedValue({
  +  ok: true,
  +  json: async () => ({ workspaces: [/* fixture with two worktrees */] }),
  +});
  +global.fetch = fetchMock as typeof fetch;
  +
  +// assert: current worktree hidden, other worktree shows amber/red/blue dot
  +// assert: click badge => href '/workspaces/<slug>/agents?worktree=<path>'
  ```

## Medium / Low Fixes

### FT-004: Synchronize domain artifacts and phase manifest
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/work-unit-state/domain.md
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md
- **Issue**: Domain docs/map/manifest are stale vs actual Phase 4 file ownership and dependencies.
- **Fix**: Update composition/source/dependency rows and manifest file mappings; ensure map edges are labeled and consistent with final code.
- **Patch hint**:
  ```diff
  -| `apps/web/src/components/dashboard-sidebar.tsx` | _platform/panel-layout | ... |
  -| `apps/web/src/hooks/useWorktreeActivity.ts` | agents | ... |
  +| `apps/web/src/components/workspaces/workspace-nav.tsx` | _platform/panel-layout | ... |
  +| `apps/web/src/hooks/use-worktree-activity.ts` | agents | ... |
  +| `test/unit/web/components/dashboard-sidebar.test.tsx` | agents/_platform/panel-layout | ... |
  ```

### FT-005: Reduce polling endpoint blocking I/O
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/worktree-activity/route.ts
- **Issue**: `existsSync`/`readFileSync` and repeated metadata lookups are synchronous and can block under polling load.
- **Fix**: Switch to async fs reads and add small TTL cache for validated paths (or equivalent memoized strategy).
- **Patch hint**:
  ```diff
  -if (!fs.existsSync(filePath)) return [];
  -const raw = fs.readFileSync(filePath, 'utf-8');
  +const raw = await fs.promises.readFile(filePath, 'utf-8').catch(() => null);
  +if (!raw) return [];
  ```

### FT-006: Align flight plan acceptance status with checklist
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-4-cross-worktree-left-menu/tasks.fltplan.md
- **Issue**: `Status: Landed` conflicts with unchecked AC-29/30/31.
- **Fix**: Either check ACs with evidence references or downgrade status until AC evidence is complete.
- **Patch hint**:
  ```diff
  -**Status**: Landed
  +**Status**: In Review
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review --phase "Phase 4: Cross-Worktree & Left Menu" --plan "/Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md"` and achieve zero HIGH/CRITICAL
