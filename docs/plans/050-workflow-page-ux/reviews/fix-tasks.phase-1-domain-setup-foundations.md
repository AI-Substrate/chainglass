# Fix Tasks: Phase 1: Domain Setup + Foundations

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Restore Full-TDD evidence trail for Phase 1
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-1-domain-setup-foundations/execution.log.md
- **Issue**: Full TDD is required by spec, but RED→GREEN evidence is not explicitly captured.
- **Fix**: Add concrete RED and GREEN command evidence for phase-critical tasks (especially AC-28/29/30/37), including failing-first and passing-final outputs.
- **Patch hint**:
  ```diff
  + ### T007: Doping validation test (RED -> GREEN)
  + RED: pnpm vitest run test/integration/dope-workflows.test.ts --testNamePattern "sample units"  # fails before script/test alignment
  + GREEN: pnpm vitest run test/integration/dope-workflows.test.ts                                 # passes after fix
  + Evidence: [paste stdout snippets]
  ```

### FT-002: Align AC-30 implementation with spec requirements
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/scripts/dope-workflows.ts
  - /Users/jordanknight/substrate/chainglass-048/test/integration/dope-workflows.test.ts
- **Issue**: AC-30 requires committed `sample-*` work units and 8-state coverage, but current implementation uses generated `demo-*` units and explicitly excludes `ready` from validation.
- **Fix**: Switch scenario unit sources to committed sample units (or formally update spec/tasks if intentional), and add verification that all required UI status states are covered by scenario outcomes.
- **Patch hint**:
  ```diff
  - const DEMO_UNITS = { 'demo-agent': ..., 'demo-code': ..., 'demo-user-input': ... }
  + const UNIT_SOURCES = { 'sample-agent': ..., 'sample-code': ..., 'sample-human-input': ... }
  
  - // 'ready' status is computed at runtime, not persistable — not tested here
  + // validate runtime-computed 'ready' status via service-derived status check
  ```

## Medium / Low Fixes

### FT-003: Add direct script-path validation for AC-37
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/integration/dope-workflows.test.ts
- **Issue**: Current tests recreate scenarios in-process rather than executing the real script path.
- **Fix**: Add integration coverage that executes `npx tsx scripts/dope-workflows.ts` in a temp workspace and verifies generated artifacts.
- **Patch hint**:
  ```diff
  + it('script path: dope-workflows generates expected artifacts', async () => {
  +   // spawn script in temp workspace, then assert workflow dirs + state files
  + })
  ```

### FT-004: Close domain-manifest orphan gaps
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
- **Issue**: Several touched files are absent from Plan 050 Domain Manifest.
- **Fix**: Add manifest rows for:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/tsconfig.json
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md
  - /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/fakes/index.ts
  - /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/index.ts
  - /Users/jordanknight/substrate/chainglass-048/test/integration/dope-workflows.test.ts
- **Patch hint**:
  ```diff
  + | `apps/web/tsconfig.json` | workflow-ui | cross-domain | Path mapping required for web DI import resolution |
  + | `packages/positional-graph/src/fakes/index.ts` | _platform/positional-graph | cross-domain | Fake barrel export |
  ```

### FT-005: Update domain-map topology and health summary
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md
- **Issue**: workflow-ui dependency on file-ops is missing in topology, and summary rows are stale for new workflow-ui relationships.
- **Fix**: Add labeled `workflowUI -> fileOps` edge and refresh Consumers/Providers cells for impacted domains.
- **Patch hint**:
  ```diff
  + workflowUI -->|"IFileSystem<br/>IPathResolver"| fileOps
  - | _platform/file-ops | ... | file-browser, viewer | ... |
  + | _platform/file-ops | ... | file-browser, viewer, workflow-ui | ... |
  ```

### FT-006: Tighten FakePositionalGraphService contract fidelity
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/fakes/fake-positional-graph-service.ts
- **Issue**: Public fake method signatures overuse `unknown` and omit explicit return types in several methods.
- **Fix**: Replace `unknown` with interface-native types and add explicit `Promise<...Result>` signatures for public methods.
- **Patch hint**:
  ```diff
  - async addLine(ctx: WorkspaceContext, graphSlug: string, options?: unknown): Promise<AddLineResult>
  + async addLine(ctx: WorkspaceContext, graphSlug: string, options?: AddLineOptions): Promise<AddLineResult>

  - async askQuestion(ctx: WorkspaceContext, graphSlug: string, nodeId: string, options: unknown) {
  + async askQuestion(ctx: WorkspaceContext, graphSlug: string, nodeId: string, options: AskQuestionOptions): Promise<AskQuestionResult> {
  ```

### FT-007: Improve evidence granularity for dope command verification
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-1-domain-setup-foundations/execution.log.md
- **Issue**: Command-success claims lack concrete output snippets/artifact listings.
- **Fix**: Include captured stdout snippets and resulting workflow directory listings for `dope`, `dope clean`, single-scenario, and `redope` runs.
- **Patch hint**:
  ```diff
  + Evidence output:
  + $ just dope demo-question
  + Created workflow: demo-question
  + ls .chainglass/data/workflows | grep '^demo-'
  + demo-question
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
