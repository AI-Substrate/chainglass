# Workflow Execution UI Mockups Implementation Plan

**Mode**: Simple
**Plan Version**: 1.1.0
**Created**: 2026-01-26
**Updated**: 2026-01-26 (Incorporated 006-web-extras patterns)
**Spec**: [./ui-mocks-spec.md](./ui-mocks-spec.md)
**Status**: READY

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Critical Research Findings](#critical-research-findings)
3. [006-Web-Extras Integration](#006-web-extras-integration)
4. [Plan 010 Entity Alignment](#plan-010-entity-alignment)
5. [Implementation](#implementation)
6. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: Users need a visual interface to monitor workflow executions, see phase-by-phase progress in a vertical layout, and interact with workflows that require human input (questions, approvals). Currently no UI exists for this human-in-the-loop pattern.

**Solution Approach**:
- Create fixture-based mockups for rapid design iteration (no backend dependency)
- Build vertical React Flow layout for run execution views
- Implement QuestionInput component for 4 input types (single_choice, multi_choice, free_text, confirm)
- Create shared components for reuse across template and run views
- **Leverage 006-web-extras infrastructure**: useResponsive hook, NavigationWrapper, FakeMatchMedia tests
- **Integrate with navigation system**: Add Workflows to NAV_ITEMS/MOBILE_NAV_ITEMS

**Expected Outcome**: Interactive UI mockups enabling validation of workflow execution UX patterns before production implementation. Stakeholders can browse workflows, view runs, and answer questions in blocked phases.

---

## Critical Research Findings (Concise)

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Human Input component blocks workflow execution; no unblock path exists | Implement QuestionInput modal with all 4 types as priority task |
| 02 | Critical | Vertical layout requires new component variant; horizontal WorkflowContent not configurable | Create RunFlowContent with Dagre TB layout + top/bottom handles |
| 03 | Critical | **Navigation not integrated**: Workflows page needs entry in NAV_ITEMS and MOBILE_NAV_ITEMS | Add NavItem to navigation-utils.ts; refactor DashboardSidebar to import |
| 04 | High | Entity adapters not implemented; fixtures must match Plan 010 WorkflowJSON/PhaseJSON shape | Create fixture factory functions matching exact Plan 010 types |
| 05 | High | SSE schema needs 4+ new event types for run/phase/question events | Extend sse-events.schema.ts with run_status, phase_status, question |
| 06 | High | CSS import order: ReactFlow CSS must load before Tailwind | Verify import order in all new page layouts |
| 07 | High | Existing PhaseNode uses Left/Right handles; vertical needs Top/Bottom | Create VerticalPhaseNode with corrected handle positions |
| 08 | High | **useResponsive available from 006**: Three-tier responsive hook ready to use | Use useResponsive() instead of custom responsive logic |
| 09 | Medium | NodeDetailPanel exists; can extend for Question form rendering | Add QuestionForm child component to NodeDetailPanel |
| 10 | Medium | Status colors exist (4 states); Plan 010 defines 7 PhaseRunStatus values | Extend statusColors map to match PhaseRunStatus enum |
| 11 | Medium | nodeTypes must be memoized outside component | Keep NODE_TYPES pattern in new components |
| 12 | Medium | useFlowState works for state management; no new state library needed | Reuse useFlowState for vertical layouts |
| 13 | Medium | **FakeMatchMedia available**: Test fake for responsive testing from 006 | Use FakeMatchMedia in tests for viewport simulation |
| 14 | Medium | Shared Card pattern in KanbanCard; reuse for WorkflowCard/RunCard | Use shadcn Card + border-left status indicator pattern |
| 15 | Low | Timer-based state simulation sufficient for mockup phase | Use setInterval for phase progression demo |

**Sources**: Implementation Strategist (I1-01 through I1-08), Risk Planner (R1-01 through R1-08), research-dossier.md, external-research/, 006-web-extras analysis

---

## 006-Web-Extras Integration

**New Infrastructure from Plan 006** (merged from PR #9):

### Hooks to Leverage
| Hook | Purpose | Use In Plan 011 |
|------|---------|-----------------|
| `useResponsive()` | Three-tier device detection (phone/tablet/desktop) | Adaptive layouts for workflow views |
| `useFileViewerState()` | File content display state | Future: workflow definition viewer |
| `useMarkdownViewerState()` | Markdown toggle state | Future: phase descriptions |

### Components to Leverage
| Component | Purpose | Use In Plan 011 |
|-----------|---------|-----------------|
| `NavigationWrapper` | Auto-switches phone ↔ desktop nav | Already wraps dashboard layout |
| `BottomTabBar` | Phone navigation | Works automatically if in MOBILE_NAV_ITEMS |
| `MermaidRenderer` | Diagram rendering | Future: workflow diagrams |
| `StatusBadge`-like patterns | Viewer state indicators | Pattern for our StatusBadge |

### Test Utilities Available
| Utility | Purpose | Use In Plan 011 |
|---------|---------|-----------------|
| `FakeMatchMedia` | Viewport simulation | Test responsive workflow views |
| `FakeResizeObserver` | Element resize events | Test container-query components |
| `FakeEventSource` | SSE testing | Test live execution feeds |

### Navigation Integration Required

**Current State** (navigation-utils.ts):
```typescript
export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', label: 'Home', href: '/', icon: Home },
  { id: 'workflow', label: 'Workflow Visualization', href: '/workflow', icon: GitBranch },
  { id: 'kanban', label: 'Kanban Board', href: '/kanban', icon: LayoutDashboard },
  // ... demos
];
```

**Required Changes**:
1. Add `{ id: 'workflows', label: 'Workflows', href: '/workflows', icon: ListChecks }` to NAV_ITEMS
2. Add to MOBILE_NAV_ITEMS (may need to replace a demo or accept 4 items)
3. **Refactor DashboardSidebar**: Currently hardcodes nav items; should import from navigation-utils.ts

---

## Plan 010 Entity Alignment

**Entity Types from packages/workflow/src/** (must align fixtures):

### WorkflowJSON Shape
```typescript
interface WorkflowJSON {
  slug: string;
  workflowDir: string;
  version: string;
  description: string | null;
  isCurrent: boolean;
  isCheckpoint: boolean;
  isRun: boolean;
  isTemplate: boolean;
  source: 'current' | 'checkpoint' | 'run';
  checkpoint: CheckpointMetadataJSON | null;
  run: RunMetadataJSON | null;
  phases: PhaseJSON[];
}
```

### PhaseJSON Shape
```typescript
interface PhaseJSON {
  name: string;
  phaseDir: string;
  runDir: string;
  description: string;
  order: number;
  status: PhaseRunStatus;  // 7 values
  facilitator: 'agent' | 'orchestrator';
  state: PhaseState;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  // Computed booleans
  isPending: boolean;
  isReady: boolean;
  isActive: boolean;
  isBlocked: boolean;
  isComplete: boolean;
  isFailed: boolean;
  isDone: boolean;
  // Collections
  inputFiles: PhaseInputFile[];
  inputParameters: PhaseInputParameter[];
  inputMessages: PhaseInputMessage[];
  outputs: PhaseOutput[];
  statusHistory: PhaseStatusEntry[];
}
```

### Status Enums
```typescript
type RunStatus = 'pending' | 'active' | 'complete' | 'failed';
type PhaseRunStatus = 'pending' | 'ready' | 'active' | 'blocked' | 'accepted' | 'complete' | 'failed';
type Facilitator = 'agent' | 'orchestrator';
```

**Fixture Strategy**: Create factory functions that produce valid WorkflowJSON/PhaseJSON structures. Use discriminated unions for source-specific data (current vs checkpoint vs run).

---

## Implementation (Single Phase)

**Objective**: Create interactive workflow execution UI mockups with vertical phase layout, run history, and human input handling.

**Testing Approach**: Lightweight (core rendering validation only)
**Mock Usage**: Fixture-based (all data from fixtures, no backend mocking)
**Documentation**: None (internal mockup for design exploration)

### Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Notes |
|--------|-----|------|----|------|--------------|------------------|------------|-------|
| [ ] | T000 | **Navigation Integration**: Add Workflows NavItem to navigation-utils.ts and MOBILE_NAV_ITEMS | 2 | Setup | -- | /home/jak/substrate/007-manage-workflows/apps/web/src/lib/navigation-utils.ts | NavItem appears in sidebar; mobile nav shows Workflows | Must import ListChecks icon; decide mobile slot allocation |
| [ ] | T001 | Create workflow/run/checkpoint fixture data with factory functions | 3 | Setup | -- | /home/jak/substrate/007-manage-workflows/apps/web/src/data/fixtures/workflows.fixture.ts, /home/jak/substrate/007-manage-workflows/apps/web/src/data/fixtures/runs.fixture.ts | Fixtures compile; match Plan 010 WorkflowJSON/PhaseJSON types exactly | Use PhaseRunStatus enum (7 values); include checkpoint and run metadata |
| [ ] | T002 | Extend status color map to 7 PhaseRunStatus states | 1 | Core | -- | /home/jak/substrate/007-manage-workflows/apps/web/src/components/workflow/phase-node.tsx | All 7 colors render correctly | pending/gray, ready/amber, active/blue, blocked/orange, accepted/lime, complete/emerald, failed/red |
| [ ] | T003 | Create VerticalPhaseNode with Top/Bottom handles | 2 | Core | T002 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/workflow/vertical-phase-node.tsx | Node renders with correct handle positions | Memo wrapper; use Position.Top target, Position.Bottom source |
| [ ] | T004 | Create RunFlowContent component for vertical run visualization | 3 | Core | T001, T003 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/runs/run-flow-content.tsx | Vertical layout renders phases top-to-bottom | Use smoothstep edges; use useResponsive() for adaptive sizing |
| [ ] | T005 | Create StatusBadge component (7 PhaseRunStatus states) | 1 | Core | T002 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/ui/status-badge.tsx | All status variants render with correct color/icon | Shared across WorkflowCard, RunRow, PhaseNode; match Plan 010 statuses |
| [ ] | T006 | Create WorkflowCard component for All Workflows grid | 2 | Core | T001, T005 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/workflows/workflow-card.tsx | Card displays slug, description, counts, status indicator | Show checkpoint count, run count, active run count, waiting indicator per AC-01 |
| [ ] | T007 | Create WorkflowList page (All Workflows grid) | 2 | Core | T000, T006 | /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/page.tsx | Grid of workflow cards renders from fixtures | Use CSS grid; newest workflows first; useResponsive() for columns |
| [ ] | T008 | Create RunRow component for runs table | 2 | Core | T005 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/runs/run-row.tsx | Row shows run ID, status badge, current phase, timing | Table row; click navigates to single run |
| [ ] | T009 | Create RunList component (All Runs for a workflow) | 2 | Core | T008 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/runs/run-list.tsx | Table of runs sorted by createdAt descending | Include workflow context header |
| [ ] | T010 | Create Single Workflow View page (template inspector) | 2 | Core | T001, T004 | /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/[slug]/page.tsx | Displays workflow phases in vertical layout, no run status | Reuse RunFlowContent in template mode |
| [ ] | T011 | Create Runs page for a workflow | 2 | Core | T009 | /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/[slug]/runs/page.tsx | Shows RunList filtered by workflow slug | Link from WorkflowCard |
| [ ] | T012 | Create QuestionInput component (4 question types) | 3 | Core | -- | /home/jak/substrate/007-manage-workflows/apps/web/src/components/phases/question-input.tsx | All 4 input types render: radio (single_choice), checkboxes (multi_choice), textarea (free_text), yes/no (confirm) | Modal dialog; accessibility: never disable submit; 44×44px touch targets |
| [ ] | T013 | Integrate QuestionInput into NodeDetailPanel | 2 | Core | T012 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/workflow/node-detail-panel.tsx | Question form appears when phase is blocked | Conditional render based on phase.status === 'blocked' |
| [ ] | T014 | Create Single Run View page (execution timeline) | 3 | Core | T004, T013 | /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/[slug]/runs/[runId]/page.tsx | Vertical phase flow with active phase highlight, question input on blocked | RunFlowContent + RunHeader + NodeDetailPanel; useResponsive() layout |
| [ ] | T015 | Create RunHeader component (run status summary) | 1 | Core | T005 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/runs/run-header.tsx | Shows Run ID, status badge, started time, duration | At top of Single Run View |
| [ ] | T016 | Create CheckpointCard component | 1 | Core | T005 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/checkpoints/checkpoint-card.tsx | Displays version badge (v001-abc12345), date, comment | For checkpoint timeline |
| [ ] | T017 | Create CheckpointTimeline component | 2 | Core | T016 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/checkpoints/checkpoint-timeline.tsx | Vertical timeline of checkpoints with View/Start Run actions | View-only for mockup (no restore) |
| [ ] | T018 | Add checkpoint timeline to Single Workflow View | 1 | Core | T010, T017 | /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/[slug]/page.tsx | Timeline renders below phase view | Tab or sidebar layout |
| [ ] | T019 | Create breadcrumb navigation component | 1 | Core | -- | /home/jak/substrate/007-manage-workflows/apps/web/src/components/ui/workflow-breadcrumb.tsx | Shows: Workflows > [Workflow Name] > Runs > [Run ID] | Use shadcn Breadcrumb; context-aware |
| [ ] | T020 | Add breadcrumbs to all workflow/run pages | 1 | Core | T019 | /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/[slug]/page.tsx, /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/[slug]/runs/page.tsx, /home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/workflows/[slug]/runs/[runId]/page.tsx | Breadcrumbs visible and clickable on all detail views | Per AC-24, AC-25 |
| [ ] | T021 | Extend SSE schema with run/phase/question event types | 2 | Core | -- | /home/jak/substrate/007-manage-workflows/apps/web/src/lib/schemas/sse-events.schema.ts | Schema validates new event types without breaking existing | Add run_status, phase_status, question, answer discriminated union members |
| [ ] | T022 | Create timer-based phase progression simulation | 2 | Core | T001, T021 | /home/jak/substrate/007-manage-workflows/apps/web/src/hooks/usePhaseSimulation.ts | Phases transition: pending→ready→active→complete with configurable timing | setInterval-based; triggers on Single Run View mount |
| [ ] | T023 | Add pulse animation for active phase nodes | 1 | Core | T003 | /home/jak/substrate/007-manage-workflows/apps/web/src/components/workflow/vertical-phase-node.tsx | Active phase has visible pulsing border/glow | CSS animation or Tailwind animate-pulse variant |
| [ ] | T024 | Test: Core component rendering validation with FakeMatchMedia | 2 | Test | T006, T009, T012, T014 | /home/jak/substrate/007-manage-workflows/test/ui/workflow-views.test.tsx | WorkflowCard, RunList, QuestionInput, RunFlowContent render without errors | Use FakeMatchMedia for responsive viewport tests; test phone + desktop |

**Task Count**: 25 tasks (added T000 for navigation integration)
**Total Complexity**: CS-46 (sum) → average CS-1.84 per task

### Directory Structure (New Files)

```
/home/jak/substrate/007-manage-workflows/apps/web/
├── app/(dashboard)/
│   └── workflows/
│       ├── page.tsx                              # T007: All Workflows grid
│       └── [slug]/
│           ├── page.tsx                          # T010: Single Workflow View
│           └── runs/
│               ├── page.tsx                      # T011: All Runs for workflow
│               └── [runId]/
│                   └── page.tsx                  # T014: Single Run View
├── src/
│   ├── components/
│   │   ├── checkpoints/
│   │   │   ├── checkpoint-card.tsx               # T016
│   │   │   └── checkpoint-timeline.tsx           # T017
│   │   ├── phases/
│   │   │   └── question-input.tsx                # T012
│   │   ├── runs/
│   │   │   ├── run-flow-content.tsx              # T004
│   │   │   ├── run-header.tsx                    # T015
│   │   │   ├── run-list.tsx                      # T009
│   │   │   └── run-row.tsx                       # T008
│   │   ├── ui/
│   │   │   ├── status-badge.tsx                  # T005
│   │   │   └── workflow-breadcrumb.tsx           # T019
│   │   ├── workflow/
│   │   │   └── vertical-phase-node.tsx           # T003
│   │   └── workflows/
│   │       └── workflow-card.tsx                 # T006
│   ├── data/fixtures/
│   │   ├── workflows.fixture.ts                  # T001
│   │   └── runs.fixture.ts                       # T001
│   ├── hooks/
│   │   └── usePhaseSimulation.ts                 # T022
│   └── lib/schemas/
│       └── sse-events.schema.ts                  # T021 (modify existing)
└── test/ui/
    └── workflow-views.test.tsx                   # T024
```

### Acceptance Criteria

Per spec AC-01 through AC-25:

- [ ] **AC-01**: All Workflows page shows grid with slug, description, checkpoint count, run count, active run count, status indicators
- [ ] **AC-04**: Runs table shows rows sorted by createdAt descending (newest first)
- [ ] **AC-08**: Single Run View shows phases vertically (top-to-bottom) using React Flow
- [ ] **AC-10**: Active phase has visual highlight (pulsing border)
- [ ] **AC-13**: Blocked phase shows prominent "Needs Input" indicator
- [ ] **AC-14-18**: QuestionInput renders all 4 types correctly (radio, checkbox, textarea, yes/no)
- [ ] **AC-19**: Submitting answer updates fixture state and phase transitions
- [ ] **AC-24-25**: Breadcrumb navigation works on all detail views

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Plan 010 entity types shift during development | Medium | Medium | Use factory functions; abstract fixture structure |
| Vertical layout complexity underestimated | Medium | High | Use Dagre auto-layout fallback if manual positioning fails |
| Question component scope creep (additional types) | Low | Low | Defer new types to future plan; implement 4 core types only |
| CSS import order regression | Low | Medium | Add comment guards in layout files; verify in PR checklist |

### Component Reuse Matrix

| Component | All WFs | Single WF | All Runs | Single Run | Notes |
|-----------|---------|-----------|----------|------------|-------|
| StatusBadge | ✅ | ✅ | ✅ | ✅ | Shared across all views |
| WorkflowCard | ✅ | | | | Grid card |
| RunRow | | | ✅ | | Table row |
| RunHeader | | | | ✅ | Run detail header |
| RunFlowContent | | ✅ | | ✅ | Vertical phase layout |
| VerticalPhaseNode | | ✅ | | ✅ | Phase in vertical flow |
| QuestionInput | | | | ✅ | Modal when blocked |
| CheckpointTimeline | | ✅ | | | Version history |
| WorkflowBreadcrumb | | ✅ | ✅ | ✅ | Navigation |

### Status Color System (Extended)

| Status | Color | Hex | Icon | CSS Class |
|--------|-------|-----|------|-----------|
| pending | Gray | #6B7280 | ⏸️ | `bg-gray-500` |
| ready | Yellow | #F59E0B | ⏳ | `bg-amber-500` |
| active | Blue | #3B82F6 | ▶️ | `bg-blue-500` |
| blocked | Orange | #F97316 | 🚫 | `bg-orange-500` |
| accepted | Lime | #84CC16 | ✓ | `bg-lime-500` |
| complete | Green | #10B981 | ✅ | `bg-emerald-500` |
| failed | Red | #EF4444 | ❌ | `bg-red-500` |

---

## ADR Ledger

| ADR | Status | Affects Tasks | Notes |
|-----|--------|---------------|-------|
| ADR-011-01 | Seed | T003, T004 | Vertical layout implementation (create new component vs extend) |
| ADR-011-02 | Seed | T001 | Fixture data strategy (match entity types vs mockup-specific) |
| ADR-011-03 | Seed | T012 | Human input component architecture (single component vs separate) |

**Note**: ADR seeds identified in spec. Full ADRs can be generated with `/plan-3a-adr` if design decisions need formal documentation.

---

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| Clean Architecture | ✅ | Fixtures isolated in data layer; components in presentation |
| Interface-First | ⚠️ Deviation | Mockup uses fixtures not interfaces; acceptable for design exploration |
| TDD | ⚠️ Deviation | Lightweight testing per spec; visual validation primary goal |
| Fakes Over Mocks | ✅ | Fixture-based; no vi.mock() usage |
| Fast Feedback | ✅ | No backend dependency; instant fixture rendering |

**Deviation Justification**: Mockup phase prioritizes rapid design iteration over production architecture. Full TDD and interface-first will apply when productionizing from mockup learnings.

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]

---

**Next steps:**
- **Ready to implement**: `/plan-6-implement-phase --plan "docs/plans/011-ui-mocks/ui-mocks-plan.md"`
- **Optional validation**: `/plan-4-complete-the-plan` (recommended for first-time review)
- **Optional task expansion**: `/plan-5-phase-tasks-and-brief` (if you want a separate dossier)

---

*Plan generated 2026-01-26 by /plan-3-architect (Simple mode)*
