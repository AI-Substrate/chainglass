# Code Review: Phase 3: Overlay Panel + Sidebar Button

**Plan**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md
**Spec**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-spec.md
**Phase**: Phase 3: Overlay Panel + Sidebar Button
**Date**: 2026-03-06
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

High-severity issues remain in overlay mutual exclusion and verification coverage, so the phase is not ready to approve yet.

**Key failure areas**:
- **Implementation**: `useAgentOverlay()` only listens for `overlay:close-all`; it never dispatches it before opening, so AC-09 is only one-way.
- **Domain compliance**: Phase 3 introduced an extra `ExplorerPanel` toggle and left the Domain Manifest / domain-map / touched domain histories stale.
- **Testing**: The new overlay test file never renders the real UI, so AC-06/07/08/09/13 still lack direct evidence.
- **Doctrine**: The new test file also misses the required `Test Doc:` blocks from `docs/project-rules/rules.md` and `constitution.md`.

## B) Summary

The activity-log UI work is close, but one core behavior is still broken: opening the agent overlay does not close sibling overlays because `use-agent-overlay.tsx` never broadcasts `overlay:close-all`. The current test artifact is also too weak for a Phase 3 sign-off: it re-implements helper logic instead of rendering `ActivityLogEntryList` or exercising Escape / mutual-exclusion flows, so the most important UI acceptance criteria remain weakly evidenced. Domain compliance is incomplete as well — the plan's Domain Manifest no longer covers every changed file, the domain map is stale for the Phase 3 public surface, and the extra `_platform/panel-layout` toggle adds unplanned cross-domain coupling. The anti-reinvention pass did not find harmful duplication; the new hook/panel/wrapper mostly extend the existing terminal-overlay pattern as expected.

## C) Checklist

**Testing Approach: Hybrid**

Hybrid-specific:
- [ ] Lightweight render tests cover the real overlay/list UI rather than copied helper logic.
- [ ] Critical interaction flows (Escape, mutual exclusion, worktree-gated visibility) have direct automated or recorded manual evidence.
- [ ] Evidence artifacts map concrete command output or observed outcomes back to the relevant acceptance criteria.

Universal:
- [ ] Only in-scope files changed.
- [x] Type checks clean (`just typecheck` passed).
- [ ] Linters clean (`just lint` failed on unrelated formatting in `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/server/tmux-session-manager.ts`).
- [ ] Domain compliance checks pass.

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/hooks/use-agent-overlay.tsx:43-53,63-68` | correctness | Agent overlay open/toggle paths never dispatch `overlay:close-all`, so opening the agent overlay does not reliably close terminal/activity-log siblings. | Mirror the `isOpeningRef` + `overlay:close-all` open-path pattern from `use-terminal-overlay.tsx` / `use-activity-log-overlay.tsx`, then add direct verification for agent→siblings closing. |
| F002 | HIGH | `/Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-overlay.test.ts:52-179` | testing | The new “lightweight UI tests” never render the real components, so gap/empty/Escape/mutual-exclusion behavior is not actually verified; the file also lacks required `Test Doc:` blocks. | Replace copied helper assertions with DOM render tests for `ActivityLogEntryList` / overlay behavior, and add `Test Doc:` comments to each test case. |
| F003 | MEDIUM | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/components/dashboard-sidebar.tsx:281-288` | correctness | The Activity button is always shown in the sidebar footer, even without a selected worktree, which misses AC-06’s “visible only with worktree selected” requirement. | Guard the footer button by `currentWorktree` or move it into the existing worktree-scoped Tools group. |
| F004 | MEDIUM | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx:484-492` | scope | `ExplorerPanel` gained a second activity-log toggle that is not in the Phase 3 dossier and adds new `_platform/panel-layout` knowledge of the business feature. | Remove the extra button, or explicitly keep it by updating the phase scope, manifest, domain map, and panel-layout docs to reflect the added coupling. |
| F005 | MEDIUM | `/Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md:22-55` | domain-compliance | The plan’s Domain Manifest no longer covers every Phase 3 file in the diff (`use-terminal-overlay.tsx`, `use-agent-overlay.tsx`, `ExplorerPanel`, and the overlay test file are missing). | Add manifest rows for every changed file with an explicit domain slug and classification so there are no orphan files. |
| F006 | MEDIUM | `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md:39-40,110-112,129-151` | domain-compliance | Phase 3 domain artifacts are stale: `activity-log` has no Domain Health Summary row, the map does not describe overlay coordination, touched domain histories are missing, and the `activity-log` Concepts table still omits the new overlay/API concepts. | Update `domain-map.md` plus `docs/domains/{activity-log,terminal,agents,_platform/panel-layout,_platform/sdk}/domain.md` to reflect the Phase 3 public surface and history. |
| F007 | MEDIUM | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/app/api/activity-log/route.ts:17-49` | testing | The new API route has no direct request/response evidence for missing worktree, invalid path, unauthorized access, or successful reads — the execution log only states that it “follows a pattern.” | Add route-focused tests or recorded manual request/response evidence for the route’s expected success and error cases. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 — HIGH — `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/hooks/use-agent-overlay.tsx:43-53,63-68`**  
  `openAgent()` and `toggleAgent()` only set state. They never broadcast `overlay:close-all`, unlike the new activity-log and terminal providers. That makes AC-09 incomplete: activity-log/terminal opening can close the agent overlay, but agent opening does not reliably close them back.

- **F003 — MEDIUM — `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/components/dashboard-sidebar.tsx:281-288`**  
  The Activity button lives in `SidebarFooter`, outside the `currentWorktree && (...)` Tools gate at lines 124-159. On pages with no selected worktree, the button remains visible even though the spec explicitly says the toggle should only appear with an active worktree.

- **F004 — MEDIUM — `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx:484-492`**  
  The dossier only called for a sidebar button plus SDK command, but `ExplorerPanel` now dispatches `activity-log:toggle` too. Besides being out of scope, that change deepens infrastructure→business awareness inside `_platform/panel-layout` without the supporting manifest/docs updates.

No additional security or performance defects stood out in the Phase 3 code paths beyond the issues above.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files are placed under the planned `app/api/activity-log`, `src/features/065-activity-log`, workspace wrapper, and centralized `test/unit/...` locations. |
| Contract-only imports | ✅ | No changed Phase 3 files were found importing another domain’s obvious internal implementation via file-path reach-through beyond files already classified as activity-log cross-domain in the plan. |
| Dependency direction | ❌ | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx:484-492` now dispatches `activity-log:toggle`, adding new `_platform/panel-layout` awareness of a business feature. |
| Domain.md updated | ❌ | `docs/domains/activity-log/domain.md` has a Phase 3 row, but `docs/domains/terminal/domain.md`, `docs/domains/agents/domain.md`, `docs/domains/_platform/panel-layout/domain.md`, and `docs/domains/_platform/sdk/domain.md` do not record the Phase 3 changes in their domains. |
| Registry current | ✅ | `docs/domains/registry.md` already contains the `activity-log` domain. |
| No orphan files | ❌ | The plan Domain Manifest omits `use-terminal-overlay.tsx`, `use-agent-overlay.tsx`, `ExplorerPanel`, and `test/unit/web/features/065-activity-log/activity-log-overlay.test.ts`. |
| Map nodes current | ❌ | `activity-log` exists in `domain-map.md`, but the node label and Domain Health Summary do not reflect the Phase 3 overlay/API surface. |
| Map edges current | ❌ | The map still documents only the Phase 2 writer path and panel anchor dependency; Phase 3 overlay coordination/events are absent. |
| No circular business deps | ✅ | No new business-to-business cycle was identified from the current map. |
| Concepts documented | ⚠️ | `docs/domains/activity-log/domain.md` has a Concepts section, but it still uses `Concept | Definition` and does not cover the overlay/API concepts introduced in Phase 3. |

Additional domain-compliance notes:
- **F005 — MEDIUM — `/Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md:22-55`**: the Domain Manifest is stale for the current diff.
- **F006 — MEDIUM — `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md:39-40,110-112,129-151`**: the domain map and touched domain docs are stale for Phase 3.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `GET /api/activity-log` route | None | — | Proceed |
| Activity log overlay provider + hook | `useTerminalOverlay()` / `TerminalOverlayProvider` | terminal | Extend existing overlay pattern |
| Activity log overlay panel | `TerminalOverlayPanel` | terminal | Extend existing overlay pattern |
| Activity log entry list with gap grouping | None | — | Proceed |
| Activity log overlay wrapper | `TerminalOverlayWrapper` | terminal | Extend existing wrapper pattern |

No genuine duplication was found. The new files mostly mirror the terminal overlay architecture intentionally, which is appropriate reuse rather than harmful reinvention.

### E.4) Testing & Evidence

**Coverage confidence**: 24%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-06 | 15% | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/components/dashboard-sidebar.tsx:281-288` adds the button and `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/lib/sdk/sdk-bootstrap.ts:103-113` adds the command, but the button is not worktree-gated and no UI test/manual proof was recorded. |
| AC-07 | 35% | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/components/activity-log-overlay-panel.tsx:42-69,71-101,119-160` implements anchor measurement, fetch, and panel rendering, but there is no browser/manual artifact and the test file never renders the component. |
| AC-08 | 15% | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/components/activity-log-overlay-panel.tsx:103-114` handles Escape, but there is no direct test or recorded manual observation. |
| AC-09 | 5% | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/hooks/use-activity-log-overlay.tsx:61-90,102-110` and `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx:43-92,104-112` broadcast/listen correctly, but `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/hooks/use-agent-overlay.tsx:43-53,63-68` never broadcasts on open. |
| AC-13 | 50% | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/components/activity-log-entry-list.tsx:71-78` renders the separator, but the current test file only re-implements `hasGap()` instead of asserting DOM output. |

Additional evidence notes:
- `/Users/jak/substrate/059-fix-agents-tmp/apps/web/app/api/activity-log/route.ts:17-49` still lacks direct success/error-case evidence (**F007**).
- `pnpm exec vitest run test/unit/web/features/065-activity-log/*.test.ts test/contracts/activity-log.contract.test.ts test/unit/web/features/064-terminal/*.test.ts` passed (78/78), but those passing tests do not close the coverage gaps above.

### E.5) Doctrine Compliance

Project rules exist under `/Users/jak/substrate/059-fix-agents-tmp/docs/project-rules/`. The main doctrine miss is tied to **F002**:

- `/Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-overlay.test.ts:52-179` violates `R-TEST-001`, `R-TEST-002`, and `R-TEST-003` from `docs/project-rules/rules.md`, plus Constitution §3.2, because the tests do not serve as durable documentation and omit the required five-field `Test Doc:` comment blocks.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-06 | Sidebar button toggles the overlay and is only visible with a selected worktree | Button/command wiring exists in `dashboard-sidebar.tsx` and `sdk-bootstrap.ts`, but visibility gating is wrong and no UI evidence is attached | 15% |
| AC-07 | Overlay appears over the editor area and shows reverse-chronological activity | `activity-log-overlay-panel.tsx` measures the anchor and renders `ActivityLogEntryList`, but no render/browser artifact proves the final behavior | 35% |
| AC-08 | Escape closes the overlay | Escape handler exists in `activity-log-overlay-panel.tsx`, but no direct verification artifact was recorded | 15% |
| AC-09 | Activity log, terminal, and agent overlays are mutually exclusive | Activity-log and terminal providers broadcast/listen correctly; agent provider only listens, so the behavior is incomplete | 5% |
| AC-13 | Gap separators appear for >30 minute gaps | The component renders `data-testid="activity-log-gap"`, but the current tests never assert the rendered separator | 50% |

**Overall coverage confidence**: 24%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -12
git --no-pager status --short --untracked-files=all -- apps/web/app/api/activity-log/route.ts apps/web/src/features/065-activity-log/hooks/use-activity-log-overlay.tsx apps/web/src/features/065-activity-log/components/activity-log-overlay-panel.tsx apps/web/src/features/065-activity-log/components/activity-log-entry-list.tsx apps/web/app/(dashboard)/workspaces/[slug]/activity-log-overlay-wrapper.tsx apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx apps/web/src/components/dashboard-sidebar.tsx apps/web/src/lib/sdk/sdk-bootstrap.ts apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx apps/web/src/hooks/use-agent-overlay.tsx test/unit/web/features/065-activity-log/activity-log-overlay.test.ts docs/domains/activity-log/domain.md apps/web/src/features/065-activity-log/lib/activity-log-reader.ts apps/web/src/features/065-activity-log/lib/activity-log-writer.ts apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx
python - <<'PY'  # computed and wrote docs/plans/065-activity-log/reviews/_computed.diff
... phase diff synthesis script ...
PY
pnpm exec vitest run test/unit/web/features/065-activity-log/*.test.ts test/contracts/activity-log.contract.test.ts test/unit/web/features/064-terminal/*.test.ts
just typecheck
just lint
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md
**Spec**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-spec.md
**Phase**: Phase 3: Overlay Panel + Sidebar Button
**Tasks dossier**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-3-overlay-panel-sidebar-button/tasks.md
**Execution log**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-3-overlay-panel-sidebar-button/execution.log.md
**Review file**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/reviews/review.phase-3-overlay-panel-sidebar-button.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| `/Users/jak/substrate/059-fix-agents-tmp/apps/web/app/api/activity-log/route.ts` | Created | activity-log | Add direct success/error-case verification evidence (F007) |
| `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/hooks/use-activity-log-overlay.tsx` | Created | activity-log | Keep; use as the reference pattern for overlay mutual exclusion |
| `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/components/activity-log-overlay-panel.tsx` | Created | activity-log | Add real UI verification for Escape/fetch/render flows |
| `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/components/activity-log-entry-list.tsx` | Created | activity-log | Add DOM-level gap/empty-state assertions |
| `/Users/jak/substrate/059-fix-agents-tmp/apps/web/app/(dashboard)/workspaces/[slug]/activity-log-overlay-wrapper.tsx` | Created | activity-log | No direct code fix required; keep aligned with overlay docs |
| `/Users/jak/substrate/059-fix-agents-tmp/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` | Modified | activity-log (cross-domain) | No direct code fix required; ensure related domain docs are refreshed |
| `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/components/dashboard-sidebar.tsx` | Modified | _platform | Gate Activity button by selected worktree (F003) |
| `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/lib/sdk/sdk-bootstrap.ts` | Modified | _platform/sdk | Keep command wiring; document it in `_platform/sdk` domain history |
| `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx` | Modified | terminal | Keep as the reference mutual-exclusion implementation; document Phase 3 in terminal domain history |
| `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/hooks/use-agent-overlay.tsx` | Modified | agents | Add open-path `overlay:close-all` dispatch + self-close guard (F001) |
| `/Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-overlay.test.ts` | Created | activity-log | Rewrite as real render tests and add `Test Doc:` comments (F002) |
| `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/activity-log/domain.md` | Modified | activity-log | Expand Concepts section and keep Phase 3 surface accurate |
| `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/activity-log-reader.ts` | Modified | activity-log | No direct fix required |
| `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/activity-log-writer.ts` | Modified | activity-log | No direct fix required |
| `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | Modified | _platform/panel-layout | Remove or formally document the extra activity-log toggle (F004) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/hooks/use-agent-overlay.tsx` | Dispatch `overlay:close-all` before opening/toggling to a different agent, with a self-close guard matching the terminal/activity-log providers | AC-09 is currently incomplete; agent→siblings mutual exclusion does not work |
| 2 | `/Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-overlay.test.ts` | Replace helper-copy assertions with DOM render tests and add `Test Doc:` comments | Current tests do not verify the shipped UI and fail project testing rules |
| 3 | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/components/dashboard-sidebar.tsx` | Hide/gate the Activity button unless a worktree is selected | Current UI misses AC-06 |
| 4 | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx` | Remove or explicitly retain/document the extra activity-log toggle | The button is out of scope and introduces new cross-domain coupling |
| 5 | `/Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md` | Refresh the Domain Manifest to cover every changed file | The review found orphan Phase 3 files |
| 6 | `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md` | Add the missing `activity-log` health row and Phase 3 overlay-coordination surface | The domain map is stale for Phase 3 |
| 7 | `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/terminal/domain.md` | Add a Plan 065 Phase 3 history note for overlay mutual exclusion | Touched domain history is stale |
| 8 | `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/agents/domain.md` | Add a Plan 065 Phase 3 history note for overlay mutual exclusion | Touched domain history is stale |
| 9 | `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/_platform/panel-layout/domain.md` | Document the ExplorerPanel surface change if it is intentionally kept | Touched domain history/composition is stale |
| 10 | `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/_platform/sdk/domain.md` | Document `activity-log.toggleOverlay` in Phase 3 history | Touched domain history is stale |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| `/Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md` | Domain Manifest rows for every changed Phase 3 file |
| `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md` | `activity-log` health row, Phase 3 surface/edge updates |
| `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/activity-log/domain.md` | Concepts table in `Concept | Entry Point | What It Does` format with overlay/API concepts |
| `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/terminal/domain.md` | Plan 065 Phase 3 history/composition note |
| `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/agents/domain.md` | Plan 065 Phase 3 history/composition note |
| `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/_platform/panel-layout/domain.md` | Plan 065 Phase 3 history/composition note if ExplorerPanel toggle remains |
| `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/_platform/sdk/domain.md` | Plan 065 Phase 3 history note for `activity-log.toggleOverlay` |

### Next Step

`/plan-6-v2-implement-phase --plan /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md --phase 'Phase 3: Overlay Panel + Sidebar Button'`
