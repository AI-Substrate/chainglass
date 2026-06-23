/**
 * `cg remote-view` command group (Plan 088 Phase 5 — T009).
 *
 * Drives the remote-view feature from the terminal (AC-8 CLI half): list / attach /
 * detach the streaming sessions by proxying the same NextAuth-gated routes the web
 * SDK + MCP use (T004/T005). Server discovery + auth follow the Plan 084 pattern:
 * `readServerInfo()` finds the running dev server's port, and `X-Local-Token` (read
 * from `.chainglass/server.json`) proves filesystem access to the gate.
 *
 * The verb handlers take an injectable `request` seam so they unit-test without a
 * live server; `createRemoteViewRequest()` builds the production one.
 *
 * Pattern: `agent.command.ts` (Commander group) + `event-popper-client.ts` (auth).
 * Per Finding 04 (one-line registry addition) + Finding 08 (CLI hits the proxy routes).
 */
import { join } from 'node:path';

import { findWorkspaceRoot } from '@chainglass/shared/auth-bootstrap-code';
import { readServerInfo } from '@chainglass/shared/event-popper';
import type { Command } from 'commander';

/** A live remote-view session row (mirrors the server `SessionSummary`). */
export interface RemoteViewSession {
  sessionId: string;
  windowId: number;
  app: string;
  title: string;
  state: string;
}

/** Injectable HTTP seam: `(method, path, body?) → parsed JSON`. Production is auth-wired below. */
export type RemoteViewRequest = (method: string, path: string, body?: unknown) => Promise<unknown>;

/**
 * Render an actionable CLI message for a failed remote-view request (Plan 088 Phase 6, T004 —
 * AC-14 CLI half). Named error codes from the route (`E_PERMISSION`, `E_BUNDLE_MISSING`) become a
 * message that names the exact host-Mac fix path instead of a bare HTTP status. Pure → unit-tested.
 */
export function formatRemoteViewError(
  status: number,
  body: { error?: string; message?: string } | null
): string {
  if (body?.error === 'E_PERMISSION') {
    return [
      `remote-view: ${body.message ?? 'a host-Mac permission is missing.'}`,
      'Grant it on the host Mac — System Settings → Privacy & Security → Screen Recording (and',
      'Accessibility for mouse/keyboard input) — then re-run. See docs/how/remote-view.md § Permissions.',
    ].join('\n');
  }
  if (body?.error === 'E_BUNDLE_MISSING') {
    return [
      `remote-view: ${body.message ?? 'the streamer bundle is not installed.'}`,
      'Install it on the host Mac with `just streamd-install`, then re-run. See docs/how/remote-view.md § Setup.',
    ].join('\n');
  }
  return `remote-view: request failed (HTTP ${status})${body?.message ? ` — ${body.message}` : ''}`;
}

/**
 * Build the production request — discover the dev server (cwd → workspace root →
 * legacy `apps/web`), then send `X-Local-Token` on every call. Throws an actionable
 * error if no running server is found.
 */
export function createRemoteViewRequest(opts: { worktreePath?: string } = {}): RemoteViewRequest {
  const cwd = opts.worktreePath ?? process.cwd();
  let workspaceRoot: string | undefined;
  try {
    workspaceRoot = findWorkspaceRoot(cwd);
  } catch {
    workspaceRoot = undefined;
  }
  const info =
    readServerInfo(cwd) ??
    (workspaceRoot !== undefined && workspaceRoot !== cwd ? readServerInfo(workspaceRoot) : null) ??
    readServerInfo(join(cwd, 'apps', 'web'));
  if (!info) {
    throw new Error(
      'remote-view: no running chainglass dev server found (.chainglass/server.json). Start `just dev` first.'
    );
  }
  const baseUrl = `http://localhost:${info.port}`;
  const localToken = info.localToken;

  return async (method, path, body) => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (localToken !== undefined) headers['X-Local-Token'] = localToken;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      // Surface the route's named error code (E_PERMISSION / E_BUNDLE_MISSING) + fix path (AC-14),
      // not a bare HTTP status — the route body carries `{ error, message }`.
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      throw new Error(formatRemoteViewError(res.status, body));
    }
    // DELETE proxies a 204 (no content) — tolerate an empty body.
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}

export async function handleRemoteViewList(request: RemoteViewRequest): Promise<void> {
  const { sessions } = (await request('GET', '/api/remote-view/sessions')) as {
    sessions: RemoteViewSession[];
  };
  console.log(JSON.stringify(sessions, null, 2));
}

export async function handleRemoteViewAttach(
  windowId: number,
  request: RemoteViewRequest
): Promise<void> {
  const summary = (await request('POST', '/api/remote-view/sessions', {
    windowId,
  })) as RemoteViewSession;
  console.log(JSON.stringify(summary, null, 2));
}

export async function handleRemoteViewDetach(
  sessionId: string,
  request: RemoteViewRequest
): Promise<void> {
  await request('DELETE', `/api/remote-view/sessions/${encodeURIComponent(sessionId)}`);
  console.log(JSON.stringify({ detached: sessionId }, null, 2));
}

/** Register the `remote-view` command group with the Commander program (wired in cg.ts). */
export function registerRemoteViewCommands(program: Command): void {
  const rv = program
    .command('remote-view')
    .description('Control remote app-window streaming sessions (list/attach/detach)');

  rv.command('list')
    .description('List active remote-view sessions')
    .option('--workspace-path <path>', 'Workspace path (defaults to cwd)')
    .action(async (opts: { workspacePath?: string }) => {
      try {
        await handleRemoteViewList(createRemoteViewRequest({ worktreePath: opts.workspacePath }));
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  rv.command('attach <windowId>')
    .description('Attach (stream) a host window by its CGWindowID')
    .option('--workspace-path <path>', 'Workspace path (defaults to cwd)')
    .action(async (windowId: string, opts: { workspacePath?: string }) => {
      try {
        const id = Number(windowId);
        if (!Number.isInteger(id) || id <= 0) {
          throw new Error(`remote-view: windowId must be a positive integer (got "${windowId}")`);
        }
        await handleRemoteViewAttach(
          id,
          createRemoteViewRequest({ worktreePath: opts.workspacePath })
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  rv.command('detach <sessionId>')
    .description('Detach a remote-view session')
    .option('--workspace-path <path>', 'Workspace path (defaults to cwd)')
    .action(async (sessionId: string, opts: { workspacePath?: string }) => {
      try {
        await handleRemoteViewDetach(
          sessionId,
          createRemoteViewRequest({ worktreePath: opts.workspacePath })
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
