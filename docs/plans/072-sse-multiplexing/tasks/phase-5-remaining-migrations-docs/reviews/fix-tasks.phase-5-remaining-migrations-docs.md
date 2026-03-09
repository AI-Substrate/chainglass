# Fix Tasks: Phase 5: Remaining Migrations + Documentation

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Repair multiplexed hook typings
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts
  - /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/058-workunit-editor/hooks/use-workunit-catalog-changes.ts
- **Issue**: Both migrated hooks pass payload-only interfaces to `useChannelEvents<T extends MultiplexedSSEMessage>`, but those interfaces omit the required `channel` field and now fail focused app typecheck with TS2344.
- **Fix**: Make each payload type extend `MultiplexedSSEMessage` (or consistently relax the hook contract if that is the intended API), then rerun `pnpm exec tsc -p apps/web/tsconfig.json --noEmit`.
- **Patch hint**:
  ```diff
  - interface WorkflowSSEMessage {
  + import type { MultiplexedSSEMessage } from '@/lib/sse';
  +
  + type WorkflowSSEMessage = MultiplexedSSEMessage & {
      graphSlug: string;
      changeType: 'structure' | 'status';
- }
  + };
  
  - interface UnitCatalogSSEMessage {
  + type UnitCatalogSSEMessage = MultiplexedSSEMessage & {
      unitSlug?: string;
      workspaceSlug?: string;
- }
  + };
  ```

### FT-002: Re-scope or restore deferred legacy cleanup
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/067-question-popper/apps/web/src/hooks/useSSE.ts
  - /Users/jordanknight/substrate/067-question-popper/apps/web/src/components/kanban/kanban-content.tsx
  - /Users/jordanknight/substrate/067-question-popper/apps/web/src/components/kanban/index.ts
  - /Users/jordanknight/substrate/067-question-popper/test/unit/web/hooks/use-sse.test.tsx
  - /Users/jordanknight/substrate/067-question-popper/test/integration/web/kanban-page.test.tsx
  - /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/tasks.md
- **Issue**: Phase 5 explicitly deferred removing `useSSE` and migrating the dynamic-channel kanban path, but the diff deletes those files and their tests anyway while the dossier still lists them as non-goals.
- **Fix**: Either restore the legacy hook/component/tests for this phase, or move that cleanup into a separately approved plan/phase and update the dossier so scope, non-goals, and delivered code agree.
- **Patch hint**:
  ```diff
  - ❌ Remove `useSSE` hook (still needed by kanban + agents)
  - ❌ Migrate `kanban-content.tsx` (dynamic channel from props — requires architecture change)
  + ❌ Remove `useSSE` hook in this phase
  + ❌ Migrate `kanban-content.tsx` in this phase
  + ✅ Keep legacy dynamic-channel consumers until the follow-up plan lands
  
  + export { KanbanContent } from './kanban-content';
  ```

### FT-003: Correct published SSE guidance to match the shipped boundary
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/067-question-popper/CLAUDE.md
  - /Users/jordanknight/substrate/067-question-popper/docs/how/sse-integration.md
- **Issue**: Both documents currently say browser SSE now uses `/api/events/mux` exclusively, but direct browser `EventSource` consumers still exist (`useAgentManager`, `useAgentInstance`, `useServerSession`, `useWorkspaceSSE`).
- **Fix**: Reword the docs so they describe multiplexing as the default for migrated workspace channel consumers, and explicitly list the remaining direct-EventSource exceptions until those migrations are complete.
- **Patch hint**:
  ```diff
  - All SSE consumers share a single multiplexed EventSource connection per browser tab.
  - These routes are NOT used by the browser — the browser uses `/api/events/mux` exclusively.
  + Migrated workspace channel consumers share a multiplexed EventSource connection per browser tab.
  + Some browser features still use direct EventSource connections (`useAgentManager`, `useAgentInstance`, `useServerSession`, `useWorkspaceSSE`) and remain outside Plan 072 Phase 5.
  ```

### FT-004: Add durable execution evidence, including AC-28
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/execution.log.md
  - /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/tasks.md
- **Issue**: The phase has no `execution.log.md`, so there is no durable record of `pnpm test`, build/typecheck status, or the required AC-28 three-tab/no-lockup validation.
- **Fix**: Create `execution.log.md` with the exact commands run, exit codes, timestamps, and manual/browser observations. Include explicit AC-28 evidence (for example, 3 workspace tabs open, one mux connection per tab, no stalled navigation/REST).
- **Patch hint**:
  ```diff
  + # Execution Log
  + 
  + ## Validation
  + - `pnpm test` → exit 0
  + - `just typecheck` → exit 0
  + - `just build` → exit 0
  + - `just lint` → exit 1 (record exact repo-baseline diagnostics and whether they are phase-related)
  + 
  + ## Manual AC-28 Verification
  + - Opened 3 workspace tabs on `/api/events/mux`
  + - Observed one mux connection per tab in DevTools
  + - Confirmed navigation and REST requests remained responsive
  ```

## Medium / Low Fixes

### FT-005: Avoid subscribing when workflow SSE is disabled
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts
- **Issue**: `enabled=false` still creates a live `'workflows'` subscription and only clears messages after they arrive.
- **Fix**: Gate the subscription itself when disabled, or add an enabled/auto-connect option to `useChannelEvents` and use it here.
- **Patch hint**:
  ```diff
  - const { messages, isConnected, clearMessages } = useChannelEvents<WorkflowSSEMessage>('workflows', {
  -   maxMessages: 50,
  - });
  + const { messages, isConnected, clearMessages } = useChannelEvents<WorkflowSSEMessage>('workflows', {
  +   maxMessages: 50,
  +   enabled,
  + });
  ```

### FT-006: Update domain docs and domain map for Phase 5
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/067-question-popper/docs/domains/workflow-ui/domain.md
  - /Users/jordanknight/substrate/067-question-popper/docs/domains/058-workunit-editor/domain.md
  - /Users/jordanknight/substrate/067-question-popper/docs/domains/_platform/events/domain.md
  - /Users/jordanknight/substrate/067-question-popper/docs/domains/domain-map.md
- **Issue**: The source migration landed, but the domain docs and domain map still describe legacy `useSSE` relationships and omit the new `unit-catalog` dependency.
- **Fix**: Update each domain artifact to match the shipped Phase 5 behavior, including history rows and the optional `type` wire-format change.
- **Patch hint**:
  ```diff
  - | `_platform/events` | `useSSE`, SSE infrastructure | Live editor updates |
  + | `_platform/events` | `useChannelEvents('workflows')`, multiplexed SSE infrastructure | Live editor updates |
  
  + | `_platform/events` | unit-catalog notifications via `useChannelEvents('unit-catalog')` | Work unit catalog change awareness |
  
  - | `MultiplexedSSEMessage` | ... `{channel: string, type: string, ...}` |
  + | `MultiplexedSSEMessage` | ... `{channel: string, type?: string, ...}` |
  ```

### FT-007: Regenerate the phase diff after scope cleanup
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/docs/plans/072-sse-multiplexing/tasks/phase-5-remaining-migrations-docs/reviews/_computed.diff
- **Issue**: The current review artifact includes unrelated generated files, root research docs, and prior-phase review files, which makes the phase review non-deterministic and hard to audit.
- **Fix**: After trimming the phase changes, regenerate `_computed.diff` from the real phase file set and verify that it contains only the intended Phase 5 edits.
- **Patch hint**:
  ```diff
  - A DOCUMENTATION_INDEX.md
  - A packages/positional-graph/src/.../*.d.ts.map
  - A docs/plans/072-sse-multiplexing/tasks/phase-4-.../reviews/...
  + M apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts
  + M apps/web/src/features/058-workunit-editor/hooks/use-workunit-catalog-changes.ts
  + M apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx
  + M CLAUDE.md
  + M docs/how/sse-integration.md
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
