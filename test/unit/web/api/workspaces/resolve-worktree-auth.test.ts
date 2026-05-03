/**
 * @vitest-environment node
 *
 * Plan 084 Phase 5 post-review F001 + F002 — workflow execution auth path.
 *
 * Closes the test-coverage gap the minih code-review agent flagged: Phase 5
 * relocated `.chainglass/server.json` to `findWorkspaceRoot(process.cwd())`
 * (paired with `bootstrap-code.json` per FX003), and `_resolve-worktree.ts`
 * had to mirror the new fallback chain (cwd → workspace root) so CLI
 * `X-Local-Token` keeps working.
 *
 * Scope: only the TOKEN-acceptance branch is exercised here. Token-rejection
 * paths (wrong bytes, wrong length, missing token) fall through to NextAuth's
 * `auth()` which requires a Next request scope — those rejection cases are
 * already covered with full coverage by `test/unit/web/lib/local-auth.test.ts`
 * (the helper Phase 5 introduced shares the same crypto + length pre-check).
 *
 * Constitution P4 — real fs, no `vi.mock`. Real server.json, real cwd, real
 * timing-safe compare via Node crypto.
 */
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { writeServerInfo } from '@chainglass/shared/event-popper';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const LOCAL_TOKEN = 'workflow-tok-1234567890abcdef-stable';

describe('authenticateRequest token path (Phase 5 post-review F001/F002)', () => {
  let cwd: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    // Build a workspace-root structure: <cwd>/pnpm-workspace.yaml + apps/web subdir.
    cwd = mkdtempSync(join(tmpdir(), 'workflow-auth-'));
    writeFileSync(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n');
    mkdirSync(join(cwd, 'apps', 'web'), { recursive: true });
    process.chdir(cwd);
    vi.resetModules();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(cwd, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function reqWithToken(token: string): Request {
    return new Request('http://localhost:3000/api/workspaces/test/workflows/g/execution/run', {
      method: 'POST',
      headers: { 'X-Local-Token': token },
    });
  }

  it('accepts X-Local-Token when server.json lives at workspace root (Phase 5 canonical location, F001 fix)', async () => {
    // Phase 5 instrumentation writes here (post-F002 fix).
    writeServerInfo(cwd, {
      port: 3000,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      localToken: LOCAL_TOKEN,
    });
    // Deeper cwd — simulates `pnpm dev` running Next at apps/web/.
    process.chdir(join(cwd, 'apps', 'web'));

    const { authenticateRequest } = await import(
      '../../../../../apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/execution/_resolve-worktree'
    );
    const result = await authenticateRequest(reqWithToken(LOCAL_TOKEN));
    expect(result).toEqual({ authenticated: true });
  });

  it('still works when server.json lives at cwd (back-compat for non-relocated launches)', async () => {
    // Pre-F002 launch shape: server.json at process.cwd() (apps/web).
    const appsWeb = join(cwd, 'apps', 'web');
    writeServerInfo(appsWeb, {
      port: 3000,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      localToken: LOCAL_TOKEN,
    });
    process.chdir(appsWeb);

    const { authenticateRequest } = await import(
      '../../../../../apps/web/app/api/workspaces/[slug]/workflows/[graphSlug]/execution/_resolve-worktree'
    );
    const result = await authenticateRequest(reqWithToken(LOCAL_TOKEN));
    expect(result).toEqual({ authenticated: true });
  });
});
