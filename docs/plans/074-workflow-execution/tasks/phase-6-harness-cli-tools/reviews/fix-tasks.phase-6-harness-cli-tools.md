# Fix Tasks: Phase 6: Harness + CLI Tools

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Repair `--target container` execution
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/cli/commands/test-data.ts
  - /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/cg-runner.ts
  - /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/ports/allocator.ts _(reuse, do not duplicate logic)_
- **Issue**: Live validation failed AC-4 because `resolveOptions()` never computes the harness container name and `runCg()` falls back to `chainglass-wt`, which does not exist for this worktree.
- **Fix**: Reuse `computePorts()` to derive `chainglass-${worktree}` for container mode, plumb `containerName` from `resolveOptions()`, and make container-target arguments safe for in-container execution before re-running `just harness test-data status --target container` and `just test-data create env --target container`.
- **Patch hint**:
  ```diff
  + import { computePorts } from '../../ports/allocator.js'
  +
    function resolveOptions(opts: { target?: string; workspacePath?: string }): CgExecOptions {
  +   const target = (opts.target as 'local' | 'container') ?? 'local'
  +   const ports = target === 'container' ? computePorts() : null
      return {
  -     target: (opts.target as 'local' | 'container') ?? 'local',
  +     target,
          workspacePath: opts.workspacePath ?? process.cwd(),
  +     containerName: ports ? `chainglass-${ports.worktree}` : undefined,
      }
    }
  
  - return runInContainer(fullArgs, options.containerName ?? 'chainglass-wt')
  + return runInContainer(toContainerArgs(fullArgs), options.containerName ?? `chainglass-${computePorts().worktree}`)
  ```

### FT-002: Stop relying on unsupported `cg template delete`
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/environment.ts
  - /Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/template.command.ts
  - /Users/jordanknight/substrate/074-actaul-real-agents/packages/workflow/src/interfaces/template-service.interface.ts
  - /Users/jordanknight/substrate/074-actaul-real-agents/packages/workflow/src/services/template.service.ts
  - /Users/jordanknight/substrate/074-actaul-real-agents/packages/workflow/src/fakes/fake-template-service.ts _(if needed)_
- **Issue**: The source harness code calls `cg template delete`, but the reviewed source CLI and `ITemplateService` do not expose any delete operation. Current manual success depends on a stale dist bundle, not the committed source.
- **Fix**: Either implement template deletion end-to-end (interface, service, CLI, tests, docs) or replace the harness cleanup strategy with a supported API. Do not leave `environment.ts` calling a command that the source does not define.
- **Patch hint**:
  ```diff
  + export interface ITemplateService {
  +   delete(ctx: WorkspaceContext, templateSlug: string): Promise<BaseResult>
  + }
  +
  + template
  +   .command('delete <slug>')
  +   .description('Delete a workflow template')
  +   .option('--json', 'Output as JSON', false)
  +   .option('--workspace-path <path>', 'Override workspace path')
  +   .action(...)
  ```

### FT-003: Restore hybrid verification evidence for the phase
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-6-harness-cli-tools/execution.log.md
  - /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-6-harness-cli-tools/tasks.md
  - Relevant test files to add/update under `/Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/` and/or `/Users/jordanknight/substrate/074-actaul-real-agents/harness/tests/`
- **Issue**: The committed phase artifacts contain almost no verification evidence. The execution log has no task entries, the tasks remain unchecked, and no tests were added for the new CLI surface.
- **Fix**: Add targeted verification for `cg unit update`, `cg unit delete`, and the harness test-data flow; run `just fft`; record the actual commands/results in `execution.log.md`; update completed tasks to `[x]`; and explicitly revalidate `just test-data run` / `just test-data stop`.
- **Patch hint**:
  ```diff
    ## Task Log
  - _Entries added as tasks complete._
  + - 2026-03-16: Ran `just fft` — [paste summary]
  + - 2026-03-16: Ran `just test-data create env` twice — [paste output]
  + - 2026-03-16: Ran `just test-data run` / `stop` — [paste observed outcomes]
  
  - | [ ] | T001 | Add `cg unit update <slug>` CLI command |
  + | [x] | T001 | Add `cg unit update <slug>` CLI command |
  ```

## Medium / Low Fixes

### FT-004: Harden `cg unit update` error handling
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/commands/unit.command.ts
- **Issue**: Missing patch files and malformed JSON currently throw uncaught exceptions, and `--add-input` / `--add-output` silently no-op when unit loading fails.
- **Fix**: Guard file reads, wrap JSON parsing in structured error handling, and fail immediately when `service.load()` returns errors for `--add-input` / `--add-output`.
- **Patch hint**:
  ```diff
  - const raw = fs.readFileSync(filePath, 'utf-8')
  + if (!fs.existsSync(filePath)) {
  +   console.log(adapter.format('unit.update', { slug, errors: [{ message: `Patch file not found: ${filePath}` }] }))
  +   process.exit(1)
  + }
  + const raw = fs.readFileSync(filePath, 'utf-8')
  
  - patch.inputs = JSON.parse(options.inputsJson)
  + try {
  +   patch.inputs = JSON.parse(options.inputsJson)
  + } catch {
  +   console.log(adapter.format('unit.update', { slug, errors: [{ message: '--inputs-json must be valid JSON' }] }))
  +   process.exit(1)
  + }
  ```

### FT-005: Update positional-graph domain history
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md
- **Issue**: The domain history omits the Phase 6 CLI additions.
- **Fix**: Add a `074-P6` history row describing `cg unit update` / `cg unit delete` as new CLI wrappers around existing `IWorkUnitService` methods.
- **Patch hint**:
  ```diff
   | 074-P3 | SSE + GlobalState plumbing ... | 2026-03-15 |
  +| 074-P6 | CLI wrappers for `IWorkUnitService.update()` / `delete()`: `cg unit update` and `cg unit delete`, including patch/json/input-output flags | 2026-03-16 |
  ```

### FT-006: Remove or correct dead `deleteIfExists()` helper
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/074-actaul-real-agents/harness/src/test-data/cg-runner.ts
- **Issue**: `deleteIfExists()` is unused, its JSDoc is inaccurate, and it always returns success even if delete fails.
- **Fix**: Remove the helper if it is not needed, or return the actual `runCg()` result and update the JSDoc to match reality before any future caller uses it.
- **Patch hint**:
  ```diff
  - export async function deleteIfExists(...) {
  -   await runCg(deleteArgs, options)
  -   return { command: `delete ${slug}`, stdout: '', stderr: '', exitCode: 0 }
  - }
  + // Remove unused helper, or:
  + export async function deleteIfExists(...) {
  +   return runCg(deleteArgs, options)
  + }
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
