/**
 * Remote-view MCP tools (Plan 088 Phase 5 — T010).
 *
 * The agent-surface MCP half of AC-8: `remote_view_list / remote_view_attach /
 * remote_view_detach` mirror the `cg remote-view` CLI verbs (T009) by proxying the
 * SAME NextAuth-or-local-token-gated routes (`/api/remote-view/sessions`, T005). The
 * MCP server is a separate process, so — exactly like the CLI — it discovers the
 * running dev server with `readServerInfo()` and proves filesystem access with the
 * `X-Local-Token` header (Plan 084; accepted by the F004 `requireRemoteViewAccess`
 * gate).
 *
 * The request layer is a deliberate parallel of `apps/cli/src/commands/remote-view.command.ts`
 * (a package cannot import an app, and the repo's MCP tools — see `workflow.tools.ts`
 * — wire their own deps inline rather than sharing with the CLI). Folding both onto a
 * shared `@chainglass/shared` helper is a viable future cleanup; kept inline here to
 * avoid destabilising the shipped CLI on the phase's final task.
 *
 * Per ADR-0001: verb_object names, 3-4 sentence descriptions, Zod input schema, the
 * four annotation hints, and a `summary` field in every response. Handlers take an
 * injectable `request` seam so they unit-test without a live server (mirrors T009).
 *
 * Pattern: `workflow.tools.ts` (registration) + `remote-view.command.ts` (request seam).
 */
import { join } from 'node:path';

import type { ILogger } from '@chainglass/shared';
import { findWorkspaceRoot } from '@chainglass/shared/auth-bootstrap-code';
import { readServerInfo } from '@chainglass/shared/event-popper';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RegisteredToolInfo } from '../server.js';

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
 * Build the production request — discover the dev server (cwd → workspace root →
 * legacy `apps/web`), then send `X-Local-Token` on every call. Throws an actionable
 * error if no running server is found (surfaced to the agent as an `isError` result).
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
      throw new Error(`remote-view: ${method} ${path} failed (HTTP ${res.status})`);
    }
    // DELETE proxies a 204 (no content) — tolerate an empty body.
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}

// --- Handlers (injectable seam; each returns a semantic object with a `summary`) ---

export interface RemoteViewListResult {
  sessions: RemoteViewSession[];
  summary: string;
}

export async function handleRemoteViewList(
  request: RemoteViewRequest
): Promise<RemoteViewListResult> {
  const { sessions } = (await request('GET', '/api/remote-view/sessions')) as {
    sessions: RemoteViewSession[];
  };
  return { sessions, summary: `${sessions.length} active remote-view session(s)` };
}

export interface RemoteViewAttachResult {
  session: RemoteViewSession;
  summary: string;
}

export async function handleRemoteViewAttach(
  windowId: number,
  request: RemoteViewRequest
): Promise<RemoteViewAttachResult> {
  const session = (await request('POST', '/api/remote-view/sessions', {
    windowId,
  })) as RemoteViewSession;
  return {
    session,
    summary: `Attached window ${windowId} as session ${session.sessionId} (${session.app})`,
  };
}

export interface RemoteViewDetachResult {
  detached: string;
  summary: string;
}

export async function handleRemoteViewDetach(
  sessionId: string,
  request: RemoteViewRequest
): Promise<RemoteViewDetachResult> {
  await request('DELETE', `/api/remote-view/sessions/${encodeURIComponent(sessionId)}`);
  return { detached: sessionId, summary: `Detached remote-view session ${sessionId}` };
}

// --- ADR-0001 annotation contract (exported so the four hints are unit-testable) ---

/**
 * `openWorldHint: true` for all three — these tools reach a native daemon that
 * captures the host's live windows. Which windows exist, and whether attach
 * succeeds, depends on host state this process does not own (an open, non-deterministic
 * world), unlike the filesystem-only workflow/phase tools (`openWorldHint: false`).
 */
export const REMOTE_VIEW_LIST_ANNOTATIONS = {
  title: 'List Remote-View Sessions',
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const REMOTE_VIEW_ATTACH_ANNOTATIONS = {
  title: 'Attach Remote-View Window',
  readOnlyHint: false, // creates a session
  destructiveHint: false, // creates, never destroys
  idempotentHint: true, // attach is idempotent per windowId (T005)
  openWorldHint: true,
} as const;

export const REMOTE_VIEW_DETACH_ANNOTATIONS = {
  title: 'Detach Remote-View Session',
  readOnlyHint: false, // tears down a session
  destructiveHint: true, // terminal teardown of the stream
  idempotentHint: true, // detaching an already-closed session is a no-op
  openWorldHint: true,
} as const;

const LIST_DESCRIPTION =
  "List the active remote-view streaming sessions managed by the chainglass dev server. Use this tool to discover which host application windows are currently being streamed, and their session ids, before attaching or detaching. Returns an array of session summaries (sessionId, windowId, app, title, state) plus a one-line summary count. The result reflects the host's live streaming state because it reaches the running local dev server.";

const ATTACH_DESCRIPTION =
  'Attach (start streaming) a host application window by its CGWindowID so an agent can hand the user a running app inside chainglass. Use this after listing windows when you want to begin streaming a specific window; the operation is idempotent per windowId, so re-attaching the same window returns the existing session rather than creating a duplicate. Returns the created or existing session summary (sessionId, windowId, app, title, state) plus a one-line summary. Success depends on the live host environment because it spawns or contacts the native streaming daemon.';

const DETACH_DESCRIPTION =
  'Detach (stop streaming) an active remote-view session by its session id. Use this to tear down a stream the agent or user no longer needs; the operation is terminal and idempotent, so detaching an already-closed session is a safe no-op. Returns the detached session id plus a one-line summary. Contacts the live local dev server to terminate the daemon-side session.';

/** Build the text-content response envelope every tool returns (pretty-printed JSON). */
function jsonContent(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

/** Build an `isError` response carrying the failure message + a `summary`. */
function errorContent(toolName: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ...jsonContent({ error: message, summary: `${toolName} failed: ${message}` }),
    isError: true as const,
  };
}

/**
 * Registers the three remote-view tools on the MCP server (AC-8 MCP half).
 *
 * Per ADR-0001 IMP-002: follows the `check_health` exemplar pattern; each tool
 * mirrors the matching `cg remote-view` verb (T009).
 */
export function registerRemoteViewTools(
  server: McpServer,
  registry: Map<string, RegisteredToolInfo>,
  logger: ILogger
): void {
  // remote_view_list — read-only enumeration.
  server.registerTool(
    'remote_view_list',
    {
      description: LIST_DESCRIPTION,
      inputSchema: {
        workspace_path: z
          .string()
          .optional()
          .describe('Workspace path used to discover the dev server. Defaults to the process cwd.'),
      },
      annotations: REMOTE_VIEW_LIST_ANNOTATIONS,
    },
    async (args: { workspace_path?: string }) => {
      logger.info('remote_view_list invoked', { args });
      try {
        const request = createRemoteViewRequest({ worktreePath: args.workspace_path });
        return jsonContent(await handleRemoteViewList(request));
      } catch (error) {
        logger.error('remote_view_list failed', error instanceof Error ? error : undefined);
        return errorContent('remote_view_list', error);
      }
    }
  );
  registry.set('remote_view_list', {
    name: 'remote_view_list',
    description: LIST_DESCRIPTION,
  });

  // remote_view_attach — create/return the session for a window.
  server.registerTool(
    'remote_view_attach',
    {
      description: ATTACH_DESCRIPTION,
      inputSchema: {
        window_id: z
          .number()
          .int()
          .positive()
          .describe('The CGWindowID of the host window to stream (positive integer).'),
        workspace_path: z
          .string()
          .optional()
          .describe('Workspace path used to discover the dev server. Defaults to the process cwd.'),
      },
      annotations: REMOTE_VIEW_ATTACH_ANNOTATIONS,
    },
    async (args: { window_id: number; workspace_path?: string }) => {
      logger.info('remote_view_attach invoked', { args });
      try {
        const request = createRemoteViewRequest({ worktreePath: args.workspace_path });
        return jsonContent(await handleRemoteViewAttach(args.window_id, request));
      } catch (error) {
        logger.error('remote_view_attach failed', error instanceof Error ? error : undefined);
        return errorContent('remote_view_attach', error);
      }
    }
  );
  registry.set('remote_view_attach', {
    name: 'remote_view_attach',
    description: ATTACH_DESCRIPTION,
  });

  // remote_view_detach — terminal teardown.
  server.registerTool(
    'remote_view_detach',
    {
      description: DETACH_DESCRIPTION,
      inputSchema: {
        session_id: z
          .string()
          .min(1)
          .describe('The id of the remote-view session to detach (from remote_view_list).'),
        workspace_path: z
          .string()
          .optional()
          .describe('Workspace path used to discover the dev server. Defaults to the process cwd.'),
      },
      annotations: REMOTE_VIEW_DETACH_ANNOTATIONS,
    },
    async (args: { session_id: string; workspace_path?: string }) => {
      logger.info('remote_view_detach invoked', { args });
      try {
        const request = createRemoteViewRequest({ worktreePath: args.workspace_path });
        return jsonContent(await handleRemoteViewDetach(args.session_id, request));
      } catch (error) {
        logger.error('remote_view_detach failed', error instanceof Error ? error : undefined);
        return errorContent('remote_view_detach', error);
      }
    }
  );
  registry.set('remote_view_detach', {
    name: 'remote_view_detach',
    description: DETACH_DESCRIPTION,
  });

  logger.debug('Registered remote-view tools', {
    tools: ['remote_view_list', 'remote_view_attach', 'remote_view_detach'],
  });
}
