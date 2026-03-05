# Fix Agents — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-28
**Spec**: [fix-agents-spec.md](./fix-agents-spec.md)
**Status**: COMPLETE
**Mode**: Full

## Summary

The web agent system is structurally sound (3 adapters, DI container, SSE transport, 45+ test files) but has critical data flow gaps: API serialization omits data hooks expect, SSE broadcasting isn't wired into agent creation, and the CopilotCLI adapter isn't registered in the web DI factory. This plan first fixes the broken foundation (Phase A), then builds a centralized WorkUnit State system for cross-component visibility (Phase B), adds a persistent top bar with overlay for seamless agent connect/disconnect (Phase C), and wires cross-worktree alerts into the left menu (Phase D). Four phases, two new business domains (`work-unit-state`, `agents`), touching 5 existing domains.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| agents | **NEW** | **create** | Formalize agent boundary: adapters, manager, session lifecycle, state publishing, overlay UI |
| work-unit-state | **NEW** | **create** | Centralized status + question registry for all work unit types |
| _platform/state | existing | **modify** | Extend publish() with source metadata, add ServerEventRoute bridge, extend GlobalStateConnector |
| _platform/events | existing | **modify** | Add WorkUnitState channel to WorkspaceDomain, SSE route contracts |
| _platform/panel-layout | existing | **modify** | Add agent top bar slot in DashboardShell layout |
| workflow-ui | existing | **modify** | Add agent session overlay trigger to workflow nodes |
| _platform/positional-graph | existing | **consume** | Read node→agent session mapping from orchestrator |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/app/api/agents/route.ts` | agents | internal | Fix serialization + wire SSE broadcast |
| `apps/web/app/api/agents/[id]/route.ts` | agents | internal | Verify event inclusion in GET response |
| `apps/web/app/api/agents/[id]/run/route.ts` | agents | internal | Verify 409 guard + NDJSON storage |
| `apps/web/src/lib/di-container.ts` | agents | cross-domain | Add copilot-cli adapter factory case |
| `apps/web/src/features/019-agent-manager-refactor/useAgentManager.ts` | agents | internal | Fix type alignment with API response |
| `apps/web/src/features/019-agent-manager-refactor/useAgentInstance.ts` | agents | internal | Verify/fix SSE subscription wiring |
| `apps/web/src/components/agents/create-session-form.tsx` | agents | internal | Default to copilot, add copilot-cli fields |
| `apps/web/app/(dashboard)/workspaces/[slug]/agents/page.tsx` | agents | internal | Verify agent list rendering |
| `apps/web/app/(dashboard)/workspaces/[slug]/agents/[id]/page.tsx` | agents | internal | Verify agent detail/chat rendering |
| `packages/shared/src/interfaces/work-unit-state.interface.ts` | work-unit-state | contract | IWorkUnitStateService interface |
| `packages/shared/src/work-unit-state/types.ts` | work-unit-state | contract | WorkUnitEntry, WorkUnitQuestion, QuestionAnswer types |
| `packages/shared/src/work-unit-state/index.ts` | work-unit-state | contract | Barrel exports |
| `packages/shared/src/fakes/fake-work-unit-state.ts` | work-unit-state | contract | FakeWorkUnitStateService test double |
| `apps/web/src/lib/work-unit-state/work-unit-state.service.ts` | work-unit-state | internal | Real implementation with persistence + state publishing |
| `apps/web/src/lib/work-unit-state/index.ts` | work-unit-state | internal | Barrel exports |
| `apps/web/src/lib/state/work-unit-state-route.ts` | work-unit-state | internal | SSE → GlobalStateSystem route descriptor |
| `test/contracts/work-unit-state.contract.ts` | work-unit-state | contract | Contract test factory |
| `test/contracts/work-unit-state.contract.test.ts` | work-unit-state | contract | Contract test runner |
| `test/unit/web/work-unit-state/agent-work-unit-bridge.test.ts` | agents | internal | Bridge unit tests |
| `apps/web/src/features/059-fix-agents/agent-work-unit-bridge.ts` | agents | internal | Publishes agent status/questions to WorkUnitStateService |
| `apps/web/src/components/agents/agent-chip-bar.tsx` | agents | internal | Persistent top bar with draggable chips |
| `apps/web/src/components/agents/agent-chip.tsx` | agents | internal | Individual agent chip with status indicator |
| `apps/web/src/components/agents/agent-overlay-panel.tsx` | agents | internal | Full-height overlay with chat UI |
| `apps/web/src/components/agents/workspace-agent-chrome.tsx` | agents | internal | Workspace wrapper: chip bar + overlay + attention |
| `apps/web/src/components/agents/attention-flash.tsx` | agents | internal | 3-layer attention: toast + screen flash + ❓ badge |
| `apps/web/src/hooks/use-agent-overlay.tsx` | agents | contract | { openAgent, closeAgent, activeAgentId } — callable from anywhere |
| `apps/web/src/hooks/use-recent-agents.ts` | agents | internal | Recency-based agent list with priority sort |
| `apps/web/src/lib/agents/constants.ts` | agents | internal | Z-index hierarchy + localStorage helpers |
| `apps/web/src/components/dashboard-shell.tsx` | _platform/panel-layout | cross-domain | Add top bar slot above main content |
| `apps/web/src/lib/state/state-connector.tsx` | _platform/state | cross-domain | Register work-unit-state + agent domains |
| `apps/web/src/components/agents/attention-flash.tsx` | agents | internal | Screen border flash + ❓ badge for questions |
| `apps/web/src/components/workspaces/workspace-nav.tsx` | _platform/panel-layout | cross-domain | Cross-worktree activity badges (composition point) |
| `apps/web/app/api/worktree-activity/route.ts` | work-unit-state | internal | Cross-worktree activity API endpoint |
| `apps/web/src/hooks/use-worktree-activity.ts` | agents | internal | Cross-worktree activity polling hook |
| `apps/web/src/components/workspaces/activity-dot.tsx` | _platform/panel-layout | internal | Activity badge dot component |
| `test/unit/web/components/workspace-nav-activity.test.tsx` | test | internal | AC-29/30/31 badge tests |
| `docs/domains/work-unit-state/domain.md` | work-unit-state | contract | Domain definition document |
| `docs/domains/agents/domain.md` | agents | contract | Domain definition document |
| `docs/domains/registry.md` | — | cross-domain | Register 2 new domains |
| `docs/domains/domain-map.md` | — | cross-domain | Add agents + work-unit-state nodes |
| `docs/how/work-unit-state-integration.md` | work-unit-state | contract | Integration guide |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Agent POST route never calls SSE broadcast after creation — `agent_created` event never fires (confirmed in source) | Wire AgentNotifierService call in POST handler (Phase A) |
| 02 | Critical | API POST validation hardcodes `'claude-code' \| 'copilot'` — rejects `copilot-cli`. DI factory also missing case. | Add copilot-cli to both validation + factory (Phase A) |
| 03 | High | API GET serialization may omit fields hooks expect — type mismatch between route response and useAgentManager expectations | Audit response shape vs hook type, align (Phase A) |
| 04 | High | DI singleton bootstrap ordering — adding WorkUnitStateService as second singleton risks initialization order issues | Use shared initialization guard; document dependency order (Phase B) |
| 05 | High | State system list cache invalidation iterates ALL patterns per publish — 200 paths with broad patterns could spike CPU | Keep agent streaming events (text_delta) out of state system; only publish status-level changes (Phase B) |
| 06 | High | All UI overlays use z-50 — no layering precedence defined. Agent overlay panel needs dedicated z-index layer. | Define z-index hierarchy constant; overlay at z-45, below modals (Phase C) |
| 07 | High | No localStorage pattern exists — chip order persistence needs namespaced keys, error handling, version migration | Create storage-keys.ts with namespaced conventions (Phase C) |
| 08 | Low | IWorkUnitService already exists in positional-graph (workflow orchestration) — name similarity with IWorkUnitStateService could confuse | Distinct naming already in spec; add clarifying JSDoc to IWorkUnitStateService (Phase B) |

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| P1: Clean Architecture | ✅ Compliant | Interfaces in shared, adapters implement, DI wiring |
| P2: Interface-First | ✅ Compliant | IWorkUnitStateService defined before implementation |
| P3: TDD | ⚠️ Deviation | Hybrid testing — TDD for Phase B contracts, lightweight for A/C/D |
| P4: Fakes Over Mocks | ✅ Compliant | FakeWorkUnitStateService planned; no mocking libraries |
| P5: Fast Feedback | ✅ Compliant | Contract tests < 2s; UI tests lightweight |
| P6: Developer Experience | ✅ Compliant | No new setup steps; DI auto-wires new services |
| P7: Shared by Default | ✅ Compliant | Interfaces + types in packages/shared |

### Constitution Deviation: P3 TDD

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| P3: TDD for ALL work | Phase A fixes existing wiring bugs (serialization, SSE broadcast) — these are better validated by running the app end-to-end than unit tests. Phase C/D are UI components where TDD adds friction without proportional value. | Full TDD for all 4 phases — rejected because Phase A bugs are integration wiring, not logic, and Phase C/D chips/overlay are visual. | Phase B (contract-heavy logic) gets full TDD. Phase A validates via existing test suite + manual verification. Phase C/D gets targeted hook tests. |

---

## Phases

### Phase A: Fix Agent Foundation

**Objective**: Make the existing agent system work — list, create, chat, and stream agents in the web UI.
**Domain**: agents (existing code, formalize boundary)
**Complexity**: CS-2
**Delivers**:
- Fixed GET /api/agents serialization aligned with hook expectations
- SSE `agent_created` broadcast wired into POST /api/agents
- CopilotCLI adapter registered in DI factory with `copilot-cli` type
- Default agent type changed to `copilot`
- Agent creation form supports copilot-cli with sessionId/tmux fields
- Agent list page renders agents
- Agent detail page renders chat with stored + streaming events
- `docs/domains/agents/domain.md` created, registered in registry + domain map

**Depends on**: None
**Key risks**: Singleton DI initialization order; type mismatches may be deeper than serialization.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| A.1 | Create `docs/domains/agents/domain.md` + register in registry.md + update domain-map.md | agents | Domain doc exists with § Purpose, § Boundary (Owns/Excludes), § Contracts (IAgentAdapter, IAgentInstance, useAgentOverlay hook, AgentWorkUnitBridge), § Concepts (AgentType, AgentInstanceStatus, session rehydration), § Composition; registry has new row; domain map has new node with edges to _platform/state, _platform/events, work-unit-state | Domain creation first |
| A.2 | Fix GET /api/agents serialization — audit response shape vs useAgentManager hook type, align | agents | GET returns data shape matching hook's expected type; agent list page renders | Per finding 03 |
| A.3 | Wire SSE broadcast into POST /api/agents — call AgentNotifierService after createAgent() | agents | POST triggers `agent_created` SSE event; useAgentManager hook receives it. SSE broadcast follows ADR-0010 three-layer pattern via ICentralEventNotifier | Per finding 01 |
| A.4 | Add `copilot-cli` to API POST validation + DI adapter factory | agents | POST accepts type `copilot-cli`; DI factory returns CopilotCLIAdapter | Per finding 02 |
| A.5 | Update create-session-form to default to `copilot`, add copilot-cli option with sessionId/tmux fields | agents | Form defaults to copilot; selecting copilot-cli shows sessionId, tmuxWindow, tmuxPane fields | AC-02, AC-03 |
| A.6 | Verify agent detail page renders chat — fix if needed (stored events + SSE streaming) | agents | Navigating to agent detail shows chat history; running agent streams events in real-time | AC-06, AC-07 |
| A.7 | Verify agent persistence across server restart | agents | Stop dev server, restart, navigate to agent — stored events visible | AC-08 |
| A.8 | Run existing agent test suite + add targeted regression tests for wiring fixes | agents | `pnpm test` passes for agent-related test files. Targeted tests added: (1) GET serialization returns all fields hooks expect, (2) POST triggers SSE broadcast, (3) DI factory resolves all 3 adapter types. Test files at `test/unit/web/agents/` | Quality gate |

#### Acceptance Criteria

- [x] AC-01: GET /api/agents returns data useAgentManager can consume — list page renders
- [x] AC-02: POST /api/agents creates with `copilot` default; `copilot-cli` and `claude-code` supported
- [x] AC-03: copilot-cli agent accepts sessionId, tmuxWindow, tmuxPane
- [x] AC-04: DI factory handles all three agent types
- [x] AC-05: SSE broadcasts agent_created, agent_status, agent_terminated
- [x] AC-06: Agent detail page renders chat history + streams new events
- [x] AC-07: POST /api/agents/[id]/run returns 409 if working, streams via SSE, stores NDJSON
- [x] AC-08: Sessions persist across server restarts

#### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Type mismatches deeper than surface serialization | Medium | Medium | Trace full data flow: API → hook → component |
| CopilotCLI adapter has unresolved dependencies in web context | Low | Medium | Adapter already in shared; verify imports compile |

---

### Phase B: WorkUnit State System

**Objective**: Create the centralized status + question registry and wire agents into it.
**Domain**: work-unit-state (NEW) + agents (bridge)
**Complexity**: CS-3
**Delivers**:
- `IWorkUnitStateService` interface in packages/shared
- `WorkUnitStateService` implementation with persistence + state path publishing
- `FakeWorkUnitStateService` test double with inspection methods
- Contract tests verifying real/fake parity
- `AgentWorkUnitBridge` that auto-registers agents and publishes status/questions
- `docs/domains/work-unit-state/domain.md` created, registered
- `docs/how/work-unit-state-integration.md` guide

**Depends on**: Phase A (agents must work before bridging)
**Key risks**: DI singleton ordering (Finding 04); state path volume (Finding 05); name confusion with IWorkUnitService (Finding 08).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| B.1 | Create `docs/domains/work-unit-state/domain.md` + register + update domain map | work-unit-state | Domain doc exists with § Purpose, § Boundary (Owns/Excludes), § Contracts (IWorkUnitStateService, WorkUnitEntry, WorkUnitQuestion, QuestionAnswer), § Concepts (work unit types, question lifecycle, tidy-up rules, state path schema), § Composition; registry updated; map shows node with edges to _platform/state (IStateService), _platform/events (ISSEBroadcaster). Cross-ref spec § New Domain Sketches (lines 58-67) | Domain creation first |
| B.2 | Define IWorkUnitStateService interface + types in packages/shared | work-unit-state | Interface exported from `@chainglass/shared`; types: WorkUnitEntry, WorkUnitQuestion, QuestionAnswer | AC-09; interface-first per P2 |
| B.3 | Create FakeWorkUnitStateService with inspection methods | work-unit-state | Fake implements IWorkUnitStateService; has getPublished(), getQuestions(), getAnswers() | AC-13; fakes before real per P2 |
| B.4 | Write contract test factory + runner | work-unit-state | Contract tests cover: register, unregister, updateStatus, askQuestion, answerQuestion, onAnswer, getUnit, getUnits, getQuestioned, tidyUp | AC-14; TDD red phase |
| B.5 | Implement WorkUnitStateService — persistence to JSON + GlobalStateSystem publishing | work-unit-state | Real implementation passes all contract tests; persists to `<worktree>/.chainglass/data/work-unit-state.json` per ADR-0008 Layer 2; publishes `work-unit:{id}:*` paths | AC-10; TDD green phase |
| B.6 | Implement tidyUp rules — 24h expiry, working/waiting never expire | work-unit-state | tidyUp() removes stale entries; working + questioned entries preserved regardless of age | AC-11, AC-12 |
| B.7 | Register WorkUnitStateService in DI container | work-unit-state | Container resolves IWorkUnitStateService; uses lazy initialization guard (closure-captured flag + factory function per ADR-0004 IMP-003). Singleton dependency order documented in di-container.ts: GlobalStateSystem → WorkUnitStateService → AgentWorkUnitBridge. Guard ensures idempotent initialization across HMR reloads | Per finding 04; ADR-0004 |
| B.8 | Create AgentWorkUnitBridge — auto-register agents + publish status/questions | agents | Bridge registers agents on create, publishes status changes, calls askQuestion() on first-class question events | AC-15, AC-16 |
| B.9 | Implement answer routing — answerQuestion() routes to registered callback | work-unit-state | Callback receives answer; question state cleared; state path `has-question` set to false | AC-17 |
| B.10 | Write docs/how/work-unit-state-integration.md | work-unit-state | Guide covers: registering a source, publishing status, asking questions, answering | Documentation deliverable |

#### Acceptance Criteria

- [x] AC-09: IWorkUnitStateService interface in packages/shared — status-only (register, unregister, updateStatus, getUnit, getUnits, getUnitBySourceRef, tidyUp)
- [x] AC-10: Implementation persists to JSON + emits via CentralEventNotifier → SSE → GlobalStateSystem
- [x] AC-11: tidyUp() removes entries > 24h that aren't working/waiting_input (called on startup + register)
- [x] AC-12: Working + waiting_input entries never expire
- [x] AC-13: FakeWorkUnitStateService with inspection methods (getRegistered, getRegisteredCount, reset)
- [x] AC-14: Contract tests pass for both real and fake (57 tests)
- [x] AC-15: AgentWorkUnitBridge auto-registers agents + subscribes to WorkflowEvents observers
- [x] AC-16: Observer-driven status: onQuestionAsked → waiting_input, onQuestionAnswered → working

#### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| DI singleton ordering with AgentManagerService | Medium | High | Shared initialization guard; explicit dependency documentation |
| State path volume causing cache invalidation overhead | Low | Medium | Only publish status-level changes; streaming events stay on SSE |
| Name confusion: IWorkUnitService vs IWorkUnitStateService | Low | Low | JSDoc clarification on IWorkUnitStateService |

---

### Phase C: Top Bar + Agent Overlay

**Objective**: Build the always-visible agent chip bar and seamless overlay for connect/disconnect.
**Domain**: agents (UI) + _platform/panel-layout (layout slot)
**Complexity**: CS-3
**Delivers**:
- Persistent agent chip bar above all page content in DashboardShell
- Agent chips with status indicators, type icons, intent snippets
- Drag-to-reorder with @dnd-kit, order persisted in localStorage
- Fixed-position overlay panel (480px × 70vh) with full chat UI
- `useAgentOverlay()` hook callable from anywhere
- Workflow node → agent overlay integration
- Session rehydration from stored NDJSON events
- Attention layers: chip pulse, toast, screen border flash

**Depends on**: Phase B (needs WorkUnitStateService for status data)
**Key risks**: Z-index conflicts (Finding 06); localStorage patterns (Finding 07); overlay performance with long chat histories.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| C.1 | Define z-index hierarchy constant + storage-keys.ts convention | agents | Z-index layers documented in constants file (backdrop:40, overlay:45, modal:50, tooltip:60, toast:70). Storage keys namespaced with version (e.g., `chainglass:agents:chip-order:v1`). Note: chip order uses localStorage (not filesystem) — this is a documented deviation from ADR-0008's filesystem-first pattern because chip order is machine-local UI preference, not collaborative data. Include QuotaExceededError handling. | Per findings 06, 07; ADR-0008 deviation |
| C.2 | Add top bar slot in DashboardShell — insert above `{children}` in `<main>` | _platform/panel-layout | DashboardShell renders optional top bar area; no visual change when empty | AC-18 |
| C.3 | Create useRecentAgents hook — recency-based list with 24h expiry, working never expire | agents | Hook returns recent agents for current worktree; auto-adds on activity; auto-removes stale | Workshop 001 recency model |
| C.4 | Create AgentChip component — type icon, name, status indicator, intent snippet | agents | Chip renders all 4 display states: working (🔵), idle (⚪), waiting_input (🟡), error (🔴) | AC-19 |
| C.5 | Create AgentChipBar — renders chips, drag-to-reorder with @dnd-kit, wraps on overflow | agents | Chips draggable; order persists in localStorage per worktree; chips wrap to multiple rows | AC-18, AC-20 |
| C.6 | Wire AgentChipBar into DashboardShell top bar slot | _platform/panel-layout | Chip bar visible on all dashboard pages; scoped to current worktree | AC-18 |
| C.7 | Create useAgentOverlay hook — { openAgent, closeAgent, activeAgentId } via context | agents | Hook callable from any component; opens/closes overlay without navigation | AC-23 |
| C.8 | Create AgentOverlayPanel — fixed-position (480px × 70vh), full chat UI, close via ✕/Escape/chip toggle | agents | Overlay renders chat history + streaming; closing keeps agent running; one overlay at a time | AC-21, AC-22 |
| C.9 | Wire chip click → openAgent; implement session rehydration from stored NDJSON | agents | Clicking chip opens overlay; old sessions load events from storage; invalid sessions show error | AC-25, AC-26 |
| C.10 | Wire workflow node → openAgent via agentSessionId property | workflow-ui | Clicking workflow node with agentSessionId opens agent overlay | AC-24 |
| C.11 | Implement attention layers — chip pulse, toast notification, screen border flash (30s cooldown) + ❓ badge | agents | waiting_input → chip pulses yellow + toast; question while not viewing → green border flash + badge | AC-27, AC-28 |
| C.12 | Register agent + work-unit-state domains in GlobalStateConnector | _platform/state | State connector mounts agent publishers; useGlobalState works for agent state paths | Integration wiring |

#### Acceptance Criteria

- [x] AC-18: Persistent chip bar above all page content, showing current worktree's recent agents
- [x] AC-19: Chips show type icon, name, status indicator, intent snippet
- [x] AC-20: Drag-to-reorder with @dnd-kit; order persists in localStorage
- [x] AC-21: Overlay panel 480px × 70vh with full chat UI
- [x] AC-22: Overlay doesn't navigate away; closing keeps agent running
- [x] AC-23: useAgentOverlay() provides { openAgent, closeAgent, activeAgentId }
- [ ] AC-24: Workflow node with agentSessionId → openAgent() *(deferred — needs orchestrator node→session mapping)*
- [x] AC-25: Old sessions rehydrate from stored NDJSON; resume if host has session
- [x] AC-26: Invalid session ID shows clear error
- [x] AC-27: waiting_input → chip pulse + toast
- [x] AC-28: Question while not viewing → green border flash (30s cooldown) + ❓ badge

#### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Z-index conflicts with existing modals/dialogs | Medium | Medium | Dedicated z-index constant; overlay at z-45, below z-50 modals |
| Overlay performance with thousands of stored events | Low | Medium | Virtualize chat list if > 500 events; lazy-load old events |
| @dnd-kit bundle size impact | Low | Low | Already in project dependencies |

---

### Phase D: Cross-Worktree & Left Menu

**Objective**: Wire cross-worktree activity awareness into the left sidebar menu.
**Domain**: agents + _platform/panel-layout
**Complexity**: CS-2
**Delivers**:
- Activity badges on left menu worktree entries (🟡 questions, 🔴 errors, 🔵 working)
- Badges only for OTHER worktrees (current worktree visible in top bar)
- Click badge → navigate to that worktree's agent page

**Depends on**: Phase C (needs top bar + overlay for contrast; needs WorkUnitStateService cross-worktree query)
**Key risks**: Cross-worktree data access — WorkUnitStateService is per-worktree; need a way to query other worktrees' state files.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| D.1 | API endpoint reads work-unit-state.json directly from worktree paths (no interface change per DYK-P4-01) | work-unit-state | GET /api/worktree-activity validates paths + returns agent-only summaries | Implemented: `apps/web/app/api/worktree-activity/route.ts` |
| D.2 | Create useWorktreeActivity hook — 30s polling, optional excludeWorktree | agents | Hook returns { activities, isLoading } with correct filtering | Implemented: `apps/web/src/hooks/use-worktree-activity.ts` |
| D.3 | ActivityDot component in both WorkspaceNav rendering modes | _platform/panel-layout | Badges render in inside-workspace + outside-workspace views | Implemented: `activity-dot.tsx`, `workspace-nav.tsx` |
| D.4 | Wire badge click → navigate to worktree's agent page | agents | Clicking badge navigates to `/workspaces/[slug]/agents?worktree=[path]` | Integrated into ActivityDot Link |
| D.5 | End-to-end verification — 9 targeted AC tests + existing test fixes | agents | 16/16 tests pass, 4860 total tests pass | Commit 9988887 |

#### Acceptance Criteria

- [x] AC-29: Left menu shows activity badges (🟡 questions, 🔴 errors, 🔵 working) — agent-only, both nav modes
- [x] AC-30: Badges for OTHER worktrees when one is selected; all when none selected
- [x] AC-31: Click badge → navigate to that worktree's agent page

#### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cross-worktree file access — reading other worktrees' data files | Medium | Medium | Enumerate worktrees from workspace config; handle missing/corrupt files gracefully |
| Polling frequency for cross-worktree state | Low | Low | Poll every 30s or use SSE cross-worktree channel |

---

## Fixes

| ID | Created | Summary | Domain(s) | Status | Source |
|----|---------|---------|-----------|--------|--------|
| FX001 | 2026-03-02 | Wire agent lifecycle into WorkUnitStateService — bridge.register/update/unregister calls | agents, work-unit-state | Complete | User: sidebar badges empty, no data in work-unit-state.json |
| FX002 | 2026-03-03 | Fix WorkUnitStateService path (process.cwd() → git worktree root) | work-unit-state | Complete | User: JSON file written to apps/web/ not worktree root |
| FX003 | 2026-03-03 | Show grey dot for idle agents in sidebar badges | agents | Complete | User: no badge visible when agents are idle |
| FX004 | 2026-03-04 | Extract and display agent intents from event stream | agents | Complete | User: chips and list show stale/empty intent |
| FX005 | 2026-03-04 | Agent top bar redesign — summary strip + expandable grid | agents | Complete | User: chip bar UX poor, needs aggregate view (Workshop 009) |
