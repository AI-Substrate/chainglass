/**
 * Remote-view MCP tools tests (Plan 088 Phase 5 — T010).
 *
 * Two layers, no live server needed:
 *  1. ADR-0001 contract — verb_object snake_case names, 3-4 sentence descriptions,
 *     and the four annotation hints (readOnly/destructive/idempotent/openWorld).
 *  2. Handler behavior — the list/attach/detach handlers take an injectable `request`
 *     seam (mirrors the T009 CLI test), so we assert method/path/body + the `summary`
 *     field against a typed fake.
 */
import { createMcpServer } from '@chainglass/mcp-server';
import { FakeLogger } from '@chainglass/shared';
import { describe, expect, it } from 'vitest';
import {
  REMOTE_VIEW_ATTACH_ANNOTATIONS,
  REMOTE_VIEW_DETACH_ANNOTATIONS,
  REMOTE_VIEW_LIST_ANNOTATIONS,
  type RemoteViewRequest,
  handleRemoteViewAttach,
  handleRemoteViewDetach,
  handleRemoteViewList,
} from '../../../packages/mcp-server/src/tools/remote-view.tools.js';

function fakeRequest(response: unknown) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const request: RemoteViewRequest = async (method, path, body) => {
    calls.push({ method, path, body });
    return response;
  };
  return { request, calls };
}

describe('remote-view MCP tools — ADR-0001 registration (T010)', () => {
  it('registers verb_object snake_case tool names (not camelCase)', () => {
    /*
    Test Doc:
    - Why: AC-8 MCP half — agents drive remote-view via MCP; the tool names are the surface.
    - Contract: createMcpServer registers remote_view_list/attach/detach (mirrors the cg verbs).
    - Usage Notes: registry is the same Map check_health/phase tools use.
    - Quality Contribution: pins the verb trio + ADR-0001 naming so it can't silently drift.
    - Worked Example: server.tools.has('remote_view_list') === true; 'remoteViewList' === false.
    */
    const server = createMcpServer({ logger: new FakeLogger() });
    for (const name of ['remote_view_list', 'remote_view_attach', 'remote_view_detach']) {
      expect(server.tools.has(name)).toBe(true);
    }
    expect(server.tools.has('remoteViewList')).toBe(false);
  });

  it('gives each tool a 3-4 sentence description', () => {
    /*
    Test Doc:
    - Why: ADR-0001 — multi-sentence descriptions outperform terse ones for agent accuracy.
    - Contract: each remote-view tool description has >= 3 sentences (action/context/returns).
    - Usage Notes: count sentences by splitting on '. '.
    - Quality Contribution: catches terse descriptions that reduce agent accuracy.
    - Worked Example: description.split('. ').filter(Boolean).length >= 3.
    */
    const server = createMcpServer({ logger: new FakeLogger() });
    for (const name of ['remote_view_list', 'remote_view_attach', 'remote_view_detach']) {
      const tool = server.tools.get(name);
      expect(tool).toBeDefined();
      const sentences = tool?.description.split('. ').filter(Boolean);
      expect(sentences?.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('declares the four ADR-0001 annotation hints per verb', () => {
    /*
    Test Doc:
    - Why: ADR-0001 mandates readOnly/destructive/idempotent/openWorld so agents reason about effects.
    - Contract: list = read-only+idempotent; attach = create+idempotent; detach = destructive+idempotent;
      all three openWorld (they reach the live host-window daemon).
    - Usage Notes: annotations exported as constants so they're deterministically testable.
    - Quality Contribution: pins the effect semantics that distinguish read from teardown.
    - Worked Example: REMOTE_VIEW_DETACH_ANNOTATIONS.destructiveHint === true.
    */
    expect(REMOTE_VIEW_LIST_ANNOTATIONS).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(REMOTE_VIEW_ATTACH_ANNOTATIONS).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(REMOTE_VIEW_DETACH_ANNOTATIONS).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    });
  });
});

describe('remote-view MCP handlers — mirror the CLI verbs (T010)', () => {
  it('list → GET /sessions, unwraps { sessions }, summarizes the count', async () => {
    /*
    Test Doc:
    - Why: remote_view_list shows live sessions to an agent (AC-8).
    - Contract: handleRemoteViewList(request) → GET /api/remote-view/sessions; returns { sessions, summary }.
    - Usage Notes: GET wraps the array as { sessions } (T005) — handler unwraps it.
    - Quality Contribution: pins the read verb, the wrapped-shape parse, and the summary string.
    - Worked Example: one session → summary mentions '1 active'.
    */
    const { request, calls } = fakeRequest({
      sessions: [
        { sessionId: 's1', windowId: 1, app: 'Godot', title: 'spike', state: 'streaming' },
      ],
    });
    const result = await handleRemoteViewList(request);
    expect(calls).toContainEqual({
      method: 'GET',
      path: '/api/remote-view/sessions',
      body: undefined,
    });
    expect(result.sessions).toHaveLength(1);
    expect(result.summary).toContain('1 active');
  });

  it('attach → POST /sessions { windowId }, summarizes the new session', async () => {
    /*
    Test Doc:
    - Why: remote_view_attach starts a stream so an agent can hand the user a running app.
    - Contract: handleRemoteViewAttach(windowId, request) → POST { windowId }; returns { session, summary }.
    - Usage Notes: idempotent per windowId at the route; handler is a thin proxy.
    - Quality Contribution: pins the create verb body shape + the summary identity.
    - Worked Example: window 42 → summary names the sessionId and app.
    */
    const { request, calls } = fakeRequest({
      sessionId: 's9',
      windowId: 42,
      app: 'Godot',
      title: 'spike',
      state: 'streaming',
    });
    const result = await handleRemoteViewAttach(42, request);
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/remote-view/sessions',
      body: { windowId: 42 },
    });
    expect(result.session.sessionId).toBe('s9');
    expect(result.summary).toContain('s9');
    expect(result.summary).toContain('Godot');
  });

  it('detach → DELETE /sessions/<id> (encoded), summarizes the teardown', async () => {
    /*
    Test Doc:
    - Why: remote_view_detach tears down a stream the agent no longer needs.
    - Contract: handleRemoteViewDetach(sessionId, request) → DELETE /sessions/<encoded>; returns { detached, summary }.
    - Usage Notes: DELETE proxies a 204; handler returns the id it tore down.
    - Quality Contribution: pins the terminal verb path + id encoding.
    - Worked Example: 'a/b' → path encodes the slash.
    */
    const { request, calls } = fakeRequest(null);
    const result = await handleRemoteViewDetach('a/b', request);
    expect(calls).toContainEqual({
      method: 'DELETE',
      path: '/api/remote-view/sessions/a%2Fb',
      body: undefined,
    });
    expect(result.detached).toBe('a/b');
    expect(result.summary).toContain('a/b');
  });
});
