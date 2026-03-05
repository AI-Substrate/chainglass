# Fix Tasks: Phase 1: Sidecar WebSocket Server + tmux Integration

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Validate WebSocket `cwd` before PTY spawn
- **Severity**: HIGH
- **File(s)**:  
  - /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts  
  - /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/tmux-session-manager.ts
- **Issue**: `cwd` from query params is accepted without validation and passed into PTY spawn.
- **Fix**: Define allowed base path for terminal access, validate requested `cwd` via hardened path check, reject invalid paths with explicit error message + close code.
- **Patch hint**:
  ```diff
  - const cwd = url.searchParams.get('cwd') ?? process.cwd();
  + const cwd = url.searchParams.get('cwd') ?? process.cwd();
  + const allowedBase = process.cwd();
  + if (!manager.validateCwd(cwd, allowedBase)) {
  +   ws.send(JSON.stringify({ type: 'error', message: 'Invalid working directory' }));
  +   ws.close(4400, 'Invalid cwd');
  +   return;
  + }
  ```

### FT-002: Guard PTY spawn failures in connection flow
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts
- **Issue**: Exceptions thrown by `spawnAttachedPty` / `spawnRawShell` are unhandled.
- **Fix**: Wrap spawn path in `try/catch`; on failure send structured status/error payload, close socket with server-error code, and continue serving other clients.
- **Patch hint**:
  ```diff
  - if (tmuxAvailable) {
  -   pty = manager.spawnAttachedPty(sessionName, cwd, 80, 24);
  -   ws.send(JSON.stringify({ type: 'status', status: 'connected', tmux: true }));
  - } else {
  -   pty = manager.spawnRawShell(cwd, 80, 24);
  -   ws.send(JSON.stringify({ ... }));
  - }
  + try {
  +   if (tmuxAvailable) {
  +     pty = manager.spawnAttachedPty(sessionName, cwd, 80, 24);
  +     ws.send(JSON.stringify({ type: 'status', status: 'connected', tmux: true }));
  +   } else {
  +     pty = manager.spawnRawShell(cwd, 80, 24);
  +     ws.send(JSON.stringify({ ... }));
  +   }
  + } catch (error) {
  +   ws.send(JSON.stringify({ type: 'error', message: 'Failed to start terminal process' }));
  +   ws.close(1011, 'PTY spawn failed');
  +   return;
  + }
  ```

## Medium / Low Fixes

### FT-003: Harden `validateCwd` boundary checking
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/tmux-session-manager.ts
- **Issue**: Prefix matching (`startsWith`) can be bypassed by sibling path prefixes.
- **Fix**: Use boundary-safe relative-path validation.
- **Patch hint**:
  ```diff
  - return resolved.startsWith(resolvedBase);
  + const rel = relative(resolvedBase, resolved);
  + return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  ```

### FT-004: Align multi-client behavior with phase contract
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts
  - /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/terminal-ws.test.ts
  - /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-1-sidecar-ws-server/tasks.md
- **Issue**: Task dossier specifies shared-PTY map semantics; implementation uses PTY-per-client.
- **Fix**: Either implement shared-PTY session map and last-client cleanup, or explicitly amend tasks doc and tests to approved per-client model.
- **Patch hint**:
  ```diff
  - const activePtys = new Set<PtyProcess>();
  + const sessions = new Map<string, { pty: PtyProcess; clients: Set<WebSocket> }>();
  ```

### FT-005: Complete Domain Manifest coverage for changed files
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md
- **Issue**: Missing manifest mapping for changed root/package/test/docs files.
- **Fix**: Add rows for `/package.json`, `/pnpm-lock.yaml`, `/test/fakes/index.ts`, and phase artifact docs (or an explicit exclusion policy).

### FT-006: Update terminal domain contracts + Concepts section
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md
- **Issue**: Public exports in `index.ts` exceed documented contracts; `Concepts` table missing.
- **Fix**: Add missing contracts and add `## Concepts` table (`Concept | Entry Point | What It Does`) for terminal protocol/components.

### FT-007: Reuse or align with shared session ID validation
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/tmux-session-manager.ts
  - /Users/jordanknight/substrate/064-tmux/packages/shared/src/lib/validators/session-id-validator.ts
- **Issue**: Duplicate validation logic for session names.
- **Fix**: Reuse shared validator directly, or document intentional divergence and enforce parity tests.

### FT-008: Improve TDD evidence quality in execution log
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-1-sidecar-ws-server/execution.log.md
- **Issue**: No RED→GREEN proof for T005/T006 despite TDD requirement.
- **Fix**: Add command/output snippets showing initial failing test and final passing run for each TDD task.

### FT-009: Strengthen AC evidence tests
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/terminal-ws.test.ts
- **Issue**: Multi-client behavior and fallback warning semantics are weakly asserted.
- **Fix**: Add assertions for cross-client observable behavior and fallback warning text payload.

### FT-010: Resolve doctrine violations or document variance
- **Severity**: LOW
- **File(s)**:
  - /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/types.ts
  - /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts
  - /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/tmux-session-manager.ts
  - /Users/jordanknight/substrate/064-tmux/test/fakes/fake-tmux-executor.ts
- **Issue**: `R-CODE-002` interface naming and one `R-CODE-005` line-width issue.
- **Fix**: Rename interfaces to `I*` and wrap long lines, or capture approved project-rules variance.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
