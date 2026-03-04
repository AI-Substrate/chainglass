# Fix Tasks: FX001: Wire Agent Lifecycle into WorkUnitStateService

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Eliminate silent bridge-failure paths
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/route.ts
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/app/api/agents/[id]/route.ts
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts
  - /Users/jordanknight/substrate/059-fix-agents/apps/web/src/lib/di-container.ts
- **Issue**: Broad empty catches hide bridge failures and can silently reintroduce the original “no work-unit-state data” bug.
- **Fix**:
  1. Replace bare `catch {}` blocks with `catch (error)` and structured logging (include agentId/context).
  2. In create/delete route paths, ensure failure mode is explicit (either fail request or emit clearly visible operational error path).
  3. Keep notifier path resilient, but never silent.
- **Patch hint**:
  ```diff
  -    } catch {
  -      // Best-effort — don't fail agent creation if bridge is unavailable
  +    } catch (error) {
  +      console.warn('[POST /api/agents] Failed to register agent in work-unit-state', {
  +        agentId: agent.id,
  +        error,
  +      });
  +      throw error;
      }
  ```

### FT-002: Add direct verification for FX001 lifecycle wiring
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/test/integration/agent-api.integration.test.ts (or equivalent route-level suite)
  - /Users/jordanknight/substrate/059-fix-agents/test/integration/real-agent-web-routes.test.ts (if preferred for route wiring assertions)
- **Issue**: Current tests do not directly assert POST→register / DELETE→unregister / status mapping through bridge.
- **Fix**:
  1. Add targeted integration checks that exercise route handlers with container wiring.
  2. Assert work-unit-state entry appears on create, changes to `working`/`idle` on status transitions, and is removed on delete.
  3. Record command output in the fix execution log.
- **Patch hint**:
  ```diff
  + const workUnitState = container.resolve<IWorkUnitStateService>(
  +   POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_STATE_SERVICE
  + );
  + expect(workUnitState.getUnit(agentId)).toMatchObject({ id: agentId });
  +
  + notifier.broadcastStatus(agentId, 'working');
  + expect(workUnitState.getUnit(agentId)?.status).toBe('working');
  +
  + await deleteAgent(agentId);
  + expect(workUnitState.getUnit(agentId)).toBeUndefined();
  ```

## Medium / Low Fixes

### FT-003: Align FX001 dossier with implemented behavior
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fixes/FX001-wire-agent-workunit-registration.md
- **Issue**: `## Proposed Fix` still says status updates happen on both `broadcastStatus()` and `broadcastIntent()`, but implementation and DYK decision explicitly exclude intent wiring.
- **Fix**: Update Proposed Fix step 3 to reflect `broadcastStatus()` only.
- **Patch hint**:
  ```diff
  -3. **AgentNotifierService** → accept optional bridge, call `updateAgentStatus()` on `broadcastStatus()` and `broadcastIntent()` to capture mid-run status changes
  +3. **AgentNotifierService** → accept optional bridge, call `updateAgentStatus()` on `broadcastStatus()` only (intent remains SSE-only by design)
  ```

### FT-004: Restore domain traceability for FX001 scope
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/059-fix-agents/docs/domains/agents/domain.md
  - /Users/jordanknight/substrate/059-fix-agents/docs/plans/059-fix-agents/fix-agents-plan.md
- **Issue**: Domain history/manifest artifacts do not fully reflect FX001 changed file set and integration update.
- **Fix**:
  1. Add FX001 note in agents domain history/composition.
  2. Update plan manifest coverage or add explicit exclusion notes for fix artifacts.
- **Patch hint**:
  ```diff
  +| FX001 | Route/notifier lifecycle wiring to AgentWorkUnitBridge (register/update/unregister) | 2026-03-03 |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
