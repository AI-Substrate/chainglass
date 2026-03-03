# Code Review: Phase 3: Terminal Page (Surface 1)

**Plan**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md
**Spec**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-spec.md
**Phase**: Phase 3: Terminal Page (Surface 1)
**Date**: 2026-03-03
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

High-severity issues remain in security posture and domain-boundary compliance.

**Key failure areas**:
- **Implementation**: WebSocket server exposure widened to `0.0.0.0` without auth/origin controls.
- **Domain compliance**: Terminal page imports `_platform/panel-layout` internal file path directly instead of contract export.
- **Reinvention**: New terminal sessions API duplicates existing session-listing capability already present in terminal server domain.
- **Testing**: Evidence is mostly lightweight UI-only and does not verify key phase outcomes (session deep-linking, resize/nav runtime behavior).
- **Doctrine**: Route-level process logic bypasses service/DI integration conventions documented in project rules.

## B) Summary

Phase 3 landed most requested surface files and basic session-list UI behavior, but it also introduced a high-risk runtime exposure by binding terminal WebSocket access to all interfaces. Domain rules are not fully met because cross-domain imports use an internal file path and domain artifacts are partially out of sync with changed files. Anti-reinvention checks found the new HTTP session-list route overlaps with `TmuxSessionManager.listSessions()` instead of reusing/extending existing terminal-domain logic. Testing evidence is adequate for session-list rendering but insufficient for ACs tied to URL-backed selection, resize/refit behavior, and workspace-context navigation visibility.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Lightweight UI validation exists for session-list rendering (`terminal-session-list.test.tsx`)
- [ ] Backend-facing additions (session-list API + hook behavior) have fake-backed/TDD-style coverage
- [ ] Runtime/manual verification evidence exists for resize/refit and workspace-only nav visibility
- [ ] URL-backed session selection behavior is validated with concrete evidence

Universal:
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable) with captured output
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts:129-131,156 | security | WS server now binds `0.0.0.0` without auth/origin guard. | Default bind to localhost (`127.0.0.1`) and require explicit opt-in + auth controls for remote exposure. |
| F002 | HIGH | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-page-client.tsx:5 | contract-imports | Terminal imports `LeftPanelMode` from another domain's internal path. | Import `LeftPanelMode` from public barrel `@/features/_platform/panel-layout`. |
| F003 | MEDIUM | /Users/jordanknight/substrate/064-tmux/apps/web/app/(dashboard)/workspaces/[slug]/terminal/page.tsx:24-50 | correctness | `?session=` query is not consumed, so deep-link selection is not honored. | Parse/persist `session` param and pass initial selection through client/hook flow. |
| F004 | MEDIUM | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-sessions.ts:10-17,78-85; /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-session-list.tsx:5-11 | scope | Task dossier expects create/select actions; implementation currently exposes select/refresh only. | Add create-session action + UI trigger, or formally update phase scope/docs. |
| F005 | MEDIUM | /Users/jordanknight/substrate/064-tmux/apps/web/app/api/terminal/route.ts:13-47 | pattern/reinvention | API route shells out/parses sessions inline, overlapping `TmuxSessionManager.listSessions()`. | Reuse/extend terminal service boundary via DI-resolved service instead of duplicating route logic. |
| F006 | MEDIUM | /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md:25-64; /Users/jordanknight/substrate/064-tmux/docs/domains/domain-map.md:88-105; /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md:62-85 | domain-docs | Domain manifest/source map artifacts are out of sync with Phase 3 file set (API route ownership, path prefixes, health summary consumers). | Update domain artifacts to reflect actual files, ownership, and map edges/summary consistency. |
| F007 | MEDIUM | /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-3-terminal-page-surface-1/execution.log.md:37-43; /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/terminal-session-list.test.tsx:1-123 | testing-evidence | Evidence confirms session-list rendering but lacks concrete verification artifacts for AC-01/07/08/10/12. | Add targeted tests/manual run logs tying each AC to command/output or observed runtime result. |
| F008 | LOW | /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-3-terminal-page-surface-1/tasks.md:219; /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-3-terminal-page-surface-1/tasks.fltplan.md:74-79 | docs-sync | DYK note references `/api/terminal/sessions` while implementation is `/api/terminal`; stage markers remain partially incomplete despite landed status. | Synchronize phase docs with implemented route path and final stage completion state. |
| F009 | LOW | /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md:108-117 | concepts-docs | Concepts table does not explicitly cover `terminalParams` contract listed in Contracts. | Add `terminalParams` concept row with entry point and behavior summary. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH / security)**: `terminal-ws.ts` changed bind host from `127.0.0.1` to `0.0.0.0`, expanding attack surface to network-reachable terminal I/O.
- **F003 (MEDIUM / correctness)**: terminal route resolves workspace + worktree but does not apply the `session` query contract, breaking URL-backed selection behavior.
- **F004 (MEDIUM / scope)**: session hook/list do not implement create-session action expected by T002/T003 acceptance intent.
- **F005 (MEDIUM / pattern/reinvention)**: session-list route duplicates shell/parsing logic and bypasses service integration patterns.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | New `app/api/terminal/route.ts` not fully reflected in domain ownership docs/manifest. |
| Contract-only imports | ❌ | `terminal-page-client.tsx` imports `LeftPanelMode` from internal `_platform/panel-layout/components/left-panel`. |
| Dependency direction | ✅ | No infra→business inversion detected in changed source imports. |
| Domain.md updated | ❌ | History updated, but Source Location/Composition/Concepts do not fully capture all Phase 3 additions. |
| Registry current | ✅ | `terminal` remains correctly registered in `/docs/domains/registry.md`. |
| No orphan files | ❌ | Phase 3 changed files are not fully represented in plan/domain manifests with exact paths. |
| Map nodes current | ✅ | `terminal` node is present in map. |
| Map edges current | ❌ | Domain Health Summary consumers/providers are stale relative to labeled edges. |
| No circular business deps | ✅ | No business-domain cycle introduced by this phase diff. |
| Concepts documented | ⚠️ | Concepts table exists, but at least one listed contract (`terminalParams`) lacks explicit concept row. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `/apps/web/app/api/terminal/route.ts` session-list handler | `TmuxSessionManager.listSessions()` | terminal | ⚠️ overlap — recommendation: **extend/reuse** |
| `/apps/web/src/features/064-terminal/hooks/use-terminal-sessions.ts` | None found | terminal | ✅ proceed |
| `/apps/web/src/features/064-terminal/components/terminal-session-list.tsx` | None found | terminal | ✅ proceed |
| `/apps/web/src/features/064-terminal/components/terminal-page-header.tsx` | `PanelHeader` pattern | _platform/panel-layout | ✅ acceptable specialization |
| `/apps/web/src/features/064-terminal/components/terminal-page-client.tsx` | Browser page PanelShell composition pattern | file-browser | ✅ proceed |
| `/apps/web/src/features/064-terminal/params/terminal.params.ts` | file-browser/workspace params pattern | _platform/workspace-url | ✅ proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 50%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 30% | Route/page composition exists, but no evidence proving create-or-attach behavior on first load path. |
| AC-07 | 45% | Uses existing PanelShell + TerminalView composition; no explicit resize/refit verification evidence. |
| AC-08 | 40% | Inherits resizable panel primitives; no explicit 150px runtime validation artifact. |
| AC-09 | 88% | `terminal-session-list.test.tsx` validates rendering, status dots, current badge. |
| AC-10 | 55% | Selection wiring exists in code; no integration proof of terminal target switching. |
| AC-12 | 72% | Nav item added in `navigation-utils.ts`; no recorded runtime/workspace-context proof. |

### E.5) Doctrine Compliance

- **Route/service layering**: `app/api/terminal/route.ts` performs direct process execution/parsing in transport layer rather than delegating to service boundary.
- **Documentation synchronization**: phase artifacts have minor but actionable status/path drift.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | Terminal page auto-creates/re-attaches session | `terminal/page.tsx`, `terminal-page-client.tsx`, execution log claim (no command transcript) | 30% |
| AC-07 | Left panel resize triggers terminal re-fit | PanelShell/LeftPanel/MainPanel composition in `terminal-page-client.tsx` | 45% |
| AC-08 | Left panel shrinks to 150px safely | Uses shared panel primitives; no explicit runtime assertion recorded | 40% |
| AC-09 | Session list shows sessions with status indicators | `terminal-session-list.test.tsx` (5 tests) + `terminal-session-list.tsx` | 88% |
| AC-10 | Session select switches terminal session | `onSelect -> setSelectedSession -> TerminalView sessionName` wiring in client/hook | 55% |
| AC-12 | Terminal appears in workspace tools nav | `WORKSPACE_NAV_ITEMS` entry in `navigation-utils.ts` | 72% |

**Overall coverage confidence**: 55%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -12
mkdir -p /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/reviews
git --no-pager diff 817da04..HEAD > /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/reviews/_computed.diff
git --no-pager diff --name-status 817da04..HEAD
git --no-pager diff --shortstat 817da04..HEAD
git --no-pager diff 817da04..HEAD -- apps/web/src/features/064-terminal/server/terminal-ws.ts
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md
**Spec**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-spec.md
**Phase**: Phase 3: Terminal Page (Surface 1)
**Tasks dossier**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-3-terminal-page-surface-1/tasks.md
**Execution log**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-3-terminal-page-surface-1/execution.log.md
**Review file**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/reviews/review.phase-3-terminal-page-surface-1.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/064-tmux/apps/web/app/(dashboard)/workspaces/[slug]/terminal/layout.tsx | Created | terminal | None |
| /Users/jordanknight/substrate/064-tmux/apps/web/app/(dashboard)/workspaces/[slug]/terminal/page.tsx | Created | terminal | Fix (session query handling) |
| /Users/jordanknight/substrate/064-tmux/apps/web/app/api/terminal/route.ts | Created | terminal | Fix (service boundary/reuse) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-page-client.tsx | Created | terminal | Fix (contract import path) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-page-header.tsx | Created | terminal | None |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-session-list.tsx | Created | terminal | Fix (create-session action if in scope) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-sessions.ts | Created | terminal | Fix (create action + URL/state behavior) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/params/terminal.params.ts | Created | terminal | Wire usage + concepts docs row |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts | Modified | terminal | Fix (localhost binding default) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/tmux-session-manager.ts | Modified | terminal | None |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/_platform/panel-layout/types.ts | Modified | _platform/panel-layout | None |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/lib/navigation-utils.ts | Modified | shared | Add evidence only |
| /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md | Modified | domain docs | Fix (source/concepts sync) |
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-3-terminal-page-surface-1/execution.log.md | Created | plan artifacts | Fix (evidence transcript quality) |
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-3-terminal-page-surface-1/tasks.fltplan.md | Modified | plan artifacts | Fix (stage status sync) |
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-3-terminal-page-surface-1/tasks.md | Modified | plan artifacts | Fix (DYK endpoint path sync) |
| /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/terminal-session-list.test.tsx | Created | terminal tests | Extend coverage for AC-01/10 and backend-facing logic |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts | Restore localhost-only default bind and gate remote bind explicitly. | Prevent network-exposed terminal control path without auth/origin checks. |
| 2 | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-page-client.tsx | Replace internal import path with public `_platform/panel-layout` contract import. | Enforce cross-domain contract-only dependency rule. |
| 3 | /Users/jordanknight/substrate/064-tmux/apps/web/app/(dashboard)/workspaces/[slug]/terminal/page.tsx | Apply `session` query contract and pass selected session state. | Meet URL-backed session selection behavior promised by Phase 3. |
| 4 | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-sessions.ts; /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-session-list.tsx | Implement/create-session action or explicitly descope and update dossier. | Align implementation with T002/T003 scope and acceptance intent. |
| 5 | /Users/jordanknight/substrate/064-tmux/apps/web/app/api/terminal/route.ts | Reuse/extend existing terminal session service instead of inline shell/parsing logic. | Avoid concept duplication and align with doctrine service-integration patterns. |
| 6 | /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md; /Users/jordanknight/substrate/064-tmux/docs/domains/domain-map.md; /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md | Synchronize manifest/source/concepts/map artifacts with actual Phase 3 file set. | Keep domain governance artifacts accurate and reviewable. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md | Domain Manifest missing API route and uses stale route path prefixes. |
| /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md | Source Location/Composition/Concepts incomplete for Phase 3 additions (`app/api/terminal/route.ts`, `terminalParams`). |
| /Users/jordanknight/substrate/064-tmux/docs/domains/domain-map.md | Domain Health Summary consumers/providers not fully synchronized with labeled edges. |
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-3-terminal-page-surface-1/tasks.md | DYK endpoint path drift (`/api/terminal/sessions` vs `/api/terminal`). |
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-3-terminal-page-surface-1/tasks.fltplan.md | Stage progress not synchronized with landed/checklist status. |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md --phase "Phase 3: Terminal Page (Surface 1)"
