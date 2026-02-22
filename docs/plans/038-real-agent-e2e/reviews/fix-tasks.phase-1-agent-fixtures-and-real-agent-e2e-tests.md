# Fix Tasks — Phase 1: Agent Fixtures and Real Agent E2E Tests

## Priority Order

### 1) CRITICAL — Restore required review artifacts
1. Recreate or commit `docs/plans/038-real-agent-e2e/tasks/phase-1-agent-fixtures-and-real-agent-e2e-tests/tasks.md`.
2. Sync plan progress + links using `/plan-6a-update-progress`.
3. Ensure each completed task has log links and footnote references.

### 2) HIGH — Manual testing evidence completion
1. Populate `execution.log.md` with concrete manual run records for each real-agent scenario.
2. For each run include: command, setup preconditions (auth), observed result, and artifact references.
3. Map each AC (AC-34..AC-40) to a log section.

### 3) HIGH — Test coverage gap in Claude serial scenario
1. In `test/integration/real-agent-orchestration.test.ts`, add structural output assertions in Claude serial block:
   - `assertOutputExists(...specWriter..., 'summary')`
   - `assertOutputExists(...reviewer..., 'decision')`
2. Manual verification checklist:
   - Remove `.skip`, run scenario, confirm both outputs persist.

### 4) HIGH — Resolve session inheritance contract ambiguity (AC-36)
1. Decide policy: **reuse same session** vs **fork different session**.
2. Update plan AC-36 wording to match policy.
3. Add explicit assertion in serial tests:
   - reuse policy: `expect(writerSession).toBe(reviewerSession)`
   - fork policy: `expect(writerSession).not.toBe(reviewerSession)`
4. Log manual evidence proving chosen behavior.

### 5) HIGH — Footnote authority sync
1. Replace placeholder ledger entries (`[^1]`, `[^2]`) with real entries mapped to changed files/node IDs.
2. Add corresponding footnote tags in task/dossier notes.
3. Verify sequential numbering, no gaps, no orphan references.

### 6) MEDIUM — Scope/accountability cleanup
1. Either justify workshop/plan/log modifications in phase alignment notes, or move them to dedicated planning task.
2. Keep phase implementation scope focused on task-table paths.

### 7) MEDIUM — Observability improvements in drive callback
1. Log `event.error` details on error events.
2. Include result metrics (`totalActions`, elapsed ms) in scenario summaries.
3. Re-run manual scenarios to ensure logs remain readable.

### 8) LOW — Tighten prompt determinism
1. Update `spec-writer/prompts/main.md` to exactly one sentence summary.
2. Re-run manual serial scenario and confirm output still structurally valid.
