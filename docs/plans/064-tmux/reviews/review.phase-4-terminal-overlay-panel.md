# Code Review: Phase 4: Terminal Overlay Panel (Surface 2)

**Plan**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md  
**Spec**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-spec.md  
**Phase**: Phase 4: Terminal Overlay Panel (Surface 2)  
**Date**: 2026-03-03  
**Reviewer**: Automated (plan-7-v2)  
**Testing Approach**: Hybrid (phase evidence currently Manual-only)

## A) Verdict

**REQUEST_CHANGES**

High-severity issues are unmitigated in correctness, domain contract usage, and verification evidence.

**Key failure areas**:
- **Implementation**: Overlay toggle can reopen against stale prior-worktree session/CWD.
- **Domain compliance**: Workspace wrapper imports terminal internals directly instead of terminal domain contracts.
- **Testing**: AC-06 and AC-13 are not verified by runtime evidence; execution log is effectively empty.
- **Doctrine**: Project testing rules require stronger verification artifacts for implemented behavior.

## B) Summary

The phase implementation is close to target behavior and correctly wires provider, layout, command, and sidebar entry points. However, the state resolution logic in `use-terminal-overlay.tsx` can reconnect to an outdated worktree session after navigation, which is a correctness risk for workspace-scoped terminals. Domain boundaries are partially bypassed by deep internal imports from route-layer code, and verification evidence for persistence and close behavior (AC-06/AC-13) is missing in `execution.log.md`. Reinvention risk is low: new overlay components are mostly domain-appropriate and not duplicating existing domain capabilities.

## C) Checklist

**Testing Approach: Hybrid**

- [ ] Core validation tests present for critical overlay state transitions
- [ ] Manual verification steps documented for persistence/close behavior
- [ ] Manual observed outcomes recorded with concrete evidence
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (or outputs captured)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx:45-66 | correctness | `toggleTerminal()` prefers stale stored session/cwd over current URL worktree when reopening. | Resolve session/cwd from current URL first on open, or clear stale values on close/worktree change. |
| F002 | HIGH | /Users/jordanknight/substrate/064-tmux/apps/web/app/(dashboard)/workspaces/[slug]/terminal-overlay-wrapper.tsx:5-12 | contract-imports | Route-layer wrapper deep-imports terminal internals instead of terminal public contract. | Import `TerminalOverlayProvider` and `TerminalOverlayPanel` from `@/features/064-terminal` barrel. |
| F003 | HIGH | /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-4-terminal-overlay-panel/execution.log.md:1-9 | testing | No concrete evidence for AC-06/AC-13; manual verification task remains incomplete. | Execute and log timestamped verification for persistence, close, reconnect, and tmux survival. |
| F004 | MEDIUM | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx:60 | scope | Overlay width diverges from phase target (480px) and uses `min(60vw, 900px)`. | Align width with planned 480px or update plan/spec intentionally. |
| F005 | MEDIUM | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx:8,83-89 | performance | Overlay renders `TerminalInner` directly, bypassing lazy `TerminalView` wrapper. | Render `TerminalView` to retain dynamic loading behavior for xterm.js code. |
| F006 | MEDIUM | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx:81-97 | performance | 500ms polling interval runs continuously for route checks. | Replace interval polling with route-aware updates (`usePathname`/`useSearchParams` or equivalent event source). |
| F007 | MEDIUM | /Users/jordanknight/substrate/064-tmux/apps/web/src/components/dashboard-sidebar.tsx:251 | pattern | Sidebar emits `terminal:toggle` directly rather than invoking registered SDK command path. | Route sidebar toggle through `terminal.toggleOverlay` command execution. |
| F008 | MEDIUM | /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md:57,118-125 | domain-md | Terminal domain doc history/composition are not current for this phase’s actual wiring details. | Update History and composition/contracts to match implemented overlay flow and consumers. |
| F009 | LOW | /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md:25-64 | orphan | New `terminal-overlay-wrapper.tsx` is not represented in phase/domain manifest scope. | Add manifest mapping for wrapper or refactor to avoid undeclared surface addition. |
| F010 | LOW | /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md:108-117 | concepts-docs | Concepts table omits explicit overlay toggle bridge/persistence concepts added in this phase. | Add concepts rows for overlay toggle bridge and persistence lifecycle semantics. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: `toggleTerminal()` currently prioritizes previously stored `sessionName/cwd` before deriving from current URL worktree, which can reconnect to prior workspace session after navigation.
- **F004 (MEDIUM)**: Panel width does not match phase acceptance target (480px).
- **F005 (MEDIUM)**: Direct `TerminalInner` usage bypasses established dynamic-load contract (`TerminalView`).
- **F006 (MEDIUM)**: Interval-based route polling introduces avoidable background work.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | `/workspaces/[slug]/terminal-overlay-wrapper.tsx` introduces terminal composition in route layer rather than terminal domain contract surface. |
| Contract-only imports | ❌ | Wrapper uses deep imports into terminal internals instead of barrel contract. |
| Dependency direction | ❌ | Shared sidebar sends raw `terminal:toggle` event path instead of SDK command contract path. |
| Domain.md updated | ❌ | `docs/domains/terminal/domain.md` lacks Phase 4 history update and has stale composition wording. |
| Registry current | ✅ | `docs/domains/registry.md` already includes `terminal` domain and remains valid. |
| No orphan files | ❌ | New wrapper file not declared in plan domain manifest scope. |
| Map nodes current | ✅ | `terminal` node present in `docs/domains/domain-map.md`. |
| Map edges current | ✅ | Domain map edges are labeled and terminal dependencies are represented. |
| No circular business deps | ✅ | No new business-domain cycle observed in map/changes. |
| Concepts documented | ⚠️ | Concepts section exists, but overlay toggle bridge/persistence concept details are incomplete. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| TerminalOverlayProvider / `useTerminalOverlay` | `SidebarProvider/useSidebar` pattern in shared UI (conceptual) | shared-ui | Proceed (no blocking duplication) |
| TerminalOverlayPanel | `SheetContent` in shared UI (conceptual container overlap) | shared-ui | Extend candidate (optional), no duplication blocker |
| TerminalOverlayWrapper | `workspace-attention-wrapper` (composition pattern) | file-browser | Proceed (pattern reuse, no duplication) |

### E.4) Testing & Evidence

**Coverage confidence**: 26%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-05 | 58% | Command/keybinding/sidebar/provider wiring exists in code diff; no runtime verification logged. |
| AC-06 | 30% | Layout-level placement supports persistence structurally; no navigation evidence recorded. |
| AC-13 | 24% | Close paths exist (Escape/X/unmount path), but no evidence proving WS/PTy/tmux lifecycle outcomes. |

### E.5) Doctrine Compliance

Rules documents exist under `/Users/jordanknight/substrate/064-tmux/docs/project-rules/`. The material doctrine gap is verification quality against testing rules (`R-TEST-001` and quality-gate expectations), captured in **F003**.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-05 | Ctrl+`/button opens right-edge overlay connected to worktree tmux session | SDK command + keybinding + sidebar trigger + provider listener found in diff | 58% |
| AC-06 | Overlay persists across workspace page navigation | Overlay wrapper added at workspace layout level | 30% |
| AC-13 | Closing overlay disconnects WS/PTy while tmux session survives | Close handlers and unmount flow present; no execution evidence | 24% |

**Overall coverage confidence**: 26%

## G) Commands Executed

```bash
cd /Users/jordanknight/substrate/064-tmux && git --no-pager diff --stat
cd /Users/jordanknight/substrate/064-tmux && git --no-pager diff --staged --stat
cd /Users/jordanknight/substrate/064-tmux && git --no-pager status --short
cd /Users/jordanknight/substrate/064-tmux && git --no-pager log --pretty=format:'%h %ad %s' --date=short -30
cd /Users/jordanknight/substrate/064-tmux && git --no-pager diff --name-status 694a16e..HEAD
cd /Users/jordanknight/substrate/064-tmux && git --no-pager diff 694a16e..HEAD > /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/reviews/_computed.diff
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md  
**Spec**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-spec.md  
**Phase**: Phase 4: Terminal Overlay Panel (Surface 2)  
**Tasks dossier**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-4-terminal-overlay-panel/tasks.md  
**Execution log**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-4-terminal-overlay-panel/execution.log.md  
**Review file**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/reviews/review.phase-4-terminal-overlay-panel.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx | modified | terminal | Yes (F001, F006) |
| /Users/jordanknight/substrate/064-tmux/apps/web/app/(dashboard)/workspaces/[slug]/terminal-overlay-wrapper.tsx | added | shared/terminal boundary | Yes (F002) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-overlay-panel.tsx | added | terminal | Yes (F004, F005) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/components/dashboard-sidebar.tsx | modified | shared | Yes (F007) |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/lib/sdk/sdk-bootstrap.ts | modified | _platform/sdk | Verify no change required after F007 |
| /Users/jordanknight/substrate/064-tmux/apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx | modified | shared | Verify after wrapper import path adjustments |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-inner.tsx | modified | terminal | No |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-view.tsx | modified | terminal | Potentially for F005 alignment |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-socket.ts | modified | terminal | No |
| /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/index.ts | modified | terminal | Use for F002 contract-import alignment |
| /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md | unchanged in phase diff | terminal docs | Yes (F008, F010) |
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-4-terminal-overlay-panel/execution.log.md | added | phase artifact | Yes (F003) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-overlay.tsx | Fix session/cwd resolution order and stale-state behavior on reopen | Prevent connecting to wrong worktree session (F001) |
| 2 | /Users/jordanknight/substrate/064-tmux/apps/web/app/(dashboard)/workspaces/[slug]/terminal-overlay-wrapper.tsx | Replace deep imports with terminal domain barrel contract imports | Restore domain contract boundary (F002) |
| 3 | /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-4-terminal-overlay-panel/execution.log.md | Add concrete AC-05/06/13 verification evidence with observed outcomes | Current coverage confidence is too low for approval (F003) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md | Phase 4 history entry, updated composition/consumer description, overlay concepts rows |
| /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md | Domain manifest entry for new `terminal-overlay-wrapper.tsx` (or remove wrapper file) |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md --phase "Phase 4: Terminal Overlay Panel (Surface 2)"
