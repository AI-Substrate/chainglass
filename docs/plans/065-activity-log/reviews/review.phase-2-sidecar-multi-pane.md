# Code Review: Phase 2: Terminal Sidecar — Multi-Pane Polling + Activity Writes

**Plan**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md
**Spec**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-spec.md
**Phase**: Phase 2: Terminal Sidecar — Multi-Pane Polling + Activity Writes
**Date**: 2026-03-06
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Request changes because the new worktree-root resolution still writes against the sidecar process directory instead of the connection `cwd`, and the new polling loop can crash the sidecar on filesystem write failures.

**Key failure areas**:
- **Implementation**: `terminal-ws.ts` resolves `git rev-parse --show-toplevel` without `-C <cwd>` and lets synchronous activity-log write errors escape the polling timer.
- **Domain compliance**: The Phase 2 Domain Manifest omits several changed terminal files, and the terminal/domain-map docs do not fully record the new `activity-log` dependency.
- **Testing**: The core `terminal-ws.ts` integration path has no automated proof for worktree resolution, filtering, writes, or `pane_title` removal.
- **Doctrine**: The newly added `getPaneTitles()` tests do not include the required 5-field Test Doc blocks.

## B) Summary

The phase lands the intended overall shape: `getPaneTitles()` exists, the pane-title badge plumbing is removed, and the targeted activity-log/terminal test suite still passes (`49/49`). However, the most important Phase 2 integration path in `terminal-ws.ts` is still incorrect because `git rev-parse` is executed from the sidecar process directory, not the client-provided `cwd`, so activity entries can be written to the wrong worktree. The new polling loop also treats activity-log writes as crashable sidecar work instead of best-effort observability work. Domain artifacts were only partially synchronized, and the new sidecar behavior lacks automated coverage in `terminal-ws.test.ts`. No genuine reinvention was found; this phase extends the existing terminal domain rather than duplicating another domain.

## C) Checklist

**Testing Approach: Hybrid**

Hybrid:
- [x] Parser-level TDD coverage exists for `getPaneTitles()` in `tmux-session-manager.test.ts`
- [ ] `terminal-ws.ts` integration paths are covered by automated tests
- [ ] Worktree-resolution, filtering, write, and persistence behavior are backed by concrete evidence

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/server/terminal-ws.ts:101-105,312-313 | correctness | `git rev-parse --show-toplevel` ignores the connection `cwd`, so activity entries can be written to the sidecar repo instead of the user worktree. | Resolve the git root relative to the connection path (for example `git -C <cwd> rev-parse --show-toplevel`) before calling `appendActivityLogEntry()`. |
| F002 | HIGH | /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/server/terminal-ws.ts:111-123 | error-handling | Synchronous activity-log writes run inside `setInterval()` without an error boundary, so `EACCES`/`ENOSPC`-style failures can terminate the sidecar. | Treat activity logging as best-effort: catch write failures inside the polling loop, log them, and continue serving terminal sessions. |
| F003 | HIGH | /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/064-terminal/terminal-ws.test.ts:61-262 | testing | The phase's core sidecar behavior has no automated proof for git-root resolution, multi-pane polling, filtering, writes, or `pane_title` removal. | Add `terminal-ws` tests for rev-parse success/fallback, polling, ignore filtering, activity-log writes, and the absence of `pane_title` websocket messages. |
| F004 | MEDIUM | /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md:22-48 | domain | The Domain Manifest omits eight changed Phase 2 files, so the review cannot map every touched file to a declared owner. | Add the missing terminal component/hook/type/doc paths to the Domain Manifest with explicit domain/classification entries. |
| F005 | MEDIUM | /Users/jak/substrate/059-fix-agents-tmp/docs/domains/terminal/domain.md:26-35 | domain | The touched terminal domain doc records the history row but still does not list the new `activity-log` dependency or consumed contracts. | Update terminal domain documentation (and the feature-level authoritative doc if needed) to include `appendActivityLogEntry()` and `shouldIgnorePaneTitle()`. |
| F006 | MEDIUM | /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/064-terminal/tmux-session-manager.test.ts:209-257 | doctrine | The new `getPaneTitles()` tests do not include the required 5-field Test Doc comments from the project rules/constitution. | Add a full Test Doc block to each new test case, or consolidate the cases into fewer documented tests. |
| F007 | LOW | /Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md:129-152 | domain | The diagram edge is present, but the Domain Health Summary still omits an `activity-log` row and the `terminal` row's new provider/contracts-in data. | Update the health summary so the terminal ↔ activity-log relationship is reflected in both rows. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH — correctness)** — `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/server/terminal-ws.ts:101-105,312-313` resolves the worktree root with `deps.execCommand('git', ['rev-parse', '--show-toplevel'])`, but the injected CLI executor runs commands with no `cwd`. In any case where the connection `cwd` differs from the sidecar process directory, the sidecar will append activity entries to the wrong `<worktree>/.chainglass/data/activity-log.jsonl`.
- **F002 (HIGH — error-handling)** — `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/server/terminal-ws.ts:111-123` calls `appendActivityLogEntry()` from inside a timer without catching synchronous filesystem failures. Because the writer uses `mkdirSync()` and `appendFileSync()`, a transient disk or permission error can throw out of the timer callback and take down the terminal sidecar.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | The modified source files stay under the terminal domain tree (`apps/web/src/features/064-terminal/`) and the touched docs stay under the matching domain/docs trees. |
| Contract-only imports | ✅ | `/Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/server/terminal-ws.ts:19-20` consumes `appendActivityLogEntry()` and `shouldIgnorePaneTitle()` from files that are documented as activity-log contracts in `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/activity-log/domain.md:27-35`. |
| Dependency direction | ✅ | The realized dependency is terminal (business) → activity-log (business) via documented contracts; no infrastructure → business edge or cycle was introduced. |
| Domain.md updated | ❌ | `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/activity-log/domain.md` has the Phase 2 history row, but `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/terminal/domain.md:26-35` does not list the new `activity-log` dependency/contracts. |
| Registry current | ✅ | `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/registry.md:23` already contains `activity-log`; this phase did not create additional domains. |
| No orphan files | ❌ | `/Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md:22-48` does not declare eight changed Phase 2 files, including the terminal UI removals and `docs/domains/terminal/domain.md`. |
| Map nodes current | ✅ | `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md:39-40` includes the `activity-log` node and `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md:110-112` includes the labeled terminal → activity-log edge. |
| Map edges current | ❌ | The arrow label is present, but `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md:129-152` does not carry the new relationship into the Domain Health Summary rows. |
| No circular business deps | ✅ | The current map adds a one-way terminal → activity-log relationship only; no new business-domain cycle is introduced. |
| Concepts documented | ⚠️ | `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/activity-log/domain.md:15-25` has a Concepts section, but the touched `/Users/jak/substrate/059-fix-agents-tmp/docs/domains/terminal/domain.md` remains a summary pointer with no Concepts table. This is a warning, not a blocker for this phase. |

Additional domain notes:
- **F004 (MEDIUM — orphan files)** — The Phase 2 Domain Manifest is incomplete for the files actually touched by badge removal and documentation sync.
- **F005 (MEDIUM — domain doc currency)** — The terminal domain docs only record the history row, not the realized dependency on `activity-log`.
- **F007 (LOW — map currency)** — The business-domain edge is documented, but the health summary rows have not been updated to match it.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| No new standalone component/file introduced in this phase | None | — | Proceed — `getPaneTitles()` is an extension of the existing `TmuxSessionManager`, and no cross-domain duplication was found. |

### E.4) Testing & Evidence

**Coverage confidence**: 68%

Validation notes:
- **F003 (HIGH)** — `/Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/064-terminal/terminal-ws.test.ts:61-262` still has no assertions covering Phase 2's new sidecar behavior.
- **MEDIUM** — AC-05 is only indirectly supported by writer/reader tests; there is no explicit sidecar restart/reconnect proof.
- **MEDIUM** — Badge-removal evidence is grep-based; no captured typecheck/build proof exists for the seven touched terminal UI/socket files.
- **Positive evidence** — `pnpm vitest run ...` passed `49/49` across the phase-relevant terminal/activity-log suites.

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 56% | `terminal-ws.ts` now calls `appendActivityLogEntry()`, and writer tests prove append/create-file behavior, but no `terminal-ws` test proves a pane title change writes to `<worktree>/.chainglass/data/activity-log.jsonl`. |
| AC-02 | 94% | `tmux-session-manager.ts` uses `tmux list-panes -t <session> -s -F ...`, and `/Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/064-terminal/tmux-session-manager.test.ts:209-257` adds explicit multi-window/single-pane/error/tab cases. |
| AC-03 | 79% | `shouldIgnorePaneTitle()` is applied before writes, and ignore-pattern tests cover hostnames, shell names, empty titles, and paths; missing piece is a sidecar-level proof that ignored titles never hit disk. |
| AC-04 | 82% | Writer and contract tests prove same-id/same-label dedup, and the sidecar emits stable ids in `tmux:<pane>` form; missing piece is repeated sidecar-poll proof. |
| AC-05 | 63% | Writer/reader tests show disk persistence after write, but no phase-specific sidecar restart/reconnect evidence exists. |

### E.5) Doctrine Compliance

- **F006 (MEDIUM)** — `/Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/064-terminal/tmux-session-manager.test.ts:209-257` adds four new tests without the mandatory 5-field Test Doc comments required by `/Users/jak/substrate/059-fix-agents-tmp/docs/project-rules/rules.md:100-123` and `/Users/jak/substrate/059-fix-agents-tmp/docs/project-rules/constitution.md:133-149`.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | When a tmux pane title changes, a timestamped entry is appended to `<worktree>/.chainglass/data/activity-log.jsonl`. | Implementation exists in `terminal-ws.ts`, writer tests pass, but no direct sidecar write test exists. | 56% |
| AC-02 | All panes in the tmux session are polled, not just the active pane. | `getPaneTitles()` uses `list-panes -s`, and new parser tests cover multi-window output. | 94% |
| AC-03 | Default/hostname pane titles are filtered and never written. | `shouldIgnorePaneTitle()` is applied before writes, and ignore-pattern tests cover the filter list. | 79% |
| AC-04 | Consecutive identical labels for the same `id` are deduplicated. | Writer + contract tests prove same-id/same-label dedup; sidecar uses stable `tmux:<pane>` ids. | 82% |
| AC-05 | Activity log survives server restarts because entries persist on disk. | Persistence is proven at writer/reader level, but there is no sidecar restart/reconnect proof. | 63% |

**Overall coverage confidence**: 68%

## G) Commands Executed

```bash
git --no-pager status --short && printf '\n---UNSTAGED-STAT---\n' && git --no-pager diff --stat && printf '\n---STAGED-STAT---\n' && git --no-pager diff --staged --stat && printf '\n---RECENT-LOG---\n' && git --no-pager log --oneline -10

set -euo pipefail
PLAN_DIR='/Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log'
REVIEW_DIR="$PLAN_DIR/reviews"
mkdir -p "$REVIEW_DIR"
FILES=(
  'apps/web/src/features/064-terminal/components/terminal-inner.tsx'
  'apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx'
  'apps/web/src/features/064-terminal/components/terminal-page-client.tsx'
  'apps/web/src/features/064-terminal/components/terminal-page-header.tsx'
  'apps/web/src/features/064-terminal/components/terminal-view.tsx'
  'apps/web/src/features/064-terminal/hooks/use-terminal-socket.ts'
  'apps/web/src/features/064-terminal/server/terminal-ws.ts'
  'apps/web/src/features/064-terminal/server/tmux-session-manager.ts'
  'apps/web/src/features/064-terminal/types.ts'
  'docs/domains/activity-log/domain.md'
  'docs/domains/terminal/domain.md'
  'test/unit/web/features/064-terminal/tmux-session-manager.test.ts'
)
git --no-pager diff --name-status -- "${FILES[@]}"
git --no-pager diff --binary -- "${FILES[@]}" > "$REVIEW_DIR/_computed.diff"
find "$PLAN_DIR/tasks/phase-2-sidecar-multi-pane" -type f | sort

rg -n "pane_title|paneTitle|onPaneTitle" apps/web/src/features/064-terminal

pnpm vitest run test/unit/web/features/064-terminal/tmux-session-manager.test.ts test/unit/web/features/064-terminal/terminal-ws.test.ts test/unit/web/features/065-activity-log/activity-log-writer.test.ts test/unit/web/features/065-activity-log/ignore-patterns.test.ts test/contracts/activity-log.contract.test.ts
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md
**Spec**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-spec.md
**Phase**: Phase 2: Terminal Sidecar — Multi-Pane Polling + Activity Writes
**Tasks dossier**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-2-sidecar-multi-pane/tasks.md
**Execution log**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/tasks/phase-2-sidecar-multi-pane/execution.log.md
**Review file**: /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/reviews/review.phase-2-sidecar-multi-pane.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/server/terminal-ws.ts | Modified | terminal | Fix F001 and F002 |
| /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/server/tmux-session-manager.ts | Modified | terminal | None |
| /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/components/terminal-inner.tsx | Modified | terminal | None |
| /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx | Modified | terminal | None |
| /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/components/terminal-page-client.tsx | Modified | terminal | None |
| /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/components/terminal-page-header.tsx | Modified | terminal | None |
| /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/components/terminal-view.tsx | Modified | terminal | None |
| /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/hooks/use-terminal-socket.ts | Modified | terminal | None |
| /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/types.ts | Modified | terminal | None |
| /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/064-terminal/tmux-session-manager.test.ts | Modified | terminal tests | Add Test Doc blocks |
| /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/064-terminal/terminal-ws.test.ts | Reviewed | terminal tests | Add Phase 2 coverage |
| /Users/jak/substrate/059-fix-agents-tmp/docs/domains/activity-log/domain.md | Modified | activity-log docs | None |
| /Users/jak/substrate/059-fix-agents-tmp/docs/domains/terminal/domain.md | Modified | terminal docs | Update dependency documentation |
| /Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md | Reviewed | architecture docs | Update health summary |
| /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md | Reviewed | plan artifact | Update Domain Manifest |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/server/terminal-ws.ts | Resolve the git root relative to the connection `cwd` before writing activity entries. | Current `git rev-parse` calls resolve against the sidecar process directory and can write to the wrong worktree. |
| 2 | /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/server/terminal-ws.ts | Catch/log `appendActivityLogEntry()` failures inside the polling loop. | Filesystem write errors can currently terminate the sidecar. |
| 3 | /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/064-terminal/terminal-ws.test.ts | Add Phase 2 coverage for rev-parse success/fallback, polling/filtering, writes, and no-`pane_title` behavior. | The current suite misses the phase's core integration path and did not catch F001. |
| 4 | /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md | Add the missing changed files to the Domain Manifest. | The manifest must map every changed Phase 2 file to a declared owner. |
| 5 | /Users/jak/substrate/059-fix-agents-tmp/docs/domains/terminal/domain.md | Record the new `activity-log` dependency and consumed contracts. | The touched domain doc is stale after this phase. |
| 6 | /Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md | Update the Domain Health Summary for `activity-log` and `terminal`. | The edge exists, but the summary rows are not current. |
| 7 | /Users/jak/substrate/059-fix-agents-tmp/test/unit/web/features/064-terminal/tmux-session-manager.test.ts | Add the mandatory 5-field Test Doc blocks to the new tests. | The phase currently violates the project's test-documentation doctrine. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md | Domain Manifest entries for the changed terminal UI/hook/type files and `docs/domains/terminal/domain.md` |
| /Users/jak/substrate/059-fix-agents-tmp/docs/domains/terminal/domain.md | `activity-log` dependency and consumed contracts (`appendActivityLogEntry()`, `shouldIgnorePaneTitle()`) |
| /Users/jak/substrate/059-fix-agents-tmp/docs/domains/domain-map.md | Domain Health Summary rows for `activity-log` and `terminal` |
| /Users/jak/substrate/059-fix-agents-tmp/apps/web/src/features/064-terminal/domain.md | If this remains the authoritative domain spec, sync Dependencies/History with the Phase 2 activity-log integration |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jak/substrate/059-fix-agents-tmp/docs/plans/065-activity-log/activity-log-plan.md --phase 'Phase 2: Terminal Sidecar — Multi-Pane Polling + Activity Writes'
