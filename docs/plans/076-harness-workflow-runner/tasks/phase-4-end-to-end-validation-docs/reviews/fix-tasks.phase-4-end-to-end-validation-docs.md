# Fix Tasks: Phase 4: End-to-End Validation + Docs

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Bind `workflow --server` to the actual harness app + worktree context
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts`
- **Issue**: The wrapper currently mixes `workspaceSlug = 'harness-test-workspace'` with `worktreePath = resolveProjectRoot()` and defaults the base URL to `http://localhost:3000`. Live harness validation proved this sends an unregistered host path to the app and misses the computed harness port, causing `400 Invalid workspace/worktree`.
- **Fix**: Add one helper that resolves `{ baseUrl, workspaceSlug, worktreePath }` from the harness port allocator and the seeded workspace conventions, then use it for both `workflow run --server` and `workflow status --server`. Keep `--server-url` as an override, not the only way the feature works.
- **Patch hint**:
  ```diff
  - const DEFAULT_SERVER_URL = 'http://localhost:3000';
  - const DEFAULT_WORKSPACE_SLUG = 'harness-test-workspace';
  + function resolveServerContext(opts: { target?: string; serverUrl?: string }) {
  +   const ports = computePorts();
  +   return {
  +     baseUrl: opts.serverUrl ?? `http://127.0.0.1:${ports.app}`,
  +     workspaceSlug: 'harness-test-workspace',
  +     worktreePath:
  +       opts.target === 'container'
  +         ? '/app/scratch/harness-test-workspace'
  +         : path.join(resolveProjectRoot(), 'scratch', 'harness-test-workspace'),
  +   };
  + }
  ...
  - const client = await createWorkflowApiClient(baseUrl, worktreePath);
  + const { baseUrl, workspaceSlug, worktreePath } = resolveServerContext(opts);
  + const client = await createWorkflowApiClient(baseUrl, workspaceSlug, worktreePath);
  ```

### FT-002: Prove Fake/Real parity with the real `WorkflowApiClient`
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/074-actaul-real-agents/harness/tests/unit/sdk/workflow-api-client.test.ts`
- **Issue**: The shared contract suite claims to verify Fake/Real parity but only runs against `FakeWorkflowApiClient`.
- **Fix**: Add a second invocation of the shared contract suite for a real `WorkflowApiClient` against a controllable server fixture or harness-backed integration environment. Cover all 5 methods plus key unhappy paths (`409 already`, `null status`, timeout/network failure).
- **Patch hint**:
  ```diff
   workflowApiClientContractTests('FakeWorkflowApiClient', () =>
     new FakeWorkflowApiClient({ workspaceSlug: 'test-workspace', worktreePath: '/tmp/test-worktree' }),
   );
  
  + describeIfServerAvailable('WorkflowApiClient', () => {
  +   workflowApiClientContractTests('WorkflowApiClient', () =>
  +     new WorkflowApiClient({
  +       baseUrl: process.env.TEST_SERVER_URL!,
  +       workspaceSlug: process.env.TEST_WORKSPACE_SLUG!,
  +       worktreePath: process.env.TEST_WORKTREE_PATH!,
  +     }),
  +   );
  + });
  ```

### FT-003: Commit hybrid evidence for the live REST/SDK path
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/076-harness-workflow-runner/tasks/phase-4-end-to-end-validation-docs/execution.log.md`
- **Issue**: Phase 4 `execution.log.md` is missing, so the subtask has no committed proof of the real `--server` path, REST responses, or browser/SSE behavior required by the spec's Hybrid strategy.
- **Fix**: Add an execution log section for this subtask that records: harness boot/health, direct SDK checks, `workflow run --server`, `workflow status --server`, observed REST responses/status transitions, and any screenshots or SSE observations. If the feature still fails, record the failing transcript explicitly.
- **Patch hint**:
  ```diff
  + # Execution Log — Phase 4 Subtask 001
  +
  + ## Live REST/SDK validation
  + - Command: `cd harness && pnpm exec tsx src/cli/index.ts workflow run --server --server-url http://127.0.0.1:3101 --timeout 10`
  + - Observed: `E133 Invalid workspace or worktree`
  + - App log: `POST /api/workspaces/harness-test-workspace/workflows/test-workflow/execution 400`
  + - Follow-up: direct `WorkflowApiClient` call with `/app/scratch/harness-test-workspace` succeeded
  ```

## Medium / Low Fixes

### FT-004: Make idempotent `already:true` starts non-fatal
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/workflow.ts`
- **Issue**: `runViaServer()` exits on `!runResult.ok` before handling the intentional `already:true` / `409` idempotent-start case.
- **Fix**: Treat `already:true` as success, log it, and continue polling/reporting the active execution instead of failing the envelope.
- **Patch hint**:
  ```diff
  - if (!runResult.ok) {
  + if (!runResult.ok && !runResult.already) {
      exitWithEnvelope(...);
    }
  
    if (runResult.already) {
      console.error('[server] Workflow already running');
    }
  ```

### FT-005: Update workflow-ui / positional-graph domain artifacts
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/workflow-ui/domain.md`, `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md`, `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md`
- **Issue**: The new REST execution surface and `IOrchestrationService`/`auth()` usage shipped without matching domain-doc and map updates.
- **Fix**: Document the REST API in `workflow-ui/domain.md`, update positional-graph consumers, add a Concepts table, and refresh map edges/health summary text.
- **Patch hint**:
  ```diff
  + | Plan 076-P4-ST001 | Workflow execution REST API (`/execution`, `/execution/restart`, `/detailed`) for harness/server-mode validation | 2026-03-22 |
  ...
  - workflowUI -->|"IPositionalGraphService<br/>ITemplateService<br/>IWorkUnitService"| posGraph
  + workflowUI -->|"IPositionalGraphService<br/>IOrchestrationService<br/>ITemplateService<br/>IWorkUnitService"| posGraph
  - workflowUI -->|"middleware protection"| auth
  + workflowUI -->|"middleware protection<br/>auth() for API routes"| auth
  ```

### FT-006: Extract shared formatter / validation helpers to reduce drift
- **Severity**: LOW
- **File(s)**: `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/detailed/route.ts`, `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/app/actions/workflow-execution-actions.ts`, `/Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/positional-graph.command.ts`
- **Issue**: The REST `/detailed` route duplicates the CLI serializer and `_resolve-worktree.ts` duplicates validation logic already present in server actions.
- **Fix**: Extract shared helper(s) so CLI, REST, and server-action paths serialize and validate workflow execution consistently.
- **Patch hint**:
  ```diff
  - const detailed = { ...large inline object... }
  + const detailed = toSerializableWorkflowDetailedStatus({ reality, state, statusResult, slug: graphSlug });
  
  - export async function resolveValidatedWorktreePath(...) { ... }
  + export { resolveValidatedWorktreePath } from '@/app/actions/workflow-execution-actions-shared';
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
