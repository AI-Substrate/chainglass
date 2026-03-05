# Fix Tasks: Phase 2: TerminalView Component (xterm.js Frontend)

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Add required Test Doc blocks to ConnectionStatusBadge tests
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/connection-status-badge.test.tsx
- **Issue**: `it(...)` cases do not contain required 5-field Test Doc blocks (R-TEST-002/R-TEST-003).
- **Fix**: Add Test Doc block to each test with fields: Why, Contract, Usage Notes, Quality Contribution, Worked Example.
- **Patch hint**:
  ```diff
   it('renders connected state without pulse', () => {
  +  /*
  +  Test Doc:
  +  - Why: Guard regression in status visualization for active WS sessions
  +  - Contract: status='connected' shows green dot and no pulse animation
  +  - Usage Notes: Render with status prop only; no reconnect handler required
  +  - Quality Contribution: Detects accidental class/config regressions
  +  - Worked Example: status='connected' => label 'Connected', class contains 'bg-green-500', no 'animate-pulse'
  +  */
      render(<ConnectionStatusBadge status="connected" />);
  ```

### FT-002: Add required Test Doc blocks to TerminalView/TerminalSkeleton tests
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/terminal-view.test.tsx
- **Issue**: Tests include narrative comments but not the required Test Doc structure.
- **Fix**: Add full 5-field Test Doc block to each `it(...)` block.
- **Patch hint**:
  ```diff
   it('exports TerminalView as a named export', async () => {
  +  /*
  +  Test Doc:
  +  - Why: Ensure public contract export remains stable for domain consumers
  +  - Contract: module exposes TerminalView named export as callable component
  +  - Usage Notes: Import module directly; avoid rendering xterm in jsdom
  +  - Quality Contribution: Catches accidental export removals/renames
  +  - Worked Example: import module => mod.TerminalView is defined and typeof === 'function'
  +  */
      const mod = await import('@/features/064-terminal/components/terminal-view');
  ```

### FT-003: Add hybrid-manual verification evidence for AC-02/AC-03/AC-07
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-2-terminal-view-component/execution.log.md
- **Issue**: No reproducible, concrete manual evidence for key runtime acceptance behaviors.
- **Fix**: Add a section with exact commands/steps and observed outcomes for:
  - AC-02 real-time I/O + ANSI output,
  - AC-03 refresh reconnect continuity,
  - AC-07 resize-to-server behavior.
- **Patch hint**:
  ```diff
  +## Manual verification evidence
  +
  +### AC-02
  +- Step: ...
  +- Observed: ...
  +
  +### AC-03
  +- Step: ...
  +- Observed: ...
  +
  +### AC-07
  +- Step: ...
  +- Observed: ...
  ```

## Medium / Low Fixes

### FT-004: Eliminate stale-socket reconnect race
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-socket.ts
- **Issue**: Older socket callbacks can mutate current connection state; manual reconnect can overlap queued reconnect timer.
- **Fix**:
  1. Clear `reconnectTimeoutRef` at start of `connect()` and `reconnect()`.
  2. Capture `const ws = new WebSocket(url)` and guard callbacks with `if (wsRef.current !== ws) return`.
  3. In `onclose`, only null `wsRef` if `wsRef.current === ws`.
- **Patch hint**:
  ```diff
   const connect = useCallback(() => {
  +  if (reconnectTimeoutRef.current) {
  +    clearTimeout(reconnectTimeoutRef.current);
  +    reconnectTimeoutRef.current = null;
  +  }
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onclose = (event) => {
  +    if (wsRef.current !== ws) return;
        wsRef.current = null;
  ```

### FT-005: Align terminal public API docs with exports
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md
  - /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/index.ts
- **Issue**: Public contract docs and barrel exports are drifting.
- **Fix**: Decide whether `ConnectionStatusBadge`, `TerminalSkeleton`, and `TerminalViewProps` are public contracts; then make docs and barrel consistent.
- **Patch hint**:
  ```diff
   ## Contracts (Public Interface)
  +| `ConnectionStatusBadge` | Component | Terminal header/page | Connection state indicator |
  +| `TerminalViewProps` | Type | Terminal consumers | Props contract for TerminalView |
  ```

### FT-006: Add AC traceability matrix
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-2-terminal-view-component/execution.log.md
- **Issue**: Claims are not mapped to AC IDs/evidence artifacts.
- **Fix**: Add AC table with confidence and artifact references.
- **Patch hint**:
  ```diff
  +## AC coverage map
  +| AC | Evidence | Confidence |
  +|----|----------|------------|
  +| AC-02 | ... | ... |
  ```

### FT-007: Bring docs in line with domain governance extras
- **Severity**: LOW
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md
  - /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md
- **Issue**: Missing Concepts section and incomplete Domain Manifest coverage for changed test files.
- **Fix**:
  1. Add `## Concepts` table to domain.md.
  2. Add missing changed test file entry to Domain Manifest.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
