# Fix Tasks — phase-2-deep-linking-url-state

## Blocking (CRITICAL/HIGH)

1. **Sync plan↔dossier progress (CRITICAL)**
   - Files: `docs/plans/041-file-browser/file-browser-plan.md`, `docs/plans/041-file-browser/tasks/phase-2-deep-linking-url-state/tasks.md`
   - Action: update Phase 2 status rows and AC checkboxes in plan to match completed dossier tasks.
   - Hint: use `/plan-6a-update-progress` for authoritative synchronization.

2. **Restore footnote authority chain (CRITICAL/HIGH)**
   - Files: plan § Change Footnotes Ledger + dossier § Phase Footnote Stubs + task Notes column
   - Action: add sequential Phase 2 footnotes, map each changed file to footnote(s), add task-level `[^N]` references.
   - Requirement: no gaps/duplicates; plan ledger is primary authority.

3. **Repair Task↔Log backlinks (HIGH)**
   - Files: `tasks.md` (Notes), `execution.log.md`
   - Action: add `log#...` anchors for each completed task and add explicit `Plan Task`/`Dossier Task` backlinks in each log section.

4. **Resolve scope drift for domain docs (HIGH)**
   - Files: `docs/domains/_platform/workspace-url/domain.md`, `docs/domains/registry.md`
   - Action: either (a) add explicit scope justification in phase dossier/execution log, or (b) move these docs to a dedicated docs task/phase.

## Non-blocking code hardening (MEDIUM, test-first)

5. **TDD fix: omit null worktree in workspaceHref**
   - RED test first in `test/unit/web/lib/workspace-url.test.ts`:
     - `workspaceHref('proj', '/browser', { worktree: null })` should return `/workspaces/proj/browser`.
   - GREEN code in `apps/web/src/lib/workspace-url.ts`:
```diff
- if (options.worktree !== undefined && options.worktree !== '' && options.worktree !== false) {
+ if (options.worktree !== undefined && options.worktree !== null && options.worktree !== '' && options.worktree !== false) {
```

6. **TDD fix: strengthen non-string worktree assertion**
   - File: `test/unit/web/lib/params/workspace-params.test.ts`
```diff
- expect(typeof result.worktree).toBe('string');
+ expect(result.worktree).toBe('');
```
   - If parser behavior currently differs, normalize input in parser layer to preserve “ignored” invariant.

## Re-verify
```bash
pnpm --silent vitest run test/unit/web/lib/workspace-url.test.ts test/unit/web/lib/params/workspace-params.test.ts
just fft
```
