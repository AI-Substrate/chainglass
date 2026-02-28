# Fix Tasks: Phase 1: Fix Agent Foundation

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Propagate copilot-cli creation fields end-to-end
- **Severity**: HIGH
- **File(s)**: 
  - /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/features/019-agent-manager-refactor/agent-manager.interface.ts
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/route.ts
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts
- **Issue**: `sessionId` / `tmuxWindow` / `tmuxPane` are posted by UI but dropped in server create flow.
- **Fix**: Extend `CreateAgentParams`, validate `sessionId` for `copilot-cli`, and pass these values into runtime adapter configuration.
- **Patch hint**:
  ```diff
  - export interface CreateAgentParams { name: string; type: AgentType; workspace: string; }
  + export interface CreateAgentParams {
  +   name: string;
  +   type: AgentType;
  +   workspace: string;
  +   sessionId?: string;
  +   tmuxWindow?: string;
  +   tmuxPane?: string;
  + }

  - const agent = agentManager.createAgent({ name: body.name, type: body.type, workspace: body.workspace });
  + const agent = agentManager.createAgent({
  +   name: body.name,
  +   type: body.type,
  +   workspace: body.workspace,
  +   sessionId: body.sessionId,
  +   tmuxWindow: body.tmuxWindow,
  +   tmuxPane: body.tmuxPane,
  + });
  ```

### FT-002: Fix CopilotCLIAdapter DI wiring for Enter/tmux target
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts
- **Issue**: Adapter registration passes only `sendKeys`; default `sendEnter` path is not equivalent to tmux Enter key handling.
- **Fix**: Add explicit `sendEnter` function and pass deterministic tmux target/session defaults (or route-provided values).
- **Patch hint**:
  ```diff
  if (agentType === 'copilot-cli') {
+   const sendKeys = (target, text) => execSync(`tmux send-keys -t ${target} ${JSON.stringify(text)}`, { stdio: 'ignore' });
+   const sendEnter = (target) => execSync(`tmux send-keys -t ${target} Enter`, { stdio: 'ignore' });
    return new CopilotCLIAdapter({
-     sendKeys: (target, text) => { ... },
+     sendKeys,
+     sendEnter,
+     tmuxTarget: targetFromConfig,
+     defaultSessionId: sessionIdFromCreateParams,
    });
  }
  ```

### FT-003: Align SSE lifecycle contract with consumers
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/route.ts
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/[id]/route.ts
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/019-agent-manager-refactor/useAgentManager.ts
  - /Users/jordanknight/substrate/059-fix-agents/packages/shared/src/features/019-agent-manager-refactor/agent-notifier.interface.ts
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts
- **Issue**: Hooks subscribe to `agent_created`/`agent_terminated`, but create/delete paths do not emit these events.
- **Fix**: Emit explicit lifecycle events on create/delete (or remove those subscriptions and standardize on status-only events with docs/spec updates).
- **Patch hint**:
  ```diff
  + notifier.broadcastCreated({ agentId: agent.id, name: agent.name, type: agent.type, workspace: agent.workspace });
  ...
  + notifier.broadcastTerminated({ agentId: id });
  
  - const listEventTypes = ['agent_status', 'agent_intent', 'agent_created', 'agent_terminated'];
  + const listEventTypes = ['agent_status', 'agent_intent', 'agent_created', 'agent_terminated']; // keep only if server emits both
  ```

### FT-004: Add execution evidence log for Phase 1
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-1-fix-agent-foundation/execution.log.md
- **Issue**: Required phase evidence file is missing.
- **Fix**: Add timestamped command/output logs for validation steps and manual checks per AC.
- **Patch hint**:
  ```diff
  + # Execution Log — Phase 1: Fix Agent Foundation
  +
  + ## Verification
  + - [timestamp] just test (output...)
  + - [timestamp] just typecheck (output...)
  + - [timestamp] just lint (output...)
  + - [timestamp] just build (output...)
  + - [timestamp] Manual: create/list/detail/restart checks (observed outcomes...)
  ```

### FT-005: Add targeted regression tests (T008)
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/test/unit/web/agents/api-serialization.test.ts
  - /Users/jordanknight/substrate/059-fix-agents/test/unit/web/agents/sse-broadcast.test.ts
  - /Users/jordanknight/substrate/059-fix-agents/test/unit/web/agents/di-factory.test.ts
- **Issue**: Required tests were not added.
- **Fix**: Add tests for GET shape, lifecycle SSE broadcast behavior, and all adapter factory types.
- **Patch hint**:
  ```diff
  + it('GET /api/agents returns fields expected by useAgentManager', ...)
  + it('POST /api/agents emits lifecycle SSE event(s)', ...)
  + it('DI factory resolves claude-code, copilot, copilot-cli', ...)
  ```

### FT-006: Fix domain-map dependency direction violation
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/domain-map.md
- **Issue**: `_platform/positional-graph` (infrastructure) depends on `agents` (business).
- **Fix**: Move consumed contract to infrastructure/shared boundary or adjust architecture to keep direction business → infrastructure.
- **Patch hint**:
  ```diff
  - posGraph -->|"IAgentManagerService<br/>IAgentInstance<br/>(orchestration)"| agents
  + %% Replace with infra/shared orchestration port to avoid infra->business dependency
  + posGraph -->|"IAgentExecutionPort"| orchestrationContracts
  + agents -->|"implements IAgentExecutionPort"| orchestrationContracts
  ```

### FT-007: Bring plan/spec/tasks into doctrine compliance
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-spec.md
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/tasks/phase-1-fix-agent-foundation/tasks.md
- **Issue**: TDD deviation, missing CS-4 rollback plan, and incomplete required merge checks.
- **Fix**: Remove TDD deviation, add rollback section, and require full `just` gate suite in tasks.
- **Patch hint**:
  ```diff
  - ### Constitution Deviation: P3 TDD
  - ...
  + ### TDD Execution Notes
  + All implementation tasks use RED-GREEN-REFACTOR; manual checks supplement but do not replace tests.

  + ## Rollback Plan
  + - Trigger: failing deploy checks or production regressions
  + - Steps: revert phase commits, restore previous config/events wiring, validate smoke checks

  - `pnpm test` passes
  + `just test`, `just typecheck`, `just lint`, `just build` pass
  ```

## Medium / Low Fixes

### FT-008: Complete Domain Manifest coverage
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md
- **Issue**: Not all changed files are mapped in Domain Manifest.
- **Fix**: Add missing entries (or explicitly document exclusions for planning artifacts and generated files).

### FT-009: Clarify anti-reinvention boundary in work-unit-state domain doc
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/work-unit-state/domain.md
- **Issue**: Overlap risk with existing state and question systems is not mitigated by explicit extension strategy.
- **Fix**: Add explicit reuse/bridge contracts and boundaries to avoid parallel implementations.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Add/update execution.log evidence and test outputs
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
