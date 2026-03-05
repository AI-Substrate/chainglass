# Fix Tasks: Phase 3: Terminal Page (Surface 1)

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Revert insecure WS default bind
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/terminal-ws.ts
- **Issue**: Terminal WebSocket server default bind moved from localhost to all interfaces (`0.0.0.0`) without auth/origin controls.
- **Fix**: Restore `127.0.0.1` as secure default; if remote bind is needed, gate behind explicit env opt-in and pair with access controls.
- **Patch hint**:
  ```diff
  - wss = new WebSocketServer({ port, host: '0.0.0.0' });
  - console.log(`Terminal WS server listening on ws://0.0.0.0:${port}/terminal`);
  + const host = process.env.TERMINAL_WS_HOST ?? '127.0.0.1';
  + wss = new WebSocketServer({ port, host });
  + console.log(`Terminal WS server listening on ws://${host}:${port}/terminal`);
  ```

### FT-002: Enforce contract-only cross-domain import
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-page-client.tsx
- **Issue**: Imports `LeftPanelMode` from `_platform/panel-layout/components/left-panel` (internal path).
- **Fix**: Import `LeftPanelMode` from public barrel export `@/features/_platform/panel-layout`.
- **Patch hint**:
  ```diff
  - import type { LeftPanelMode } from '@/features/_platform/panel-layout/components/left-panel';
  + import type { LeftPanelMode } from '@/features/_platform/panel-layout';
  ```

## Medium / Low Fixes

### FT-003: Wire `session` query contract into page flow
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/064-tmux/apps/web/app/(dashboard)/workspaces/[slug]/terminal/page.tsx; /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-page-client.tsx; /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-sessions.ts
- **Issue**: `terminal.params.ts` defines `session`, but route/client flow ignores it.
- **Fix**: Parse `session` in page route and pass as initial selected session to client/hook; keep URL and selection in sync.
- **Patch hint**:
  ```diff
  + const initialSession =
  +   typeof searchParamsResolved.session === 'string' ? searchParamsResolved.session : '';
  - <TerminalPageClient slug={slug} worktreePath={worktreePath} worktreeBranch={worktreeBranch} />
  + <TerminalPageClient
  +   slug={slug}
  +   worktreePath={worktreePath}
  +   worktreeBranch={worktreeBranch}
  +   initialSession={initialSession}
  + />
  ```

### FT-004: Complete session create/select contract (or explicitly descope)
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/hooks/use-terminal-sessions.ts; /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/components/terminal-session-list.tsx; /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-3-terminal-page-surface-1/tasks.md
- **Issue**: Tasks specify create/select actions, but implementation only supports select/refresh.
- **Fix**: Add `createSession` action + UI trigger (preferred), or update task dossier to reflect intentional no-create scope.
- **Patch hint**:
  ```diff
  + interface UseTerminalSessionsReturn {
  +   createSession: (name: string) => Promise<void>;
  + }
  ...
  - onRefresh: () => void;
  + onRefresh: () => void;
  + onCreate: () => void;
  ```

### FT-005: Remove duplicated session-listing logic in route
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/064-tmux/apps/web/app/api/terminal/route.ts; /Users/jordanknight/substrate/064-tmux/apps/web/src/features/064-terminal/server/tmux-session-manager.ts
- **Issue**: API route directly shells out/parses sessions while equivalent capability exists in terminal server domain.
- **Fix**: Route should delegate to a reusable terminal service abstraction (DI-resolved where applicable) and avoid inline shell parsing duplication.
- **Patch hint**:
  ```diff
  - const output = execSync('tmux list-sessions ...');
  - const sessions = output.split('\n').map(...)
  + const terminalService = container.resolve(DI_TOKENS.TERMINAL_SERVICE);
  + const sessions = await terminalService.listSessions();
  ```

### FT-006: Sync domain governance artifacts with actual phase files
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tmux-plan.md; /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md; /Users/jordanknight/substrate/064-tmux/docs/domains/domain-map.md
- **Issue**: Manifest/source/map summary drift (missing API route ownership, stale route prefixes, stale consumers/providers summary).
- **Fix**: Update all three docs so file inventory, ownership, and dependency summaries match current code and map labels.
- **Patch hint**:
  ```diff
  + | `apps/web/app/api/terminal/route.ts` | terminal | internal | Session-list API for terminal page hook |
  - | _platform/workspace-url | workspaceHref, paramsCaches | file-browser, panel-layout | — | — | ✅ |
  + | _platform/workspace-url | workspaceHref, paramsCaches | file-browser, panel-layout, terminal | — | — | ✅ |
  ```

### FT-007: Upgrade evidence quality and AC traceability
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-3-terminal-page-surface-1/execution.log.md; /Users/jordanknight/substrate/064-tmux/test/unit/web/features/064-terminal/terminal-session-list.test.tsx
- **Issue**: Execution log claims pass counts without command output; AC-01/07/08/10/12 evidence is partial.
- **Fix**: Record exact commands + outputs (or CI links) and add focused tests/manual checks for unverified ACs.
- **Patch hint**:
  ```diff
  + ## Verification Commands
  + pnpm vitest test/unit/web/features/064-terminal/terminal-session-list.test.tsx
  + pnpm vitest test/unit/web/features/064-terminal/use-terminal-sessions.test.tsx
  + # attach output snippet / CI URL
  ```

### FT-008: Fix minor phase-doc synchronization drift
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-3-terminal-page-surface-1/tasks.md; /Users/jordanknight/substrate/064-tmux/docs/plans/064-tmux/tasks/phase-3-terminal-page-surface-1/tasks.fltplan.md; /Users/jordanknight/substrate/064-tmux/docs/domains/terminal/domain.md
- **Issue**: DYK endpoint path mismatch, stage status mismatch, missing `terminalParams` concept entry.
- **Fix**: Align endpoint text with implementation, mark stages consistently, and add missing concept row.
- **Patch hint**:
  ```diff
  - Add Next.js API route at `/api/terminal/sessions`
  + Add Next.js API route at `/api/terminal`
  ...
  - [~] Stage 5
  - [ ] Stage 6
  + [x] Stage 5
  + [x] Stage 6
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
