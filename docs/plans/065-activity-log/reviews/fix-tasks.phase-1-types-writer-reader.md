# Fix Tasks: Phase 1: Activity Log Domain — Types, Writer, Reader

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Resolve reader contract drift (AC-11)
- **Severity**: HIGH
- **File(s)**: /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/activity-log-reader.ts; /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-reader.test.ts; /Users/jak/substrate/059-fix-agents-tmp/test/contracts/activity-log.contract.test.ts; /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-spec.md; /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md; /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-1-types-writer-reader/tasks.md
- **Issue**: The spec still promises "most recent first" + default 200 behavior, while the implementation/tests currently return oldest-first and never prove the default path.
- **Fix**: Pick one contract and align **all** artifacts in the same patch. Preferred path: honor AC-11 by returning the most recent entries first and add an explicit default-200 regression test.
- **Patch hint**:
  ```diff
  - const limit = options?.limit ?? DEFAULT_LIMIT;
  - if (entries.length > limit) {
  -   entries = entries.slice(-limit);
  - }
  - return entries;
  + const limit = options?.limit ?? DEFAULT_LIMIT;
  + const limited = entries.length > limit ? entries.slice(-limit) : entries;
  + return [...limited].reverse();
  ```

### FT-002: Rebuild the missing phase execution log
- **Severity**: HIGH
- **File(s)**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-1-types-writer-reader/execution.log.md
- **Issue**: There is no execution log artifact for the phase, so RED->GREEN and non-test verification evidence is missing.
- **Fix**: Create `execution.log.md` with the actual commands run, whether they were RED/GREEN, the observed outputs, and the verification steps for docs / gitignore checks.
- **Patch hint**:
  ```diff
  + # Execution Log — Phase 1: Activity Log Domain — Types, Writer, Reader
  +
  + ## T002-T005 Test Evidence
  + - RED: <command + failing output>
  + - GREEN: <command + passing output>
  +
  + ## T006-T007 Verification
  + - git check-ignore -v .chainglass/data/activity-log.jsonl
  + - <domain doc / map verification notes>
  ```

## Medium / Low Fixes

### FT-003: Parse timestamps instead of comparing strings
- **Severity**: MEDIUM
- **File(s)**: /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/activity-log-reader.ts; /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-reader.test.ts
- **Issue**: `since` filtering uses lexical comparison, which breaks for valid ISO timestamps that use offsets.
- **Fix**: Convert timestamps to epoch milliseconds with `Date.parse()`, skip invalid timestamps, and add a regression test using offset-bearing values.
- **Patch hint**:
  ```diff
  - if (options?.since && entry.timestamp <= options.since) continue;
  + const entryTime = Date.parse(entry.timestamp);
  + if (Number.isNaN(entryTime)) continue;
  + if (options?.since) {
  +   const sinceTime = Date.parse(options.since);
  +   if (!Number.isNaN(sinceTime) && entryTime <= sinceTime) continue;
  + }
  ```

### FT-004: Cover bare hostnames in ignore logic
- **Severity**: MEDIUM
- **File(s)**: /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/065-activity-log/lib/ignore-patterns.ts; /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/ignore-patterns.test.ts
- **Issue**: Bare hostnames such as `ubuntu` are still treated as meaningful activity labels.
- **Fix**: Add hostname-aware filtering (full + short hostname) and regression tests for representative Linux / remote cases.
- **Patch hint**:
  ```diff
  + import os from 'node:os';
  +
  + const HOSTNAME_VARIANTS = new Set([os.hostname(), os.hostname().split('.')[0]]);
  +
    export function shouldIgnorePaneTitle(title: string): boolean {
  +   if (HOSTNAME_VARIANTS.has(title)) return true;
      return TMUX_PANE_TITLE_IGNORE.some((pattern) => pattern.test(title));
    }
  ```

### FT-005: Repair activity-log domain artifacts
- **Severity**: MEDIUM
- **File(s)**: /Users/jak/substrate/059-fix-agents-tmp/docs/domains/activity-log/domain.md; /Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md
- **Issue**: The docs currently reverse the terminal/activity-log relationship and omit required composition / concepts / summary details.
- **Fix**: Make the docs reflect the actual Phase 1 state: no terminal dependency yet (or reverse it for Phase 2 with real contract names), add `## Composition`, reshape `## Concepts`, and add the missing `activity-log` row to the Domain Health Summary.
- **Patch hint**:
  ```diff
  - | terminal | Pane title source (sidecar polls tmux) | Yes (Phase 2) |
  + | _platform/panel-layout | PanelShell anchor for overlay positioning | Yes (Phase 3) |
  +
  + ## Composition
  + | Component | Kind | Location | Role |
  + |-----------|------|----------|------|
  + | ActivityLogEntry | type | apps/web/src/features/065-activity-log/types.ts | Source-agnostic entry contract |
  ```
  ```diff
  - activityLog -->|"pane title source<br/>(sidecar writes)"| terminal
  + terminal -->|"appendActivityLogEntry()<br/>shouldIgnorePaneTitle()"| activityLog
  ```

### FT-006: Bring tests to project documentation / lint standard
- **Severity**: MEDIUM
- **File(s)**: /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-writer.test.ts; /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/activity-log-reader.test.ts; /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/065-activity-log/ignore-patterns.test.ts; /Users/jak/substrate/059-fix-agents-tmp/test/contracts/activity-log.contract.test.ts
- **Issue**: The new tests are missing the mandatory five-field Test Doc comment and currently fail Biome formatting/import-order checks.
- **Fix**: Add Test Doc comments to every new `it(...)` block and run Biome so `just lint` is clean.
- **Patch hint**:
  ```diff
    it('appends a valid entry as a JSONL line', () => {
  +   /*
  +   Test Doc:
  +   - Why: Verify append-only persistence preserves the public entry contract.
  +   - Contract: appendActivityLogEntry() writes exactly one JSONL line for a non-duplicate entry.
  +   - Usage Notes: Use a temp worktree path and read the resulting file directly.
  +   - Quality Contribution: Catches silent field loss and malformed persistence writes.
  +   - Worked Example: {id:'tmux:0.0', label:'Implementing Phase 1'} -> one matching JSON object in activity-log.jsonl
  +   */
      const dir = getTmpDir();
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
