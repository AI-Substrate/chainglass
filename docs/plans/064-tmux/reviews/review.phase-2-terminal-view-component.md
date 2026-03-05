# Code Review: Phase 2: TerminalView Component (xterm.js Frontend)

**Plan**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md
**Spec**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-spec.md
**Phase**: Phase 2: TerminalView Component (xterm.js Frontend)
**Date**: 2026-03-02
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

High-severity test doctrine and evidence gaps remain, and one medium-severity WebSocket lifecycle correctness risk should be addressed before approving.

**Key failure areas**:
- **Implementation**: WebSocket reconnect lifecycle can race between stale and current sockets.
- **Domain compliance**: Terminal domain contract docs are out of sync with Phase 2 public exports.
- **Testing**: Hybrid strategy requires concrete manual evidence for AC-02/AC-03/AC-07; current evidence is mostly narrative.
- **Doctrine**: New tests do not include the required 5-field Test Doc blocks from project rules.

## B) Summary

Phase 2 implementation is generally strong and in-scope: xterm integration, dynamic import, resize handling, and theme synchronization are all present and coherent. Domain topology remains valid (no cross-domain import direction violations or map-edge labeling issues), and anti-reinvention analysis found no genuine duplication. The largest gaps are process/doctrine quality (mandatory test documentation format) and evidence quality for the hybrid testing strategy. A targeted fix pass should be sufficient to move this phase to approval.

## C) Checklist

**Testing Approach: Hybrid**

- [ ] Backend/TDD-critical behaviors have executable proof
- [ ] Frontend lightweight checks cover core user-visible paths
- [ ] Manual verification steps are documented with observed outcomes for AC-02/AC-03/AC-07
- [ ] Acceptance criteria are traceable to concrete evidence artifacts

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/connection-status-badge.test.tsx:6-40 | doctrine | Tests missing required 5-field Test Doc blocks (R-TEST-002/R-TEST-003). | Add full Test Doc block to each `it(...)`. |
| F002 | HIGH | /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/terminal-view.test.tsx:10-39 | doctrine | Tests missing required 5-field Test Doc blocks (R-TEST-002/R-TEST-003). | Add full Test Doc block to each `it(...)`. |
| F003 | HIGH | /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-2-terminal-view-component/execution.log.md:30-35 | testing | Hybrid strategy evidence lacks reproducible manual verification for AC-02/AC-03/AC-07. | Add command-level manual verification evidence with observed outcomes. |
| F004 | MEDIUM | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-socket.ts:54-61,107-120,147-149 | correctness | Reconnect lifecycle can race (stale socket onclose can clobber active socket state); manual reconnect does not clear pending auto-reconnect timer. | Guard handlers with socket identity and clear pending timer before reconnect. |
| F005 | MEDIUM | /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-2-terminal-view-component/execution.log.md:10-35 | testing | Evidence is mostly structural/lightweight and does not verify reconnect backoff or resize message outcomes in executable form. | Add focused tests (or documented manual proof) for reconnect transitions and resize payload behavior. |
| F006 | MEDIUM | /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md:34-58 | domain | Phase 2 barrel exports changed, but domain contract/composition docs are not fully synchronized. | Update `## Contracts`/`## Composition` to match public surface or reduce exports. |
| F007 | MEDIUM | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/connection-status-badge.tsx:9-19; /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-inner.tsx:63-75; /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-view.tsx:13-25; /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-socket.ts:9-30 | doctrine | Interface names do not use required `I` prefix (R-CODE-002). | Rename interfaces to `I*` (or align with a documented project exception). |
| F008 | LOW | /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md:25-64 | domain | Domain Manifest does not list one changed Phase 2 test file (`connection-status-badge.test.tsx`). | Add missing test file to Domain Manifest or explicitly mark it as excluded. |
| F009 | LOW | /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md:1-111 | domain | Domain has contracts but no `## Concepts` section/table. | Add Concepts table (`Concept | Entry Point | What It Does`). |
| F010 | LOW | /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-2-terminal-view-component/execution.log.md:30-35 | testing | No AC-tagged evidence matrix in execution log. | Add AC-to-evidence mapping table. |
| F011 | LOW | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/connection-status-badge.tsx:15; /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-inner.tsx:70; /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-view.tsx:20; /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-skeleton.tsx:3 | doctrine | Exported component functions lack explicit return types (R-CODE-001). | Add explicit return types for exported component functions. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F004 (MEDIUM)**: `use-terminal-socket` reconnect logic can race if an older socket's `onclose` runs after a new socket is assigned; state may be incorrectly forced to disconnected and `wsRef` nulled.
- **Scope**: Phase changes are largely in-scope for Phase 2, with one additional modified backend file (`terminal-ws.ts`) carried in the phase commit.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New terminal files are under `apps/web/src/features/064-terminal/` and tests under `test/unit/web/features/064-terminal/`. |
| Contract-only imports | ✅ | No cross-domain internal import violations identified in this phase diff. |
| Dependency direction | ✅ | No infrastructure→business inversion found. |
| Domain.md updated | ❌ | `docs/domains/terminal/domain.md` not fully synchronized with Phase 2 public export surface. |
| Registry current | ✅ | `docs/domains/registry.md` includes `terminal` domain. |
| No orphan files | ❌ | One changed test file is missing from plan Domain Manifest (`connection-status-badge.test.tsx`). |
| Map nodes current | ✅ | `terminal` node exists in domain map and health summary. |
| Map edges current | ✅ | Terminal dependency edges exist and are contract-labeled. |
| No circular business deps | ✅ | No business-domain cycle introduced by Phase 2 changes. |
| Concepts documented | ⚠️ | `terminal/domain.md` has no `## Concepts` section/table yet. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| terminal-inner | None | None | proceed |
| terminal-view | None | None | proceed |
| terminal-skeleton | None | None | proceed |
| connection-status-badge | None | None | proceed |
| use-terminal-socket | None | None | proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 42%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 25 | Component/module artifacts exist, but route-level create/attach behavior is not demonstrated in Phase 2 evidence. |
| AC-02 | 55 | Implementation and task log describe real-time I/O wiring; no concrete runtime transcript in artifacts. |
| AC-03 | 40 | Reconnect/backoff logic is implemented, but refresh-reconnect scenario evidence is missing. |
| AC-04 | 20 | No phase evidence demonstrates multi-client shared-session behavior. |
| AC-07 | 50 | Resize flow implemented (`ResizeObserver` + `resize` message), but no proof of tmux-side effect in evidence. |
| AC-13 | 35 | Cleanup logic exists, but overlay close semantics are out-of-phase and not evidenced here. |

### E.5) Doctrine Compliance

- **F001/F002 (HIGH)**: Missing required Test Doc format in new tests (R-TEST-002/R-TEST-003).
- **F007 (MEDIUM)**: Interface naming convention violations (`I*` prefix requirement).
- **F011 (LOW)**: Explicit return type requirement for exported APIs not met in several components.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | Terminal page auto-create/reattach session | Task descriptions + component exports only; no route-level verification in this phase | 25 |
| AC-02 | Real-time terminal I/O with ANSI output | `terminal-inner.tsx` wiring + execution log narrative | 55 |
| AC-03 | Refresh reconnect preserves running command | `use-terminal-socket.ts` backoff/reconnect logic + execution log narrative | 40 |
| AC-04 | Multi-client shared session | Architectural support only; no direct Phase 2 evidence | 20 |
| AC-07 | Resize refit + tmux resize notification | ResizeObserver + `resize` payload emission in `terminal-inner.tsx` | 50 |
| AC-13 | Close overlay closes WS/PTY, tmux survives | Cleanup behavior partially relevant; full overlay behavior belongs to later phase | 35 |

**Overall coverage confidence**: 42%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -15
git --no-pager diff 5a92657..HEAD > /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/reviews/_computed.diff
git --no-pager diff --name-status 5a92657..HEAD
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md
**Spec**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-spec.md
**Phase**: Phase 2: TerminalView Component (xterm.js Frontend)
**Tasks dossier**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-2-terminal-view-component/tasks.md
**Execution log**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-2-terminal-view-component/execution.log.md
**Review file**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/reviews/review.phase-2-terminal-view-component.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/connection-status-badge.tsx | created | terminal | Yes (F007, F011) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-inner.tsx | created | terminal | Yes (F004, F007, F011) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-skeleton.tsx | created | terminal | Yes (F011) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-view.tsx | created | terminal | Yes (F007, F011) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-socket.ts | created | terminal | Yes (F004, F007) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/index.ts | modified | terminal | Yes (F006 alignment decision) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts | modified | terminal | No |
| /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md | modified | terminal-docs | Yes (F006, F009) |
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-2-terminal-view-component/execution.log.md | created | planning-artifact | Yes (F003, F005, F010) |
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-2-terminal-view-component/tasks.fltplan.md | created | planning-artifact | No |
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-2-terminal-view-component/tasks.md | created | planning-artifact | No |
| /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/connection-status-badge.test.tsx | created | terminal-test | Yes (F001) |
| /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/terminal-view.test.tsx | created | terminal-test | Yes (F002) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/connection-status-badge.test.tsx | Add 5-field Test Doc block to each test case | Required by R-TEST-002/R-TEST-003 (HIGH) |
| 2 | /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/terminal-view.test.tsx | Add 5-field Test Doc block to each test case | Required by R-TEST-002/R-TEST-003 (HIGH) |
| 3 | /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-2-terminal-view-component/execution.log.md | Add concrete manual evidence for AC-02/AC-03/AC-07 and AC traceability matrix | Hybrid evidence gap (HIGH/LOW) |
| 4 | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-socket.ts | Harden reconnect lifecycle against stale-socket race and timer overlap | Correctness risk (MEDIUM) |
| 5 | /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md and /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/index.ts | Align documented contracts/composition with actual public exports | Domain doc drift (MEDIUM) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md | Contract/composition sync + Concepts table |
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md | Domain Manifest coverage for changed test file |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md --phase 'Phase 2: TerminalView Component (xterm.js Frontend)'
