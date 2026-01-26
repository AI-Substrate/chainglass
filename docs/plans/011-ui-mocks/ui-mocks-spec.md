# Workflow Execution UI Mockups

**Plan**: 011-ui-mocks
**Created**: 2026-01-26
**Status**: Draft
**Mode**: Simple

📚 This specification incorporates findings from `research-dossier.md` (55+ findings across 7 research domains).

✅ **External Research Complete**
Both research opportunities from research-dossier.md have been addressed:
- **React Flow Vertical Layouts**: See `external-research/react-flow-vertical-layouts.md`
- **Blocking Input UX Patterns**: See `external-research/blocking-input-ux-patterns.md`

---

## Research Context

This specification incorporates findings from `research-dossier.md` and external research.

- **Components Affected**: `apps/web/src/components/workflow/*`, `apps/web/src/hooks/*`, `apps/web/app/(dashboard)/*`
- **Critical Dependencies**: React Flow v12.10.0 (existing), SSE infrastructure (existing), Entity model from Plan 010 (in progress)
- **Modification Risks**: 
  - Vertical layout requires WorkflowContent changes or new variant
  - Entity adapters not yet implemented (fixture-based approach for mockup)
  - SSE schema needs extension for new event types
- **Prior Learnings**: 7 critical patterns from 005-web-slick (CSS order, Zustand avoidance, SSE patterns)

See `research-dossier.md` for full analysis (55+ findings).

---

## Summary

**WHAT**: Create interactive UI mockups for workflow execution visualization that enable users to:
1. View all workflows and their checkpoints
2. Browse run history with at-a-glance status
3. Monitor active workflow executions with phase-by-phase progress
4. Answer questions when workflows require human input
5. Inspect workflow templates and phase definitions

**WHY**: 
- Users need visual understanding of workflow state and progress
- Human-in-the-loop workflows require interaction points for questions/approvals
- Rapid design iteration on UI concepts before full implementation
- Validate UX patterns for the eventual production workflow management interface

---

## Goals

1. **Workflow Discovery**: Users can browse all available workflows with version/checkpoint information
2. **Run Visibility**: Users can see all runs for a workflow with status, current phase, and timing at a glance
3. **Execution Monitoring**: Users can watch workflow execution progress phase-by-phase in real-time
4. **Human Interaction**: Users can answer questions (multiple choice, free text, confirmations) when workflows are blocked
5. **Template Inspection**: Users can view workflow structure and phase definitions before execution
6. **Design Validation**: Rapidly iterate on UI/UX concepts using fixture data before backend integration
7. **Shared Components**: Create reusable phase/status visualization components for both template and run views

---

## Non-Goals

1. **Production Backend Integration**: Mockups use fixture data, not real adapters (Plan 010 dependency)
2. **Workflow Editing**: View-only for this iteration; no create/edit/delete operations
3. **Run Execution Controls**: No start/stop/pause/resume functionality
4. **Authentication/Authorization**: No user-specific access controls
5. **Mobile Optimization**: Desktop-first mockups; responsive design deferred
6. **Performance Optimization**: Focus on UX validation, not large dataset handling
7. **Persistence**: Mockup state is ephemeral; no saving user preferences or layouts

---

## Complexity

**Score**: CS-3 (medium)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 2 | ~10 new components, 3+ new pages, fixture data, SSE extensions |
| Integration (I) | 1 | Extends existing React Flow, SSE; no new external services |
| Data/State (D) | 1 | New fixtures, extended SSE schema; no persistence |
| Novelty (N) | 1 | Clear requirements from user; some UX decisions pending |
| Non-Functional (F) | 0 | Standard web UI; no strict perf/security requirements |
| Testing/Rollout (T) | 1 | Component tests needed; no feature flags for mockup |

**Total**: 6 → CS-3

**Confidence**: 0.80
- High confidence on component structure (research-informed)
- Moderate uncertainty on vertical layout implementation details
- Low risk due to mockup/fixture approach

**Assumptions**:
1. Fixture data sufficient for mockup validation (no adapter dependency)
2. Existing React Flow infrastructure can support vertical layout
3. SSE extension is additive (no breaking changes)
4. Plan 010 entity model is stable enough for UI type definitions

**Dependencies**:
- Plan 010: Entity model types (Workflow, Run, Phase, Checkpoint)
- Existing: React Flow, SSE infrastructure, shadcn/ui

**Risks**:
1. **Vertical layout complexity**: May need external layout library (dagre/elkjs)
2. **Entity model changes**: Plan 010 still in progress; types may shift
3. **Scope creep**: Mockup may expand toward production features

**Suggested Phases**:
1. **Phase 1: Core Views & Fixtures** - WorkflowList, RunList, fixture data
2. **Phase 2: Execution View** - Vertical phase layout, status indicators
3. **Phase 3: Human Interaction** - QuestionInput component, blocked state handling
4. **Phase 4: Polish & Demo** - Checkpoint timeline, navigation, demo scenarios

---

## Acceptance Criteria

### Workflow Discovery

**AC-01**: Given the All Workflows page loads, when I view the page, then I see a grid of workflow cards showing slug, description, checkpoint count, run count, **active run count**, and **run status indicators** (waiting/blocked, running, or idle) for each workflow.

**AC-02**: Given a workflow card is displayed, when I click "View", then I navigate to the Single Workflow View showing the workflow's phases.

**AC-03**: Given a workflow has checkpoints, when I view the workflow, then I see a timeline or list of checkpoints with version badges (e.g., "v001-abc12345") and creation dates.

### Run History

**AC-04**: Given I'm viewing a workflow, when I click "Runs" tab/button, then I see a table of all runs sorted by creation date (newest first).

**AC-05**: Given the runs table is displayed, then each row shows: Run ID, Status Badge (color-coded), Current Phase name, Started time, and Duration.

**AC-06**: Given a run is active, when I view the runs list, then the status badge shows "active" (blue) and the current phase is displayed.

**AC-07**: Given I click on a run row, then I navigate to the Single Run View for that run.

### Execution Monitoring

**AC-08**: Given I'm viewing a single run, then I see phases arranged vertically (top-to-bottom) using React Flow.

**AC-09**: Given phases are displayed, then each phase node shows: name, status indicator (color + icon), and order number.

**AC-10**: Given a phase is currently active, then the phase node has a visual highlight (pulsing border or glow effect).

**AC-11**: Given phases have dependencies, then edges connect phases showing execution order.

**AC-12**: Given I click on a phase node, then a detail panel opens showing phase description, inputs, outputs, and status history.

### Human Interaction

**AC-13**: Given a phase is in "blocked" status waiting for input, then the phase node displays a prominent "Needs Input" indicator.

**AC-14**: Given a phase needs input, when I click on it, then a Question/Input form appears in the detail panel.

**AC-15**: Given a single-choice question is displayed, then I see radio buttons for each option with labels.

**AC-16**: Given a multi-choice question is displayed, then I see checkboxes for each option with labels.

**AC-17**: Given a free-text question is displayed, then I see a text input or textarea with the prompt.

**AC-18**: Given a confirmation question is displayed, then I see the prompt with "Yes" and "No" buttons.

**AC-19**: Given I submit an answer, then the input form closes and the phase status updates (simulated via fixture state change).

### Template Inspection

**AC-20**: Given I'm viewing a workflow template (not a run), then phases show definition view (no execution status, just structure).

**AC-21**: Given I click on a template phase, then I see phase description, input schemas, and output schemas.

### Real-Time Updates (Simulated)

**AC-22**: Given SSE events are simulated, when a `phase_status` event fires, then the corresponding phase node updates its status color.

**AC-23**: Given a run completes, when the final phase status changes to "complete", then the run header shows "Complete" status.

### Navigation

**AC-24**: Given I'm on any detail view, then I see breadcrumb navigation showing: Workflows > [Workflow Name] > Runs > [Run ID] (as applicable).

**AC-25**: Given I click a breadcrumb link, then I navigate to that level of the hierarchy.

---

## Risks & Assumptions

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Vertical layout requires complex auto-positioning | Medium | Start with manual positions in fixtures; add dagre later if needed |
| Plan 010 entity types change during mockup development | Medium | Define mockup-specific types that map to entities; abstract boundary |
| Scope expands toward production features | High | Strict acceptance criteria; defer production concerns to future plan |
| SSE simulation complexity | Low | Use simple timer-based state updates in fixtures |
| Question types require more UI variants | Low | Start with 4 core types; expand based on feedback |

### Assumptions

1. **Fixture-First**: Mockups will use hardcoded fixture data that matches Plan 010 entity shapes
2. **Desktop-Only**: Responsive design is not required for mockup validation
3. **React Flow Suitability**: Vertical layouts are achievable with React Flow configuration
4. **Single Workflow Focus**: All Runs view scoped to a single workflow, not cross-workflow
5. **Simulated SSE**: Real-time feel achieved through timer-based state changes, not actual SSE events

---

## Open Questions

~~All resolved via Simple mode defaults:~~

1. ~~**Auto-layout vs Manual Positioning**~~ → Manual (fixtures define positions)
2. ~~**Checkpoint Interaction**~~ → Deferred (view-only mockup)
3. ~~**Question Response Persistence**~~ → Session state (ephemeral, resets on refresh)
4. ~~**Error States**~~ → Include basic failed status display (red indicator)
5. ~~**Phase Timing Display**~~ → Started timestamp only (simpler implementation)

---

## ADR Seeds (Optional)

### ADR-011-01: Vertical Layout Implementation

**Decision Drivers**:
- User requirement for top-to-bottom phase visualization
- Existing horizontal React Flow implementation
- Desire for consistent component reuse

**Candidate Alternatives**:
- A: **Props on WorkflowContent** - Add `direction="vertical"` prop, configure handles/edges
- B: **New RunFlowContent Component** - Separate component optimized for vertical run display
- C: **Auto-Layout Library** - Integrate dagre/elkjs for automatic positioning

**Stakeholders**: UI/UX, Frontend team

---

### ADR-011-02: Fixture Data Strategy

**Decision Drivers**:
- Plan 010 entity types still evolving
- Need for realistic demo scenarios
- Desire to minimize rework when adapters are ready

**Candidate Alternatives**:
- A: **Match Entity Types Exactly** - Fixtures use `Workflow.toJSON()` shape
- B: **Mockup-Specific Types** - Simpler types with adapter mapping later
- C: **Factory Functions** - `createMockWorkflow()` helpers that can swap to real adapters

**Stakeholders**: Frontend team, Plan 010 team

---

### ADR-011-03: Human Input Component Architecture

**Decision Drivers**:
- Four question types with different UI needs
- Potential for additional types in future
- Reusability across different contexts

**Candidate Alternatives**:
- A: **Single QuestionInput Component** - Switch on `type` prop internally
- B: **Separate Components** - `SingleChoiceInput`, `MultiChoiceInput`, etc.
- C: **Render Prop Pattern** - `QuestionInput` accepts custom renderers per type

**Stakeholders**: UI/UX, Frontend team

---

## External Research (Completed)

**Incorporated Files**:
- `external-research/react-flow-vertical-layouts.md` - Comprehensive React Flow v12 vertical layout guide
- `external-research/blocking-input-ux-patterns.md` - CI/CD approval gate UX patterns from GitHub Actions, CircleCI, GitLab CI, Argo

### Key Findings: Vertical Layouts

1. **Handle Positioning**: Use `Position.Top` for target handles, `Position.Bottom` for source handles
2. **Dagre Integration**: Use `rankdir: 'TB'` for top-to-bottom layout; offset positions by half node dimensions
3. **Edge Type**: `smoothstep` provides best clarity for vertical layouts (avoids bezier overlap issues)
4. **Performance**: Wrap custom nodes in `React.memo`, memoize `nodeTypes` object outside component
5. **Node Dimensions**: React Flow v12 uses `node.measured.width/height` - hardcode or measure before layout

### Key Findings: Blocking Input UX

1. **Visual Indicators**: Yellow/orange status + pause icon + "Waiting for Input" label (GitHub Actions pattern)
2. **Modal Dialogs**: Use for input collection with progressive disclosure for complexity (Argo pattern)
3. **Input Types**: Dropdowns for single-choice, checkboxes for multi-choice, text input with format hints
4. **Confirmation Pattern**: Type-to-confirm for critical/destructive actions (MailChimp pattern)
5. **Timeout Display**: Show deadline timestamp or countdown only when <15% time remaining
6. **Accessibility**: Never disable submit buttons; always-accessible with error messaging on submit
7. **Mobile**: Full-screen dialogs, 44×44px minimum touch targets, push notifications with quick actions

### Applied To

| Spec Section | External Research Applied |
|--------------|---------------------------|
| ADR-011-01 (Vertical Layout) | Dagre TB config, Handle positioning, smoothstep edges |
| ADR-011-03 (QuestionInput) | Modal dialog pattern, input type selection, accessibility |
| AC-13 to AC-19 (Human Input) | Visual blocked state, input form patterns |
| Status Color System | Industry-standard yellow/orange for waiting states |

---

## Visual Summary

### View Hierarchy

```
Workflows List (VR-01)
    └── Single Workflow (VR-02)
            ├── Phases (template view)
            ├── Checkpoints (VR-08)
            └── Runs List (VR-03)
                    └── Single Run (VR-04)
                            ├── Phase Flow (vertical)
                            ├── Phase Detail (VR-05)
                            └── Question Input (VR-06)
```

### Status Color System

| Status | Color | Use Case |
|--------|-------|----------|
| pending | Gray (#6B7280) | Not started |
| ready | Yellow (#F59E0B) | Inputs satisfied |
| active | Blue (#3B82F6) | Currently executing |
| blocked | Orange (#F97316) | Waiting for input |
| complete | Green (#10B981) | Successfully finished |
| failed | Red (#EF4444) | Execution failed |

---

## Testing Strategy

**Approach**: Lightweight
**Rationale**: Mockup for rapid design iteration; visual validation is primary goal
**Focus Areas**: Core component rendering, fixture data loading
**Excluded**: Comprehensive unit tests, SSE integration tests, edge cases
**Mock Usage**: Fixture-based (all data from fixtures, no backend mocking needed)

---

## Documentation Strategy

**Location**: None (internal mockup)
**Rationale**: Design exploration; patterns will be documented when productionized
**Target Audience**: Development team validating UX concepts
**Maintenance**: N/A for mockup phase

---

## Clarifications

### Session 2026-01-26

**Q1: Workflow Mode**
- **Answer**: A (Simple)
- **Rationale**: Mockup for rapid UI iteration; single-phase implementation path

**Q2: Testing Strategy**
- **Answer**: C (Lightweight)
- **Rationale**: User specified "no TDD" - mockup validation doesn't require comprehensive tests

**Q3: Documentation Strategy**
- **Answer**: D (None)
- **Rationale**: Internal mockup for design exploration; production docs come later

---

## Clarification Summary

| Question | Answer | Impact |
|----------|--------|--------|
| Q1: Mode | Simple | Single-phase plan, optional gates |
| Q2: Testing | Lightweight | Core rendering validation only |
| Q3: Docs | None | No new documentation for mockup |

**All open questions from spec resolved via Simple mode defaults:**
- Auto-layout vs Manual: Manual (fixtures define positions)
- Checkpoint interaction: Deferred (view-only mockup)
- Question persistence: Session state (ephemeral)
- Error states: Include basic failed status display
- Phase timing: Show started timestamp (simpler)

---

## Next Steps

1. ~~Run `/plan-2-clarify` to resolve open questions~~ ✅
2. Optionally run `/deepresearch` for vertical layout and input UX patterns
3. Run `/plan-3-architect` to generate phased implementation plan
