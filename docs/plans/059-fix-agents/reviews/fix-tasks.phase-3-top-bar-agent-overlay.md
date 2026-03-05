# Fix Tasks: Phase 3: Top Bar + Agent Overlay

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Restore live recent-agent status updates
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/hooks/useRecentAgents.ts  
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/attention-flash.tsx
- **Issue**: `useRecentAgents` is snapshot-only (`subscribeToSSE: false`) and does not merge work-unit-state live status; attention/chip urgency can go stale.
- **Fix**: Re-enable live updates (SSE or equivalent polling strategy with explicit rationale) and merge `work-unit-state` status/intent into recent-agent rows.
- **Patch hint**:
  ```diff
  - const { agents: rawAgents, isLoading } = useAgentManager({ workspace, subscribeToSSE: false });
  + const { agents: rawAgents, isLoading } = useAgentManager({ workspace, subscribeToSSE: true });
  + // merge work-unit-state:{id}:status/intent into mapped recent agents
  ```

### FT-002: Implement workflow node → overlay open path (AC-24)
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx  
  - Workflow canvas/container file that builds `WorkflowNodeCard` props
- **Issue**: `onAgentClick` is declared but unused; no `agentSessionId` to `openAgent(sessionId)` execution path exists.
- **Fix**: From workflow container, detect `agentSessionId` and pass `onAgentClick`; in card click handling invoke `onAgentClick` for agent nodes.
- **Patch hint**:
  ```diff
  // card click handler
  - onClick={onSelect}
  + onClick={() => {
  +   if (onAgentClick) {
  +     onAgentClick();
  +     return;
  +   }
  +   onSelect?.();
  + }}
  ```

### FT-003: Complete Hybrid testing gate and execution evidence
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-3-top-bar-agent-overlay/execution.log.md  
  - /Users/jordanknight/substrate/059-fix-agents/test/** (targeted tests for overlay/chip/workflow trigger/attention)
- **Issue**: Execution log contains no actionable evidence; no targeted phase tests were added.
- **Fix**: Add/execute targeted tests and record command outputs and observed results per AC-18..AC-28.
- **Patch hint**:
  ```diff
  + ## T00X: Workflow node overlay integration
  + **Status**: Complete
  + **Commands**:
  + - pnpm vitest test/.../workflow-node-overlay.test.ts
  + **Observed**:
  + - Pass: node with agentSessionId opens overlay without navigation
  ```

### FT-004: Update Domain Manifest + agents domain docs + domain map
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md  
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md  
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md
- **Issue**: Changed files/contracts are not fully reflected in domain governance artifacts.
- **Fix**: Add missing file mappings, update Phase 3 history/contracts/concepts/composition, and refresh domain-map node/edge labels to current implementation state.
- **Patch hint**:
  ```diff
  + | `apps/web/src/components/agents/workspace-agent-chrome.tsx` | agents | internal | Workspace-level chrome composition for chip bar + overlay |
  + | Plan 059 Phase 3 | Top bar + overlay contracts implemented (...) | 2026-03-02 |
  - workflowUI -->|"useAgentOverlay<br/>(future)"| agents
  + workflowUI -->|"useAgentOverlay<br/>(implemented)"| agents
  ```

### FT-005: Remove/realign reinvention in workspace composition
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/workspace-agent-chrome.tsx  
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/dashboard-shell.tsx  
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx
- **Issue**: New composition path duplicates panel-layout shell concerns instead of using slot contract.
- **Fix**: Route top-bar/overlay composition through documented panel-layout slot contract (or update architecture docs if intentional divergence).
- **Patch hint**:
  ```diff
  - <WorkspaceAgentChrome ...>{children}</WorkspaceAgentChrome>
  + <DashboardShell topBar={<AgentChipBar ... />}>
  +   {children}
  + </DashboardShell>
  ```

## Medium / Low Fixes

### FT-006: Match overlay dimensions to AC-21
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/agent-overlay-panel.tsx
- **Issue**: Overlay uses full-height side drawer instead of 480px × 70vh panel.
- **Fix**: Position as bottom-right fixed panel with 70vh height and width cap.
- **Patch hint**:
  ```diff
  - className="fixed top-0 right-0 h-full ..."
  + className="fixed bottom-4 right-4 ..."
  + style={{ width: 'min(480px, 90vw)', height: '70vh', zIndex: Z_INDEX.OVERLAY }}
  ```

### FT-007: Implement toast escalation and correct waiting filter
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/059-fix-agents/apps/web/src/components/agents/attention-flash.tsx
- **Issue**: AC-27 toast layer missing; waiting logic includes `stopped`.
- **Fix**: Emit toast on new waiting-input agents (overlay closed) and filter waiting list to true question state only.
- **Patch hint**:
  ```diff
  - (a.status as string) === 'waiting_input' || (a.status as string) === 'stopped'
  + (a.status as string) === 'waiting_input'
  + if (newWaiting.length > 0 && !activeAgentId) toast(...)
  ```

### FT-008: Conform hook filenames to kebab-case doctrine
- **Severity**: MEDIUM
- **File(s)**:  
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/hooks/useAgentOverlay.tsx  
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/hooks/useRecentAgents.ts
- **Issue**: New file names violate documented naming rule.
- **Fix**: Rename to kebab-case and update all imports.
- **Patch hint**:
  ```diff
  - src/hooks/useAgentOverlay.tsx
  + src/hooks/use-agent-overlay.tsx
  - src/hooks/useRecentAgents.ts
  + src/hooks/use-recent-agents.ts
  ```

### FT-009: Align z-index contract constants
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/agents/constants.ts
- **Issue**: `TOAST` constant does not match documented phase hierarchy.
- **Fix**: Update constant to documented level and verify no regression in toast stack ordering.
- **Patch hint**:
  ```diff
  - TOAST: 10,
  + TOAST: 70,
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Domain artifacts updated and synchronized with implementation
- [ ] Targeted tests added/passing with evidence logged
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
