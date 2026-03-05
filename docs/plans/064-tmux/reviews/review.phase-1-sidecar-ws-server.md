# Code Review: Phase 1: Sidecar WebSocket Server + tmux Integration

**Plan**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md  
**Spec**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-spec.md  
**Phase**: Phase 1: Sidecar WebSocket Server + tmux Integration  
**Date**: 2026-03-02  
**Reviewer**: Automated (plan-7-v2)  
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

High-severity runtime and security issues remain in the sidecar connection path.

**Key failure areas**:
- **Implementation**: Unvalidated `cwd` input and unhandled PTY spawn failures can lead to unsafe directory access and process instability.
- **Domain compliance**: Domain artifacts are not fully current with changed/added contracts and manifest coverage.
- **Reinvention**: Session-ID/session-name validation overlaps existing shared validator behavior.
- **Testing**: Evidence quality is partial (no RED→GREEN traces) and multi-client behavior proof is incomplete.
- **Doctrine**: New interfaces violate active naming rule requirements.

## B) Summary

Phase 1 implementation is functionally substantial and test coverage exists for core tmux + WebSocket behavior, but two HIGH issues must be fixed before approval. The server accepts `cwd` from query params without applying available path validation, and connection setup lacks spawn error containment. Domain governance is partially complete (registry/map are current), but `domain.md` contract/concepts and plan domain-manifest mapping are incomplete for this phase’s output. Testing evidence demonstrates green results, but does not yet provide RED→GREEN proof or strong AC-04 multi-client validation.

## C) Checklist

**Testing Approach: Hybrid**

- [ ] Backend TDD evidence includes RED→GREEN traces for T005/T006
- [x] Core backend validation tests present
- [ ] Critical multi-client behavior is verified with observable shared-session evidence
- [ ] Key verification points are documented with concrete command output

Universal:
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (not evidenced in phase execution log)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts:112-121 | security | `cwd` query input is not validated before PTY spawn. | Validate `cwd` against an allowed base and reject invalid paths before `handleConnection`. |
| F002 | HIGH | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts:40-45 | error-handling | PTY spawn path is not guarded; thrown spawn errors can crash the sidecar flow. | Wrap spawn paths in `try/catch`, emit structured error status, close socket safely. |
| F003 | MEDIUM | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/tmux-session-manager.ts:56-60 | security | `validateCwd` uses prefix match (`startsWith`) and is boundary-bypassable. | Use `path.relative` or `base + path.sep` safe boundary checking. |
| F004 | MEDIUM | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts:33-93 | scope | Implementation diverges from phase task contract (`Map<session, {pty,clients}>` shared-PTY model). | Either implement shared-PTY model or update phase task contract to approved per-client PTY model. |
| F005 | MEDIUM | /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md:25-64 | orphan | Domain Manifest omits several changed files (root package/lockfile, test barrel, phase artifacts). | Add missing mappings or explicit exclusion rule for generated artifacts/lockfiles. |
| F006 | MEDIUM | /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md:34-46 | domain-md | Contracts table does not include exported terminal contracts (`TerminalServerOptions`, `PtySpawner`, `PtyProcess`, `CommandExecutor`). | Update contracts table or stop exporting non-contract items from barrel. |
| F007 | MEDIUM | /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md | concepts-docs | Required Concepts section/table is missing. | Add `## Concepts` with `Concept | Entry Point | What It Does` and phase-added contracts. |
| F008 | MEDIUM | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/tmux-session-manager.ts:16-53 | reinvention | Session-name validation overlaps existing shared validator pattern. | Reuse/extend `/packages/shared/src/lib/validators/session-id-validator.ts` or align behavior explicitly. |
| F009 | MEDIUM | /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-1-sidecar-ws-server/execution.log.md:22-27 | testing | No RED→GREEN evidence despite TDD requirement for backend tasks. | Add failing-run then passing-run evidence snippets per task. |
| F010 | MEDIUM | /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/terminal-ws.test.ts:149-167 | testing | AC-04 multi-client evidence is weak (spawn-count only). | Add assertions showing cross-client shared session behavior/output visibility. |
| F011 | MEDIUM | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/types.ts:9; /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts:19; /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/tmux-session-manager.ts:19 | doctrine | Interfaces violate `R-CODE-002` (`I`-prefix requirement). | Rename interfaces or document approved variance from project-rules. |
| F012 | LOW | /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/terminal-ws.test.ts:169-188 | testing | tmux fallback message content is not asserted, only `tmux:false`. | Assert warning message payload expected by spec intent. |
| F013 | LOW | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts:126 | doctrine | Added line exceeds 100-char formatting rule (`R-CODE-005`). | Wrap long error string / extract constant. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH/security)**: `cwd` from socket query is passed directly into PTY spawning path with no call to `validateCwd`.
- **F002 (HIGH/error-handling)**: `spawnAttachedPty` / `spawnRawShell` call sites are not protected; thrown errors are not transformed into recoverable connection errors.
- **F003 (MEDIUM/security)**: `validateCwd` logic itself is currently boundary-unsafe.
- **F004 (MEDIUM/scope)**: Task dossier promised shared-PTY session map semantics; implementation currently creates PTY per connection.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New source and test files are in expected terminal/test paths. |
| Contract-only imports | ✅ | No cross-domain internal import violations found in phase files. |
| Dependency direction | ✅ | No infrastructure → business inversion detected. |
| Domain.md updated | ❌ | Contracts list not fully aligned with actual barrel exports (F006). |
| Registry current | ✅ | `terminal` row present in `/Users/jordanknight/substrate/064-tmux/docs/domains/registry.md`. |
| No orphan files | ❌ | Domain Manifest does not cover all changed files (F005). |
| Map nodes current | ✅ | Domain map includes terminal node. |
| Map edges current | ✅ | Terminal dependency edges are present and labeled in domain map. |
| No circular business deps | ✅ | No business-domain cycle introduced by phase changes. |
| Concepts documented | ⚠️ | Missing required Concepts table for contract-bearing terminal domain (F007). |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| TmuxSessionManager session-name validation | `/Users/jordanknight/substrate/064-tmux/packages/shared/src/lib/validators/session-id-validator.ts` | shared validator utility | ⚠️ Extend/reuse recommended (F008) |
| Terminal WebSocket sidecar | No direct equivalent | terminal | ✅ Proceed |
| FakePty / FakeTmuxExecutor | Similar fake patterns only | test support | ✅ Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 73%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 90 | `tmux-session-manager.test.ts` verifies create-or-attach args and connect status flow. |
| AC-02 | 75 | `terminal-ws.test.ts` validates ws→pty and pty→ws data piping. |
| AC-03 | 58 | Disconnect path tested; reconnect continuity during active command not directly exercised. |
| AC-04 | 52 | Multi-client test exists but validates spawn count only (F010). |
| AC-07 | 68 | Resize message handling (`pty.resize`) verified. |
| AC-11 | 66 | tmux unavailable fallback covered, but warning message text not asserted (F012). |
| AC-13 | 80 | Close cleanup (`pty.kill`) is covered; tmux-session survival is implicit. |

### E.5) Doctrine Compliance

- **F011 (MEDIUM)**: `R-CODE-002` naming convention (`I`-prefix for interfaces) is not followed in new terminal files.
- **F013 (LOW)**: `R-CODE-005` line-width rule violation at long `EADDRINUSE` log line.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | Terminal page creates/re-attaches tmux session for worktree | `TmuxSessionManager.spawnAttachedPty` tests + connect-path test | 90 |
| AC-02 | Command I/O is streamed in real time | ws message piping tests (`write`, `onData`) | 75 |
| AC-03 | Refresh/reconnect continuity | Cleanup tested; continuity under active command not directly tested | 58 |
| AC-04 | Multi-client same session behavior | Two-client test present but lacks observable output-sharing assertion | 52 |
| AC-07 | Resize updates terminal/tmux | JSON resize message test validates `pty.resize` call | 68 |
| AC-11 | tmux unavailable fallback warning | `tmux:false` status tested; warning text missing assertion | 66 |
| AC-13 | Closing overlay/client preserves tmux session | PTY cleanup path tested; session persistence inferred | 80 |

**Overall coverage confidence**: 73%

## G) Commands Executed

```bash
glob "docs/plans/064-tmux/**/*.md"
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -20
git --no-pager log --oneline -20 -- docs/plans/064-tmux/tasks/phase-1-sidecar-ws-server
git --no-pager diff --binary b115ecc..1700ab9 > docs/plans/064-tmux/reviews/_computed.diff
git --no-pager diff --name-status b115ecc..1700ab9
git --no-pager diff --numstat b115ecc..1700ab9
Subagent reviews (5 parallel task runs):
  - Implementation quality reviewer
  - Domain compliance validator
  - Anti-reinvention checker
  - Testing & evidence validator
  - Doctrine & rules validator
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md  
**Spec**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-spec.md  
**Phase**: Phase 1: Sidecar WebSocket Server + tmux Integration  
**Tasks dossier**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-1-sidecar-ws-server/tasks.md  
**Execution log**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-1-sidecar-ws-server/execution.log.md  
**Review file**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/reviews/review.phase-1-sidecar-ws-server.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/064-tmux/apps/web/next.config.mjs | Reviewed | shared | No |
| /Users/jordanknight/substrate/064-tmux/apps/web/package.json | Reviewed | shared | No |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/index.ts | Reviewed | terminal | Yes (F011) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts | Reviewed | terminal | Yes (F001,F002,F004,F011,F013) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/tmux-session-manager.ts | Reviewed | terminal | Yes (F003,F008,F011) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/types.ts | Reviewed | terminal | Yes (F006,F011) |
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-1-sidecar-ws-server/execution.log.md | Reviewed | docs | Yes (F009) |
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-1-sidecar-ws-server/tasks.fltplan.md | Reviewed | docs | No |
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-1-sidecar-ws-server/tasks.md | Reviewed | docs | Yes (F004,F010) |
| /Users/jordanknight/substrate/064-tmux/justfile | Reviewed | shared | No |
| /Users/jordanknight/substrate/064-tmux/package.json | Reviewed | shared | Yes (F005 manifest mapping) |
| /Users/jordanknight/substrate/064-tmux/pnpm-lock.yaml | Reviewed | shared | Yes (F005 manifest mapping) |
| /Users/jordanknight/substrate/064-tmux/test/fakes/fake-pty.ts | Reviewed | test | No |
| /Users/jordanknight/substrate/064-tmux/test/fakes/fake-tmux-executor.ts | Reviewed | test | Yes (F011) |
| /Users/jordanknight/substrate/064-tmux/test/fakes/index.ts | Reviewed | test | Yes (F005 manifest mapping) |
| /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/terminal-ws.test.ts | Reviewed | terminal/test | Yes (F010,F012) |
| /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/tmux-session-manager.test.ts | Reviewed | terminal/test | No |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts | Validate incoming `cwd` before PTY spawn | Prevent arbitrary directory access via WS query param (F001). |
| 2 | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts | Add spawn-path error containment and recoverable connection failure handling | Prevent sidecar instability/crash on spawn failures (F002). |
| 3 | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/tmux-session-manager.ts | Harden `validateCwd` boundary logic | Close prefix-bypass gap (F003). |
| 4 | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts + /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-1-sidecar-ws-server/tasks.md | Align implementation with approved multi-client contract (or update contract) | Remove scope drift and clarify behavior (F004/F010). |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md | Domain Manifest mapping for all changed files (F005). |
| /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md | Contracts table updates + required Concepts section (F006/F007). |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md --phase 'Phase 1: Sidecar WebSocket Server + tmux Integration'
