# Code Review: Phase 3: Top Bar + Agent Overlay

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md  
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md  
**Phase**: Phase 3: Top Bar + Agent Overlay  
**Date**: 2026-03-02  
**Reviewer**: Automated (plan-7-v2)  
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Critical phase outcomes are incomplete: AC-24 is not wired, live status behavior is not truly real-time, and testing/evidence artifacts are insufficient for acceptance.

**Key failure areas**:
- **Implementation**: Live status and workflow-node overlay triggers are incomplete relative to AC-24/AC-27/AC-28.
- **Domain compliance**: Domain manifest and domain docs/map are stale vs actual changed files and contracts.
- **Reinvention**: New workspace chrome duplicates existing panel-layout composition responsibilities.
- **Testing**: No meaningful execution evidence and no phase-targeted test additions are present.
- **Doctrine**: New hook filenames violate repo kebab-case rule.

## B) Summary

The phase introduced substantial UI wiring for chips, overlay, and attention behaviors, but multiple acceptance criteria remain partially implemented. The most material gaps are stale/non-live recent-agent updates and missing workflow-node-to-overlay execution wiring. Domain governance artifacts were not kept current: plan manifest entries, agents domain history/contracts, and domain map labels/edges lag the implementation. Testing evidence is currently non-actionable because the execution log is incomplete and no targeted validation tests were added for phase-critical behavior.

## C) Checklist

**Testing Approach: Hybrid**

Hybrid checks:
- [ ] Lightweight validation tests added for critical UI/hook flows
- [ ] Manual verification steps documented with observed outcomes
- [ ] AC-by-AC evidence recorded in execution log

Universal checks:
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (evidence logged)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/hooks/useRecentAgents.ts:66-69,76-96 | correctness | `useRecentAgents` disables SSE and does not merge WorkUnitState updates, so top-bar and attention behavior can go stale. | Restore live updates (SSE or equivalent) and merge `work-unit-state` status/intent into recent-agent rows. |
| F002 | HIGH | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx:122-124,166-226 | scope | AC-24 not implemented: `onAgentClick` is declared but never used; no `openAgent(sessionId)` path exists. | Wire node click handling for `agentSessionId` to `useAgentOverlay().openAgent(...)`. |
| F003 | HIGH | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-3-top-bar-agent-overlay/execution.log.md:1-14 | testing | Execution log is a stub (T001 in-progress only) with no verification outputs. | Backfill per-task evidence (commands, outputs, outcomes, AC mapping). |
| F004 | HIGH | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/_manifest.tsv:1-18 | testing | No phase-targeted test files were changed despite Hybrid strategy requirements. | Add targeted tests for overlay open/close, workflow node trigger, recent-agent updates, and attention escalation. |
| F005 | HIGH | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md:25-64 | domain-compliance | Domain Manifest is stale: multiple changed files are not mapped (or path-mismatched). | Update Domain Manifest to include every touched file with correct domain/classification. |
| F006 | HIGH | /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md:115-257 | domain-compliance | Agents domain doc still marks Phase 3 capabilities as future and lacks current history/contracts/composition updates. | Update `domain.md` History, Contracts, Concepts, and Composition for Phase 3. |
| F007 | HIGH | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/workspace-agent-chrome.tsx:16-43 | reinvention | `WorkspaceAgentChrome` introduces composition concerns already represented in panel-layout shell concepts. | Reuse/extend panel-layout slot composition rather than adding parallel chrome orchestration. |
| F008 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/agent-overlay-panel.tsx:51-57 | scope | Overlay is full-height right drawer, not fixed 480px × 70vh as specified. | Render bottom-right panel with 70vh height and 480px width cap. |
| F009 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/attention-flash.tsx:56-65,100-117 | scope | Layer-2 toast is not implemented though required by AC-27. | Emit toast when a new `waiting_input` appears while overlay is closed. |
| F010 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/attention-flash.tsx:40-44 | correctness | Waiting-agent detection includes `stopped`, causing false-positive escalation. | Restrict waiting detection to explicit `waiting_input`/question state only. |
| F011 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md:85,124,127 | domain-compliance | Domain map still marks workflow→overlay relationship as future and omits current contract updates. | Refresh agents node labels and workflow-ui edge labels/health summary to current state. |
| F012 | MEDIUM | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/hooks/useAgentOverlay.tsx; /Users/jordanknight/substrate/059-fix-agents/apps/web/src/hooks/useRecentAgents.ts | doctrine | New hook filenames are camelCase, violating kebab-case naming rule. | Rename files to kebab-case and update imports. |
| F013 | LOW | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/agents/constants.ts:18-27 | scope | Z-index contract drift: `TOAST` constant is `10` while task dossier expects toast layer above modal/tooltips. | Align constant values with documented hierarchy and actual toast container behavior. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: `useRecentAgents` currently reads REST state but opts out of live SSE updates (`subscribeToSSE: false`), so top-bar urgency ordering and attention layers can become stale.
- **F002 (HIGH)**: Workflow node AC-24 path is absent in execution flow; `onAgentClick` prop is declared but not invoked.
- **F008 (MEDIUM)**: Overlay dimension/position diverges from acceptance criteria.
- **F009 (MEDIUM)**: Toast escalation layer missing.
- **F010 (MEDIUM)**: Escalation logic includes `stopped`, producing non-question false positives.
- **F013 (LOW)**: Z-index constants no longer match documented hierarchy.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files are under expected high-level domain trees (`agents`, `workflow-ui`, panel layout/workspace composition). |
| Contract-only imports | ❌ | Workspace layout directly imports agents internal UI (`workspace-agent-chrome`) instead of contract boundary. |
| Dependency direction | ❌ | Composition layer now has direct business UI dependency, bypassing expected slot-contract abstraction. |
| Domain.md updated | ❌ | `docs/domains/agents/domain.md` is stale for Phase 3 features/history/contracts. |
| Registry current | ✅ | `docs/domains/registry.md` includes relevant domains; no new domain introduced this phase. |
| No orphan files | ❌ | Several changed files are absent or mismatched in plan Domain Manifest. |
| Map nodes current | ❌ | Agents node contract labels are not current for overlay/top-bar contracts. |
| Map edges current | ❌ | Workflow→agents overlay edge still marked future despite phase intent. |
| No circular business deps | ✅ | No circular business dependency introduced in reviewed changes. |
| Concepts documented | ⚠️ | Concepts section exists but not current with Phase 3 overlay/recent-agent contract behavior. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| AgentChipBar | `panel-shell.tsx`, `fleet-status-bar.tsx` | _platform/panel-layout | ⚠️ Extend preferred |
| AgentChip | `status-badge.tsx` pattern | shared UI | ⚠️ Partial overlap |
| AgentOverlayPanel | `agent-session-dialog.tsx` | agents | ⚠️ Extend preferred |
| AttentionFlash | `use-attention-title.ts`, toaster patterns | file-browser / events | ⚠️ Extend preferred |
| useRecentAgents | Work-unit-state service capabilities | work-unit-state | ⚠️ Extend preferred |
| useAgentOverlay | None | — | ✅ Proceed |
| constants.ts | Existing localStorage helper patterns | file-browser | ⚠️ Extend preferred |
| WorkspaceAgentChrome | panel shell composition primitives | _platform/panel-layout | ❌ High overlap risk |

### E.4) Testing & Evidence

**Coverage confidence**: **32%**

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-18 | 55 | Workspace wrapper mounts top bar, but DashboardShell slot contract is not actually used end-to-end. |
| AC-19 | 85 | Chip UI includes type icon, status, name, and intent snippet rendering. |
| AC-20 | 40 | Drag persistence exists; default ordering behavior differs from creation-time AC wording. |
| AC-21 | 45 | Overlay exists but dimensions do not match specified 480px × 70vh. |
| AC-22 | 75 | Overlay close behaviors implemented without navigation. |
| AC-23 | 95 | `useAgentOverlay` contract is implemented and callable via provider context. |
| AC-24 | 10 | No executed wiring from workflow node `agentSessionId` to `openAgent(sessionId)`. |
| AC-25 | 35 | Rehydration path relies on existing chat fetch but lacks concrete verification evidence. |
| AC-26 | 60 | Agent-not-found handling exists; invalid session-id scenario evidence absent. |
| AC-27 | 20 | Chip pulse implemented; toast escalation missing. |
| AC-28 | 55 | Border flash + badge exist; trigger logic is partially incorrect (`stopped` treated as waiting). |

### E.5) Doctrine Compliance

- **MEDIUM**: `useAgentOverlay.tsx` and `useRecentAgents.ts` violate kebab-case filename rule.
- **LOW**: Non-prefixed prop interface names in new files diverge from documented `I*` interface convention.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-18 | Persistent top bar above page content | `WorkspaceAgentChrome` wrapper in workspace layout; no complete slot-based verification evidence | 55 |
| AC-19 | Chip fields and status visuals | `agent-chip.tsx` status styles, icon map, intent rendering | 85 |
| AC-20 | Drag reorder + persistence | `agent-chip-bar.tsx` with @dnd-kit and localStorage order | 40 |
| AC-21 | 480px × 70vh overlay | `agent-overlay-panel.tsx` currently full-height drawer | 45 |
| AC-22 | Close without navigation | Escape/close/toggle behaviors present | 75 |
| AC-23 | `useAgentOverlay` hook contract | Provider + hook contract implemented | 95 |
| AC-24 | Workflow node opens overlay via `agentSessionId` | `onAgentClick` prop unused in node interactions | 10 |
| AC-25 | Session rehydration from stored events | Existing chat/event fetch path reused; no explicit verification logs | 35 |
| AC-26 | Invalid session error handling | Not-found error surface exists in chat view | 60 |
| AC-27 | Pulse + toast for `waiting_input` | Pulse exists; toast missing | 20 |
| AC-28 | Border flash + question badge | Flash/badge exist; waiting detection logic partially incorrect | 55 |

**Overall coverage confidence**: **32%**

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -15
git --no-pager diff 0dcbbd4..HEAD > /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/_computed.diff
# python helper to create /reviews/_manifest.tsv from name-status diff
rg -n "<patterns>" /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/*
view /Users/jordanknight/substrate/059-fix-agents/apps/web/src/... (changed files)
# 5 parallel review subagents launched:
# - Implementation quality
# - Domain compliance
# - Anti-reinvention
# - Testing & evidence
# - Doctrine/rules
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md  
**Spec**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md  
**Phase**: Phase 3: Top Bar + Agent Overlay  
**Tasks dossier**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-3-top-bar-agent-overlay/tasks.md  
**Execution log**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-3-top-bar-agent-overlay/execution.log.md  
**Review file**: /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/reviews/review.phase-3-top-bar-agent-overlay.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/059-fix-agents/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx | modified | _platform/panel-layout | Yes |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/agent-chat-view.tsx | modified | agents | No |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/agent-chip-bar.tsx | created | agents | Yes |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/agent-chip.tsx | created | agents | No |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/agent-overlay-panel.tsx | created | agents | Yes |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/attention-flash.tsx | created | agents | Yes |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/create-session-form.tsx | modified | agents | No |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/workspace-agent-chrome.tsx | created | agents | Yes |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/dashboard-shell.tsx | modified | _platform/panel-layout | Yes |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/019-agent-manager-refactor/useAgentInstance.ts | modified | agents | No |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx | modified | workflow-ui | Yes |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/hooks/useAgentOverlay.tsx | created | agents | Yes |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/hooks/useRecentAgents.ts | created | agents | Yes |
| /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/agents/constants.ts | created | agents | Yes |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-3-top-bar-agent-overlay/execution.log.md | created | docs/plan-artifact | Yes |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-3-top-bar-agent-overlay/tasks.fltplan.md | created | docs/plan-artifact | No |
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-3-top-bar-agent-overlay/tasks.md | created | docs/plan-artifact | No |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/hooks/useRecentAgents.ts | Re-enable live updates and merge WorkUnitState status | Current chip/attention behavior can go stale (F001) |
| 2 | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx (+ parent wiring) | Wire `agentSessionId` node click to `openAgent(sessionId)` | AC-24 currently unimplemented (F002) |
| 3 | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/attention-flash.tsx | Add toast layer; remove `stopped` from waiting logic | AC-27 incomplete and false-positive escalation (F009/F010) |
| 4 | /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/agent-overlay-panel.tsx | Adjust panel to 480px × 70vh fixed bottom-right behavior | AC-21 contract mismatch (F008) |
| 5 | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-3-top-bar-agent-overlay/execution.log.md and tests under /Users/jordanknight/substrate/059-fix-agents/test | Add targeted tests and complete evidence log | Hybrid strategy evidence gate not met (F003/F004) |
| 6 | /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md, /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md, /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | Update manifest/domain docs/map to match implementation | Domain governance artifacts stale (F005/F006/F011) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md | Phase 3 touched files not fully represented in Domain Manifest |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md | Phase 3 history/contracts/composition/concepts updates |
| /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md | Current overlay/workflow edges and agents contract labels |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md --phase "Phase 3: Top Bar + Agent Overlay"
