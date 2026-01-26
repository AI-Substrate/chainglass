# Phase 1: Implementation – Tasks & Alignment Brief

**Spec**: [../../ui-mocks-spec.md](../../ui-mocks-spec.md)
**Plan**: [../../ui-mocks-plan.md](../../ui-mocks-plan.md)
**Date**: 2026-01-26
**Updated**: 2026-01-26 (Incorporated 006-web-extras)

---

## Executive Briefing

### Purpose
This phase delivers interactive UI mockups for workflow execution visualization. Users need to visually monitor workflow runs, see phase-by-phase progress in a vertical layout, and provide input when workflows are blocked waiting for human decisions. These mockups enable rapid design iteration before production implementation.

### What We're Building
A complete workflow execution UI with:
- **All Workflows grid** showing workflow cards with status indicators and run counts
- **Vertical React Flow layout** for run execution views (phases top-to-bottom)
- **QuestionInput component** handling 4 question types (single_choice, multi_choice, free_text, confirm)
- **Run history views** with drill-down from workflow → runs → single run detail
- **Checkpoint timeline** for version history visualization
- **Navigation integration** with Workflows entry in sidebar and mobile navigation

### User Value
Users can:
- Browse all workflows and see at-a-glance which have active or blocked runs
- Monitor execution progress phase-by-phase with visual status indicators
- Answer questions when workflows require human input (approvals, choices, confirmations)
- Inspect workflow templates and checkpoint history before starting new runs
- Access workflows from both desktop sidebar and mobile bottom navigation

### Example
**Scenario**: A workflow run hits the "Approval" phase and blocks.
- **Navigation**: "Workflows" link in sidebar takes user to All Workflows page
- **All Workflows page**: Shows "deploy-to-prod" card with orange "Waiting" indicator
- **Single Run View**: Vertical flow shows phases 1-3 complete (green), phase 4 "Approval" blocked (orange, pulsing)
- **Clicking blocked phase**: Opens Question form "Deploy to production?" with Yes/No buttons
- **Submitting "Yes"**: Phase transitions to accepted (lime), then complete (green)

---

## 006-Web-Extras Integration Summary

**New capabilities from Plan 006** (PR #9) that this plan leverages:

| Asset | Type | Usage in Plan 011 |
|-------|------|------------------|
| `useResponsive()` | Hook | Adaptive grid columns and layout for workflow views |
| `NavigationWrapper` | Component | Auto-applies to all dashboard pages |
| `NAV_ITEMS` / `MOBILE_NAV_ITEMS` | Data | Must add "Workflows" entry (T000) |
| `FakeMatchMedia` | Test Fake | Responsive viewport testing in T024 |
| `FakeResizeObserver` | Test Fake | Container-query component testing |
| `FakeEventSource` | Test Fake | Available for future SSE testing |

**Key Pattern**: Pages under `app/(dashboard)/` automatically get responsive navigation via `NavigationWrapper`. No additional layout code needed.

---

## Plan 010 Entity Alignment

Fixtures (T001) must match these exact shapes from `packages/workflow/`:

```typescript
// From workflow.ts
interface WorkflowJSON {
  slug: string;
  version: string;
  description: string | null;
  isCurrent: boolean;
  isCheckpoint: boolean;
  isRun: boolean;
  phases: PhaseJSON[];
  checkpoint: CheckpointMetadataJSON | null;
  run: RunMetadataJSON | null;
}

// From phase.ts  
interface PhaseJSON {
  name: string;
  order: number;
  status: PhaseRunStatus;  // 7 values
  facilitator: 'agent' | 'orchestrator';
  isPending: boolean;
  isReady: boolean;
  isActive: boolean;
  isBlocked: boolean;
  isComplete: boolean;
  isFailed: boolean;
}

// Status enums
type RunStatus = 'pending' | 'active' | 'complete' | 'failed';
type PhaseRunStatus = 'pending' | 'ready' | 'active' | 'blocked' | 'accepted' | 'complete' | 'failed';

---

## Objectives & Scope

### Objective
Create interactive workflow execution UI mockups per spec AC-01 through AC-25, enabling design validation before production implementation.

**Behavior Checklist**:
- [ ] Workflows display with counts and status indicators (AC-01)
- [ ] Navigation shows "Workflows" link in sidebar and mobile nav (NEW)
- [ ] Runs sorted by creation date, newest first (AC-04)
- [ ] Vertical phase layout with correct flow direction (AC-08)
- [ ] Active phase has pulse animation (AC-10)
- [ ] Blocked phase shows "Needs Input" with question form (AC-13, AC-14)
- [ ] All 4 question types render correctly (AC-15–AC-18)
- [ ] Breadcrumb navigation works (AC-24, AC-25)
- [ ] Responsive layouts work on phone/tablet/desktop (via useResponsive)

### Goals

- ✅ Add Workflows to NAV_ITEMS and MOBILE_NAV_ITEMS (NEW)
- ✅ Create fixture data with factory functions matching Plan 010 WorkflowJSON/PhaseJSON
- ✅ Extend status color system to 7 PhaseRunStatus values
- ✅ Build VerticalPhaseNode with top/bottom handles for vertical layout
- ✅ Build RunFlowContent for vertical run visualization with Dagre auto-layout
- ✅ Create WorkflowCard, RunRow, RunList components for list views
- ✅ Create QuestionInput supporting single_choice, multi_choice, free_text, confirm
- ✅ Create pages: All Workflows, Single Workflow, All Runs, Single Run
- ✅ Add checkpoint timeline visualization
- ✅ Add breadcrumb navigation
- ✅ Extend SSE schema with run/phase/question event types
- ✅ Create phase progression simulation for demo
- ✅ Use useResponsive() for adaptive layouts (from 006)
- ✅ Use FakeMatchMedia in tests for viewport simulation (from 006)

### Non-Goals (Scope Boundaries)

- ❌ **Backend integration** – All data from fixtures, no adapters (deferred to post-Plan-010)
- ❌ **Workflow editing** – View-only mockup; create/edit/delete deferred
- ❌ **Run execution controls** – No start/stop/pause/resume (deferred)
- ❌ **Authentication** – No user-specific access controls
- ❌ **Mobile optimization** – Desktop-first; responsive layout via useResponsive for basics
- ❌ **Performance optimization** – Focus on UX validation, not large datasets
- ❌ **State persistence** – Session-only; resets on refresh
- ❌ **Checkpoint restore** – View-only; restore action deferred
- ❌ **Additional question types** – Only 4 core types; expand in future plan
- ❌ **DashboardSidebar refactor** – If hardcoded nav items work, defer refactor

---

## Architecture Map

### Component Diagram

<!-- Status: grey=pending, orange=in-progress, green=completed, red=blocked -->
<!-- Updated by plan-6 during implementation -->

```mermaid
flowchart TD
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef inprogress fill:#FF9800,stroke:#F57C00,color:#fff
    classDef completed fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    style Setup fill:#E3F2FD,stroke:#1976D2
    style Core fill:#FFF3E0,stroke:#F57C00
    style Pages fill:#E8F5E9,stroke:#388E3C
    style Test fill:#FCE4EC,stroke:#C2185B

    subgraph Setup["Setup & Navigation"]
        T000["T000: Navigation integration"]:::pending
        T001["T001: Workflow/Run fixtures"]:::pending
        T021["T021: SSE schema extensions"]:::pending
    end

    subgraph Core["Core Components"]
        T002["T002: Extend status colors"]:::pending
        T003["T003: VerticalPhaseNode"]:::pending
        T004["T004: RunFlowContent"]:::pending
        T005["T005: StatusBadge"]:::pending
        T006["T006: WorkflowCard"]:::pending
        T008["T008: RunRow"]:::pending
        T009["T009: RunList"]:::pending
        T012["T012: QuestionInput"]:::pending
        T013["T013: QuestionInput integration"]:::pending
        T015["T015: RunHeader"]:::pending
        T016["T016: CheckpointCard"]:::pending
        T017["T017: CheckpointTimeline"]:::pending
        T019["T019: Breadcrumb"]:::pending
        T022["T022: Phase simulation"]:::pending
        T023["T023: Pulse animation"]:::pending
    end

    subgraph Pages["Pages"]
        T007["T007: All Workflows page"]:::pending
        T010["T010: Single Workflow page"]:::pending
        T011["T011: Runs page"]:::pending
        T014["T014: Single Run page"]:::pending
        T018["T018: Checkpoint timeline integration"]:::pending
        T020["T020: Breadcrumbs integration"]:::pending
    end

    subgraph Test["Testing"]
        T024["T024: Component render tests"]:::pending
    end

    %% Dependencies
    T000 --> T007
    T001 --> T004
    T001 --> T006
    T001 --> T022
    T002 --> T003
    T002 --> T005
    T003 --> T004
    T003 --> T023
    T005 --> T006
    T005 --> T008
    T005 --> T015
    T005 --> T016
    T006 --> T007
    T008 --> T009
    T009 --> T011
    T004 --> T010
    T004 --> T014
    T012 --> T013
    T013 --> T014
    T015 --> T014
    T016 --> T017
    T017 --> T018
    T010 --> T018
    T019 --> T020
    T007 --> T024
    T009 --> T024
    T012 --> T024
    T014 --> T024
    T021 --> T022
```

### File Dependency Map

```mermaid
flowchart LR
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef fixture fill:#E1F5FE,stroke:#0288D1
    classDef component fill:#FFF8E1,stroke:#FFA000
    classDef page fill:#E8F5E9,stroke:#388E3C
    classDef schema fill:#F3E5F5,stroke:#7B1FA2
    classDef external fill:#B2DFDB,stroke:#00897B

    subgraph External["006-Web-Extras (Use As-Is)"]
        E_NAV["navigation-utils.ts"]:::external
        E_RESP["useResponsive.ts"]:::external
        E_FMM["FakeMatchMedia"]:::external
    end

    subgraph Fixtures
        F_WF["workflows.fixture.ts"]:::fixture
        F_RUN["runs.fixture.ts"]:::fixture
    end

    subgraph Schema
        S_SSE["sse-events.schema.ts"]:::schema
    end

    subgraph Components
        C_VPN["vertical-phase-node.tsx"]:::component
        C_RFC["run-flow-content.tsx"]:::component
        C_SB["status-badge.tsx"]:::component
        C_WC["workflow-card.tsx"]:::component
        C_RR["run-row.tsx"]:::component
        C_RL["run-list.tsx"]:::component
        C_QI["question-input.tsx"]:::component
        C_NDP["node-detail-panel.tsx"]:::component
        C_RH["run-header.tsx"]:::component
        C_CC["checkpoint-card.tsx"]:::component
        C_CT["checkpoint-timeline.tsx"]:::component
        C_BC["workflow-breadcrumb.tsx"]:::component
        C_PN["phase-node.tsx"]:::component
    end

    subgraph Hooks
        H_PS["usePhaseSimulation.ts"]:::component
    end

    subgraph Pages
        P_WL["workflows/page.tsx"]:::page
        P_WD["workflows/[slug]/page.tsx"]:::page
        P_RL["workflows/[slug]/runs/page.tsx"]:::page
        P_RD["workflows/[slug]/runs/[runId]/page.tsx"]:::page
    end

    E_NAV --> P_WL
    E_RESP --> C_RFC
    E_RESP --> P_WL
    E_FMM --> T024
    F_WF --> C_WC
    F_WF --> C_RFC
    F_RUN --> C_RFC
    F_RUN --> C_RL
    C_PN --> C_VPN
    C_VPN --> C_RFC
    C_SB --> C_WC
    C_SB --> C_RR
    C_SB --> C_RH
    C_SB --> C_CC
    C_RR --> C_RL
    C_QI --> C_NDP
    C_CC --> C_CT
    C_WC --> P_WL
    C_RFC --> P_WD
    C_RFC --> P_RD
    C_RL --> P_RL
    C_CT --> P_WD
    C_RH --> P_RD
    C_NDP --> P_RD
    C_BC --> P_WD
    C_BC --> P_RL
    C_BC --> P_RD
    S_SSE --> H_PS
    H_PS --> P_RD
```

### Task-to-Component Mapping

<!-- Status: ⬜ Pending | 🟧 In Progress | ✅ Complete | 🔴 Blocked -->

| Task | Component(s) | Files | Status | Comment |
|------|-------------|-------|--------|---------|
| T000 | Navigation | navigation-utils.ts | ⬜ Pending | Add Workflows NavItem to NAV_ITEMS and MOBILE_NAV_ITEMS |
| T001 | Fixtures | workflows.fixture.ts, runs.fixture.ts | ⬜ Pending | Factory functions matching Plan 010 WorkflowJSON/PhaseJSON |
| T002 | PhaseNode | phase-node.tsx | ⬜ Pending | Extend statusColors to 7 PhaseRunStatus values |
| T003 | VerticalPhaseNode | vertical-phase-node.tsx | ⬜ Pending | New node with Top/Bottom handles |
| T004 | RunFlowContent | run-flow-content.tsx | ⬜ Pending | Vertical React Flow wrapper with Dagre; use useResponsive() |
| T005 | StatusBadge | status-badge.tsx | ⬜ Pending | Shared status indicator component |
| T006 | WorkflowCard | workflow-card.tsx | ⬜ Pending | Grid card for All Workflows |
| T007 | WorkflowList | workflows/page.tsx | ⬜ Pending | All Workflows grid page; use useResponsive() for columns |
| T008 | RunRow | run-row.tsx | ⬜ Pending | Table row for runs list |
| T009 | RunList | run-list.tsx | ⬜ Pending | Table component for runs |
| T010 | SingleWorkflowView | workflows/[slug]/page.tsx | ⬜ Pending | Workflow template inspector |
| T011 | RunsPage | workflows/[slug]/runs/page.tsx | ⬜ Pending | All Runs for workflow |
| T012 | QuestionInput | question-input.tsx | ⬜ Pending | 4 question types (single, multi, text, confirm) |
| T013 | NodeDetailPanel | node-detail-panel.tsx | ⬜ Pending | Integrate QuestionInput |
| T014 | SingleRunView | workflows/[slug]/runs/[runId]/page.tsx | ⬜ Pending | Run execution timeline; use useResponsive() |
| T015 | RunHeader | run-header.tsx | ⬜ Pending | Run status summary |
| T016 | CheckpointCard | checkpoint-card.tsx | ⬜ Pending | Version badge display |
| T017 | CheckpointTimeline | checkpoint-timeline.tsx | ⬜ Pending | Vertical checkpoint list |
| T018 | Checkpoint Integration | workflows/[slug]/page.tsx | ⬜ Pending | Add timeline to workflow view |
| T019 | WorkflowBreadcrumb | workflow-breadcrumb.tsx | ⬜ Pending | Navigation breadcrumbs |
| T020 | Breadcrumb Integration | Multiple pages | ⬜ Pending | Add to all detail pages |
| T021 | SSE Schema | sse-events.schema.ts | ⬜ Pending | Add run_status, phase_status, question events |
| T022 | PhaseSimulation | usePhaseSimulation.ts | ⬜ Pending | Timer-based phase progression |
| T023 | PulseAnimation | vertical-phase-node.tsx | ⬜ Pending | Active phase visual highlight |
| T024 | RenderTests | workflow-views.test.tsx | ⬜ Pending | Smoke tests with FakeMatchMedia for responsive |

---

## Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|----------|-------|
| [ ] | T000 | **Navigation Integration**: Add Workflows NavItem to NAV_ITEMS and MOBILE_NAV_ITEMS | 2 | Setup | – | /home/jak/substrate/007-manage-workflows/apps/web/src/lib/navigation-utils.ts | NavItem appears in sidebar; mobile bottom bar shows Workflows | – | Import ListChecks icon; add to both arrays |
| [ ] | T001 | Create workflow/run/checkpoint fixture data with factory functions | 3 | Setup | – | /home/jak/substrate/007-manage-workflows/apps/web/src/data/fixtures/workflows.fixture.ts, /home/jak/substrate/007-manage-workflows/apps/web/src/data/fixtures/runs.fixture.ts | Fixtures compile; match Plan 010 WorkflowJSON/PhaseJSON types exactly | – | Factory pattern: createMockWorkflow(), createMockRun(); use PhaseRunStatus (7 values) |
| [ ] | T002 | Extend status color map to 7 PhaseRunStatus states | 1 | Core | – | /home/jak/substrate/007-manage-workflows/apps/web/src/components/workflow/phase-node.tsx | All 7 colors render; no TypeScript errors | – | pending/gray, ready/amber, active/blue, blocked/orange, accepted/lime, complete/emerald, failed/red |
| [ ] | T003 | Create VerticalPhaseNode with Top/Bottom handles | 2 | Core | T002 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/workflow/vertical-phase-node.tsx | Node renders with Position.Top target, Position.Bottom source | – | Per Critical Finding 06; use React.memo |
| [ ] | T004 | Create RunFlowContent component for vertical run visualization | 3 | Core | T001, T003 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/runs/run-flow-content.tsx | Vertical layout renders phases top-to-bottom; smoothstep edges | – | Per Critical Finding 02; Dagre TB layout; use useResponsive() for sizing |
| [ ] | T005 | Create StatusBadge component (7 PhaseRunStatus states) | 1 | Core | T002 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/ui/status-badge.tsx | All status variants render with correct color/icon | – | Shared across WorkflowCard, RunRow, PhaseNode, CheckpointCard |
| [ ] | T006 | Create WorkflowCard component for All Workflows grid | 2 | Core | T001, T005 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/workflows/workflow-card.tsx | Card displays slug, description, counts, status indicator per AC-01 | – | Show checkpoint count, run count, active run count, waiting indicator |
| [ ] | T007 | Create WorkflowList page (All Workflows grid) | 2 | Core | T000, T006 | /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/page.tsx | Grid of workflow cards renders from fixtures | – | CSS grid layout; use useResponsive() for columns; newest first per AC-01 |
| [ ] | T008 | Create RunRow component for runs table | 2 | Core | T005 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/runs/run-row.tsx | Row shows run ID, status badge, current phase, timing per AC-05 | – | Clickable; navigates to single run view |
| [ ] | T009 | Create RunList component (All Runs for a workflow) | 2 | Core | T008 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/runs/run-list.tsx | Table sorted by createdAt desc per AC-04 | – | Include workflow context header |
| [ ] | T010 | Create Single Workflow View page (template inspector) | 2 | Core | T001, T004 | /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/[slug]/page.tsx | Displays workflow phases in vertical layout, no run status per AC-20 | – | Reuse RunFlowContent in template mode (status neutral) |
| [ ] | T011 | Create Runs page for a workflow | 2 | Core | T009 | /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/[slug]/runs/page.tsx | Shows RunList filtered by workflow slug | – | Link from WorkflowCard "Runs" action |
| [ ] | T012 | Create QuestionInput component (4 question types) | 3 | Core | – | /home/jak/substrate/007-manage-workflows/apps/web/src/components/phases/question-input.tsx | Renders: radio (single_choice), checkboxes (multi_choice), textarea (free_text), Yes/No (confirm) | – | Per Critical Finding 01; modal dialog; never disable submit; 44×44px touch targets |
| [ ] | T013 | Integrate QuestionInput into NodeDetailPanel | 2 | Core | T012 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/workflow/node-detail-panel.tsx | Question form appears when phase.status === 'blocked' per AC-14 | – | Conditional render; add onSubmitAnswer callback |
| [ ] | T014 | Create Single Run View page (execution timeline) | 3 | Core | T004, T013 | /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/[slug]/runs/[runId]/page.tsx | Vertical phase flow with active highlight, question input on blocked per AC-08 | – | RunFlowContent + RunHeader + NodeDetailPanel + usePhaseSimulation; use useResponsive() |
| [ ] | T015 | Create RunHeader component (run status summary) | 1 | Core | T005 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/runs/run-header.tsx | Shows Run ID, status badge, started time, duration | – | At top of Single Run View |
| [ ] | T016 | Create CheckpointCard component | 1 | Core | T005 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/checkpoints/checkpoint-card.tsx | Displays version badge (v001-abc12345), date, comment per AC-03 | – | For checkpoint timeline |
| [ ] | T017 | Create CheckpointTimeline component | 2 | Core | T016 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/checkpoints/checkpoint-timeline.tsx | Vertical timeline with View/Start Run actions | – | View-only for mockup (no restore action) |
| [ ] | T018 | Add checkpoint timeline to Single Workflow View | 1 | Core | T010, T017 | /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/[slug]/page.tsx | Timeline renders alongside/below phase view | – | Consider tab or sidebar layout |
| [ ] | T019 | Create breadcrumb navigation component | 1 | Core | – | /home/jak/substrate/007-manage-workflows/apps/web/src/components/ui/workflow-breadcrumb.tsx | Shows: Workflows > [Workflow Name] > Runs > [Run ID] | – | Use shadcn Breadcrumb if available; context-aware |
| [ ] | T020 | Add breadcrumbs to all workflow/run pages | 1 | Core | T019 | /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/[slug]/page.tsx, /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/[slug]/runs/page.tsx, /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/[slug]/runs/[runId]/page.tsx | Breadcrumbs visible and clickable per AC-24, AC-25 | – | All detail views |
| [ ] | T021 | Extend SSE schema with run/phase/question event types | 2 | Core | – | /home/jak/substrate/007-manage-workflows/apps/web/src/lib/schemas/sse-events.schema.ts | Schema validates new event types without breaking existing | – | Per Critical Finding 04; add run_status, phase_status, question, answer members |
| [ ] | T022 | Create timer-based phase progression simulation | 2 | Core | T001, T021 | /home/jak/substrate/007-manage-workflows/apps/web/src/hooks/usePhaseSimulation.ts | Phases transition: pending→ready→active→complete with configurable timing | – | Per Critical Finding 12; setInterval-based; triggers on Single Run mount |
| [ ] | T023 | Add pulse animation for active phase nodes | 1 | Core | T003 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/workflow/vertical-phase-node.tsx | Active phase has visible pulsing border/glow per AC-10 | – | CSS animation or Tailwind animate-pulse variant |
| [ ] | T024 | Test: Core component rendering validation with FakeMatchMedia | 2 | Test | T006, T009, T012, T014 | /home/jak/substrate/007-manage-workflows/test/ui/workflow-views.test.tsx | WorkflowCard, RunList, QuestionInput, RunFlowContent render without errors | – | Use FakeMatchMedia for responsive viewport tests; test phone + desktop |

**Task Count**: 25 tasks (added T000 for navigation integration)
**Total Complexity**: CS-46 (sum) → average CS-1.84 per task

---

## Alignment Brief

### Prior Phases Review

**N/A** – This is Phase 1 (single-phase Simple Mode plan). No prior phases exist.

### Critical Findings Affecting This Phase

From plan § 3 Critical Research Findings:

| # | Finding | Impact | Tasks Affected |
|---|---------|--------|----------------|
| 01 | Human Input component blocks workflow execution; no unblock path exists | Must implement QuestionInput as priority | T012, T013, T014 |
| 02 | Vertical layout requires new component; WorkflowContent not configurable | Create RunFlowContent with Dagre TB | T004 |
| 03 | **Navigation not integrated**: Workflows page needs entry in NAV_ITEMS | Add NavItem to navigation-utils.ts | T000 |
| 04 | Entity adapters not implemented; fixtures must match Plan 010 shape | Use factory functions for flexibility | T001 |
| 05 | SSE schema needs 4+ new event types | Extend sse-events.schema.ts | T021 |
| 06 | CSS import order: ReactFlow before Tailwind | Verify in all new page layouts | T007, T010, T011, T014 |
| 07 | PhaseNode uses Left/Right handles; vertical needs Top/Bottom | Create VerticalPhaseNode | T003 |
| 08 | **useResponsive available from 006**: 3-tier responsive hook ready | Use in layouts instead of custom | T004, T007, T014 |
| 09 | NodeDetailPanel can extend for Question form | Add QuestionForm child component | T013 |
| 10 | Status colors exist (4 states); need 7 PhaseRunStatus values | Extend statusColors map | T002, T005 |
| 11 | nodeTypes must be memoized outside component | Keep NODE_TYPES pattern | T004 |
| 12 | useFlowState works; no new state library needed | Reuse for vertical layouts | T004 |
| 13 | **FakeMatchMedia available from 006**: Test fake for responsive testing | Use in T024 for viewport simulation | T024 |
| 14 | Shared Card pattern in KanbanCard | Use shadcn Card + border indicator | T006, T008, T016 |
| 15 | Timer-based simulation sufficient for mockup | Use setInterval for demo | T022 |

### 006-Web-Extras Integration Points

| Component/Hook | Usage | Tasks |
|----------------|-------|-------|
| `navigation-utils.ts` | Add Workflows NavItem | T000 |
| `useResponsive()` | Adaptive grid columns, layout switching | T004, T007, T014 |
| `FakeMatchMedia` | Viewport simulation in tests | T024 |
| `NavigationWrapper` | Auto-applies to dashboard pages | All pages (automatic) |

### ADR Decision Constraints

**ADR Seeds Identified** (from spec, not yet formalized):

| ADR Seed | Decision Drivers | Tasks Affected |
|----------|------------------|----------------|
| ADR-011-01 | Vertical layout: New RunFlowContent vs Props on WorkflowContent | T003, T004 |
| ADR-011-02 | Fixture strategy: Match entity types vs mockup-specific | T001 |
| ADR-011-03 | QuestionInput: Single component vs separate per type | T012 |

**Decision**: Use **new components** (RunFlowContent, VerticalPhaseNode) rather than modifying existing. This preserves horizontal layout for future use and enables mockup-specific optimizations.

### Invariants & Guardrails

| Type | Constraint | Enforcement |
|------|-----------|-------------|
| CSS Import Order | ReactFlow CSS before Tailwind | Comment guard in each new page layout |
| Node Type Memoization | NODE_TYPES outside component | Code review checklist |
| Fixture Shape | Match Plan 010 WorkflowJSON/PhaseJSON types | Factory functions with TypeScript |
| Accessibility | Never disable submit buttons | QuestionInput implementation |
| Status Colors | 7 PhaseRunStatus states consistent | Shared STATUS_COLORS constant |
| Responsive | Use useResponsive() not custom media queries | Code review checklist |
| Test Fakes | Use FakeMatchMedia for responsive tests | Test file setup |

### Inputs to Read

**Files to review before implementation:**

| Purpose | Path |
|---------|------|
| Navigation data (for T000) | /home/jak/substrate/007-manage-workflows/apps/web/src/lib/navigation-utils.ts |
| Responsive hook (for layout) | /home/jak/substrate/007-manage-workflows/apps/web/src/hooks/useResponsive.ts |
| Test fake for responsive | /home/jak/substrate/007-manage-workflows/test/fakes/fake-match-media.ts |
| Existing PhaseNode pattern | /home/jak/substrate/007-manage-workflows/apps/web/src/components/workflow/phase-node.tsx |
| Existing WorkflowContent pattern | /home/jak/substrate/007-manage-workflows/apps/web/src/components/workflow/workflow-content.tsx |
| Existing fixture pattern | /home/jak/substrate/007-manage-workflows/apps/web/src/data/fixtures/flow.fixture.ts |
| NodeDetailPanel extension point | /home/jak/substrate/007-manage-workflows/apps/web/src/components/workflow/node-detail-panel.tsx |
| useFlowState hook | /home/jak/substrate/007-manage-workflows/apps/web/src/hooks/useFlowState.ts |
| SSE schema structure | /home/jak/substrate/007-manage-workflows/apps/web/src/lib/schemas/sse-events.schema.ts |
| shadcn Card component | /home/jak/substrate/007-manage-workflows/apps/web/src/components/ui/card.tsx |
| Plan 010 entity types | /home/jak/substrate/007-manage-workflows/packages/workflow/src/entities/workflow.ts |
| External research: Vertical layout | /home/jak/substrate/007-manage-workflows/docs/plans/011-ui-mocks/external-research/react-flow-vertical-layouts.md |
| External research: Blocking UX | /home/jak/substrate/007-manage-workflows/docs/plans/011-ui-mocks/external-research/blocking-input-ux-patterns.md |

### Visual Alignment Aids

#### System Flow Diagram

```mermaid
flowchart TD
    subgraph Views["User Navigation Flow"]
        A[All Workflows<br/>Grid View] -->|Click Card| B[Single Workflow<br/>Template View]
        A -->|Click Runs| C[Runs List<br/>Table View]
        B -->|Click Runs Tab| C
        B -->|View Checkpoints| D[Checkpoint Timeline]
        C -->|Click Row| E[Single Run<br/>Execution View]
        E -->|Click Phase| F[Phase Detail Panel]
        F -->|Status: Blocked| G[Question Input Form]
    end

    subgraph States["Phase States"]
        S1[pending<br/>Gray] --> S2[ready<br/>Yellow]
        S2 --> S3[active<br/>Blue]
        S3 --> S4[blocked<br/>Orange]
        S4 -->|Answer| S5[accepted<br/>Lime]
        S5 --> S6[complete<br/>Green]
        S3 --> S6
        S3 --> S7[failed<br/>Red]
    end
```

#### Sequence Diagram: Question Answering Flow

```mermaid
sequenceDiagram
    participant U as User
    participant RV as Single Run View
    participant RF as RunFlowContent
    participant NDP as NodeDetailPanel
    participant QI as QuestionInput
    participant SIM as usePhaseSimulation

    U->>RV: Navigate to run
    RV->>SIM: Start simulation
    SIM->>RF: Update phase: active
    RF-->>U: Shows active phase (blue, pulsing)
    
    Note over SIM: Timer advances...
    SIM->>RF: Update phase: blocked
    RF-->>U: Shows blocked phase (orange)
    
    U->>RF: Click blocked phase
    RF->>NDP: Open panel
    NDP->>QI: Render question form
    QI-->>U: Shows question with options
    
    U->>QI: Select option & submit
    QI->>SIM: onSubmitAnswer(answer)
    SIM->>RF: Update phase: accepted → complete
    RF-->>U: Phase transitions (lime → green)
```

### Test Plan

**Approach**: Lightweight (per spec Testing Strategy)
**Rationale**: Mockup for rapid design iteration; visual validation is primary
**Testing Utilities**: Use FakeMatchMedia from 006-web-extras for responsive tests

| Test ID | Component(s) | Test Description | Expected Result | Priority |
|---------|-------------|------------------|-----------------|----------|
| TEST-01 | WorkflowCard | Renders with all props | Card displays slug, counts, status | High |
| TEST-02 | RunList | Renders with runs array | Table rows appear in descending order | High |
| TEST-03 | QuestionInput (single_choice) | Renders radio buttons | Radio buttons visible with labels | High |
| TEST-04 | QuestionInput (multi_choice) | Renders checkboxes | Checkboxes visible with labels | High |
| TEST-05 | QuestionInput (free_text) | Renders textarea | Textarea visible with prompt | High |
| TEST-06 | QuestionInput (confirm) | Renders Yes/No buttons | Two buttons visible | High |
| TEST-07 | RunFlowContent | Renders vertical layout | Nodes arranged top-to-bottom | Medium |
| TEST-08 | StatusBadge | Renders all 7 PhaseRunStatus states | Correct colors for each status | Medium |
| TEST-09 | VerticalPhaseNode | Has correct handles | Top target, bottom source handles | Medium |
| TEST-10 | CheckpointTimeline | Renders checkpoint list | Cards in chronological order | Low |
| TEST-11 | WorkflowCard (responsive) | Desktop vs Phone layout | Grid adapts using useResponsive | Medium |
| TEST-12 | RunFlowContent (responsive) | Phone viewport | Appropriate sizing via useResponsive | Medium |

**Fixture Requirements**:
- Use factory functions from T001
- No vi.mock() usage (per spec: fixture-based)
- Use FakeMatchMedia.setViewportWidth() for responsive tests

**Test Setup Pattern**:
```typescript
import { FakeMatchMedia } from '@/test/fakes/fake-match-media';

beforeAll(() => {
  FakeMatchMedia.install();
});

afterAll(() => {
  FakeMatchMedia.uninstall();
});

it('renders phone layout', () => {
  FakeMatchMedia.setViewportWidth(375);  // Phone
  // render component
});

it('renders desktop layout', () => {
  FakeMatchMedia.setViewportWidth(1280);  // Desktop
  // render component
});
```

### Step-by-Step Implementation Outline

**Recommended order** (respecting dependencies):

1. **Navigation (T000)** – Add Workflows NavItem to navigation-utils.ts
2. **Foundation (T001, T002, T021)** – Fixtures matching Plan 010 types, extended status colors, SSE schema
3. **Shared Components (T005, T019)** – StatusBadge (7 states), Breadcrumb
4. **Vertical Node (T003, T023)** – VerticalPhaseNode with animation
5. **Vertical Layout (T004)** – RunFlowContent with Dagre; use useResponsive()
6. **Card/Row Components (T006, T008, T016)** – WorkflowCard, RunRow, CheckpointCard
7. **List Components (T009, T017)** – RunList, CheckpointTimeline
8. **Question Input (T012, T013)** – QuestionInput + integration
9. **Pages in order**:
   - T007: All Workflows page (depends on T000)
   - T010: Single Workflow page
   - T018: Add checkpoints to T010
   - T011: Runs page
   - T014: Single Run page (use useResponsive())
   - T020: Add breadcrumbs to all pages
10. **Simulation (T022)** – Phase progression hook
11. **Tests (T024)** – Render validation with FakeMatchMedia

### Commands to Run

```bash
# Navigate to web app
cd /home/jak/substrate/007-manage-workflows/apps/web

# Install dependencies (if needed)
pnpm install

# Type check
pnpm tsc --noEmit

# Run linter
pnpm lint

# Run tests (after T024)
pnpm test test/ui/workflow-views.test.tsx

# Start dev server (for visual validation)
pnpm dev

# Full build check
pnpm build
```

### Risks & Unknowns

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Plan 010 entity types shift | Medium | Medium | Factory functions abstract shape; single update point |
| Dagre layout positioning issues | Medium | Medium | External research provides TB config; fallback to manual positions |
| Question component scope creep | Low | Low | Strict 4-type limit; reject additional types |
| CSS import order regression | Medium | Low | Add comment guards; verify in each new page |
| ReactFlow v12 API changes | Low | Low | Pin version; follow measured dimensions pattern |
| Fixture data volume affects perf | Low | Low | Mockup; small datasets sufficient for validation |
| MOBILE_NAV_ITEMS limited to 3 items | Medium | Medium | Either replace demo or accept desktop-only; decide in T000 |
| DashboardSidebar hardcodes nav items | Low | Medium | May need minor refactor; defer if working as-is |

### Ready Check

- [x] Spec reviewed (ui-mocks-spec.md)
- [x] Plan reviewed (ui-mocks-plan.md) – **v1.1.0 with 006-web-extras**
- [x] Critical Findings mapped to tasks (see table above)
- [x] ADR constraints mapped to tasks – N/A (ADR seeds only, not formalized)
- [x] External research reviewed (vertical layouts, blocking UX)
- [x] Existing component patterns reviewed (PhaseNode, WorkflowContent, NodeDetailPanel)
- [x] **006-web-extras assets reviewed** (useResponsive, FakeMatchMedia, navigation-utils)
- [x] **Plan 010 entity types reviewed** (WorkflowJSON, PhaseJSON, PhaseRunStatus)
- [x] File paths verified (all absolute paths)
- [x] Dependencies analyzed (25 tasks, clear dependency graph)
- [ ] **Awaiting GO/NO-GO from human sponsor**

---

## Phase Footnote Stubs

_To be populated during implementation by plan-6._

| # | Task | Description | Link |
|---|------|-------------|------|
| | | | |

---

## Evidence Artifacts

**Execution Log**: `./execution.log.md` (created by plan-6)

**Supporting Files** (as needed):
- Screenshots of implemented views
- Performance measurements (if concerns arise)
- Code snippets for complex patterns

---

## Discoveries & Learnings

_Populated during implementation by plan-6. Log anything of interest to your future self._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| | | | | | |

**Types**: `gotcha` | `research-needed` | `unexpected-behavior` | `workaround` | `decision` | `debt` | `insight`

**What to log**:
- Things that didn't work as expected
- External research that was required
- Implementation troubles and how they were resolved
- Gotchas and edge cases discovered
- Decisions made during implementation
- Technical debt introduced (and why)
- Insights that future phases should know about

_See also: `execution.log.md` for detailed narrative._

---

## Directory Structure

```
docs/plans/011-ui-mocks/
├── research-dossier.md
├── ui-mocks-spec.md
├── ui-mocks-plan.md
├── external-research/
│   ├── react-flow-vertical-layouts.md
│   └── blocking-input-ux-patterns.md
└── tasks/phase-1-implementation/
    ├── tasks.md                    # This file
    └── execution.log.md            # Created by /plan-6
```

---

**STOP**: Do not edit code. Awaiting human **GO** to proceed with implementation via `/plan-6-implement-phase`.
