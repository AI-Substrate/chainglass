# Fix Tasks: Phase 4: Compose Navigation and Landing

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Restore collapsed-sidebar create-worktree reachability
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/dashboard-sidebar.tsx, /Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/workspaces/workspace-nav.tsx, /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.md, /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.fltplan.md, /Users/jordanknight/substrate/069-new-worktree/docs/how/workspaces/3-web-ui.md
- **Issue**: The authoritative Phase 4 plan/spec require the new-worktree action to remain reachable when the sidebar is collapsed, but the shipped code and docs narrowed the behavior to expanded-only.
- **Fix**: Add a collapsed-state affordance in the workspace header action cluster (or another always-visible collapsed workspace surface), keep the expanded Worktrees plus button, and sync the phase dossier/docs to the final behavior.
- **Patch hint**:
  ```diff
  - {!isCollapsed && (
  + {!isCollapsed && (
      <div className="flex items-center justify-between pr-1">
        ...expanded Worktrees label + plus button...
      </div>
    )}
  + {isCollapsed && isInWorkspace && workspaceSlug && (
  +   <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
  +     <Link href={workspaceHref(workspaceSlug, '/new-worktree')} aria-label="Create new worktree">
  +       <Plus className="h-3.5 w-3.5" />
  +     </Link>
  +   </Button>
  + )}
  ```

### FT-002: Repair the build-breaking workspace-actions import
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/workspaces/new-worktree-form.tsx
- **Issue**: `just build` fails because `new-worktree-form.tsx` imports `workspace-actions` via `../../../../app/actions/workspace-actions`, which does not resolve from `src/components/workspaces/`.
- **Fix**: Correct the relative import path, rerun `just build`, and keep the green output in the execution log.
- **Patch hint**:
  ```diff
  - } from '../../../../app/actions/workspace-actions';
  + } from '../../../app/actions/workspace-actions';
  ```

### FT-003: Capture real verification evidence and clear the remaining quality gates
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/execution.log.md, /Users/jordanknight/substrate/069-new-worktree/test/unit/web/components/new-worktree-form.test.tsx
- **Issue**: The phase has no execution log, `just lint` is red on import ordering in the Plan 069 test file, and there is no recorded manual/browser evidence for the success/blocking/bootstrap-warning flows.
- **Fix**: Sort the test imports if Biome still requires it, then record exact outputs for `just lint`, `just typecheck`, `just test`, and `just build`, plus observed manual verification for expanded and collapsed entrypoints, browser landing, blocking errors, and bootstrap-warning recovery.
- **Patch hint**:
  ```diff
  - import { describe, expect, it } from 'vitest';
  - import { normalizeSlug, buildWorktreeName } from '@chainglass/workflow';
  + import { buildWorktreeName, normalizeSlug } from '@chainglass/workflow';
  + import { describe, expect, it } from 'vitest';
  +
  +# Execution Log: Phase 4 — Compose Navigation and Landing
  +- Command: just lint
  +  - Result: PASS
  +- Command: just typecheck
  +  - Result: PASS
  +- Command: just test
  +  - Result: PASS
  +- Command: just build
  +  - Result: PASS
  +- Manual verification:
  +  - Expanded sidebar entrypoint: ...
  +  - Collapsed sidebar entrypoint: ...
  +  - Browser landing after create: ...
  +  - Blocking error / bootstrap warning: ...
  ```

## Medium / Low Fixes

### FT-004: Synchronize workspace domain artifacts
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md, /Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md
- **Issue**: The workspace history row landed, but the source inventory/composition notes and domain-map workspace node/summary are not fully current with the feature's actual composition surface and public contracts.
- **Fix**: Add the Phase 4 sidebar surface to the workspace domain doc and refresh the domain-map workspace node/health-summary row.
- **Patch hint**:
  ```diff
  - | Workspace pages + nav | Render workspace list/detail/worktree switching surfaces | `IWorkspaceService`, `workspaceHref`, `WorkspaceProvider` |
  + | Workspace pages + nav | Render workspace list/detail/worktree switching surfaces, including dashboard sidebar create-worktree entrypoints | `IWorkspaceService`, `workspaceHref`, `WorkspaceProvider` |
  + | `apps/web/src/components/dashboard-sidebar.tsx` | Dashboard sidebar composition | Expanded/collapsed worktree-create entrypoints |
  ```

### FT-005: Align the phase dossier with required merge gates
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.md, /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-4-compose-navigation-and-landing/tasks.fltplan.md
- **Issue**: T005/Stage 5 omit constitution-mandated `just typecheck` and `just build`, so the phase checklist under-specifies final verification.
- **Fix**: Update the dossier/flight plan so final verification explicitly requires `just lint`, `just typecheck`, `just test`, and `just build`, and so the stage wording matches the final collapsed/expanded behavior.
- **Patch hint**:
  ```diff
  - | [ ] | T005 | Run final verification: lint, tests, commit and push | workspace | — | `just lint` clean (our files). `pnpm test` passes. All 069 artifacts committed. | Per acceptance criteria. |
  + | [ ] | T005 | Run final verification: lint, typecheck, tests, build, commit and push | workspace | — | `just lint`, `just typecheck`, `just test`, and `just build` all pass. All 069 artifacts committed. | Per acceptance criteria and project rules. |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
