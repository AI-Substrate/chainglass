import { afterEach, describe, expect, it, vi } from 'vitest';
/**
 * Plan 088 Phase 5 — T009: `cg remote-view list|attach|detach` CLI verbs.
 *
 * The verb handlers take an injectable `request` seam — production wires it from
 * `readServerInfo()` (server discovery) + `X-Local-Token` auth (Plan 084); these
 * tests inject a typed fake, so no live dev server is needed. Mirrors the
 * agent.command/event-popper-client CLI patterns.
 */
// Import Command from the SAME commander copy apps/cli's source resolves (v13) — the repo hoists a
// v11 copy to the root that `test/` would otherwise pick up, making `new Command()` (v11) incompatible
// with `registerRemoteViewCommands`'s v13 `Command` param (a type-identity mismatch, not a real bug).
import { Command } from '../../../apps/cli/node_modules/commander';
import {
  type RemoteViewRequest,
  formatRemoteViewError,
  handleRemoteViewAttach,
  handleRemoteViewDetach,
  handleRemoteViewList,
  registerRemoteViewCommands,
} from '../../../apps/cli/src/commands/remote-view.command.js';

function fakeRequest(response: unknown) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  const request: RemoteViewRequest = async (method: string, path: string, body?: unknown) => {
    calls.push({ method, path, body });
    return response;
  };
  return { request, calls };
}

function captureLog() {
  const logs: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  });
  return { restore: () => spy.mockRestore(), text: () => logs.join('\n') };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cg remote-view (T009)', () => {
  it('registers the list/attach/detach subcommands', () => {
    /*
    Test Doc:
    - Why: agents drive remote-view from the terminal (AC-8 CLI half); the verb tree is the surface.
    - Contract: registerRemoteViewCommands(program) adds a 'remote-view' group with list/attach/detach.
    - Usage Notes: mirrors registerAgentCommands; one-line wired into cg.ts.
    - Quality Contribution: pins the CLI verb set (so T010 MCP can mirror it).
    - Worked Example: subcommand names sorted → [attach, detach, list].
    */
    const program = new Command();
    registerRemoteViewCommands(program);
    const rv = program.commands.find((c) => c.name() === 'remote-view');
    expect(rv).toBeDefined();
    expect(rv?.commands.map((c) => c.name()).sort()).toEqual(['attach', 'detach', 'list']);
  });

  it('list → GET /sessions and prints the sessions', async () => {
    /*
    Test Doc:
    - Why: `cg remote-view list` shows live sessions to an agent/human.
    - Contract: handleRemoteViewList(request) → request('GET','/api/remote-view/sessions'); prints the rows.
    - Usage Notes: GET wraps the array as { sessions } (T005) — handler unwraps it.
    - Quality Contribution: pins the read verb + wrapped-shape parse.
    - Worked Example: one Godot session → output contains 'Godot'.
    */
    const cap = captureLog();
    const { request, calls } = fakeRequest({
      sessions: [
        { sessionId: 's1', windowId: 1, app: 'Godot', title: 'spike', state: 'streaming' },
      ],
    });
    await handleRemoteViewList(request);
    cap.restore();
    expect(calls).toContainEqual({
      method: 'GET',
      path: '/api/remote-view/sessions',
      body: undefined,
    });
    expect(cap.text()).toContain('Godot');
  });

  it('attach <windowId> → POST /sessions { windowId }', async () => {
    /*
    Test Doc:
    - Why: `cg remote-view attach <windowId>` streams a host window for an agent.
    - Contract: handleRemoteViewAttach(42, request) → request('POST','/api/remote-view/sessions',{windowId:42}); prints the summary.
    - Usage Notes: the daemon's POST /sessions is idempotent per window (T005).
    - Quality Contribution: pins the attach verb wiring.
    - Worked Example: attach 42 → POST body {windowId:42}; output contains the new sessionId.
    */
    const cap = captureLog();
    const { request, calls } = fakeRequest({
      sessionId: 's2',
      windowId: 42,
      app: 'Godot',
      title: 't',
      state: 'streaming',
    });
    await handleRemoteViewAttach(42, request);
    cap.restore();
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/remote-view/sessions',
      body: { windowId: 42 },
    });
    expect(cap.text()).toContain('s2');
  });

  it('detach <sessionId> → DELETE /sessions/<id>', async () => {
    /*
    Test Doc:
    - Why: `cg remote-view detach <id>` tears down a session from the terminal.
    - Contract: handleRemoteViewDetach('ses_9', request) → request('DELETE','/api/remote-view/sessions/ses_9').
    - Usage Notes: sessionId URL-encoded; DELETE may be 204 (handler tolerates an empty body).
    - Quality Contribution: pins the destructive verb wiring.
    - Worked Example: detach ses_9 → DELETE /api/remote-view/sessions/ses_9; output names ses_9.
    */
    const cap = captureLog();
    const { request, calls } = fakeRequest({});
    await handleRemoteViewDetach('ses_9', request);
    cap.restore();
    expect(calls).toContainEqual({
      method: 'DELETE',
      path: '/api/remote-view/sessions/ses_9',
      body: undefined,
    });
    expect(cap.text()).toContain('ses_9');
  });
});

describe('formatRemoteViewError (Phase 6 T004 — AC-14 CLI half)', () => {
  /*
  Test Doc:
  - Why: AC-14 requires the CLI (not just the UI) to name the exact missing grant + fix path, so an
    agent driving `cg remote-view` from the terminal isn't left with a bare "HTTP 403".
  - Contract: formatRemoteViewError(status, body) maps the route's named code → an actionable message.
  - Quality Contribution: pins that E_PERMISSION/E_BUNDLE_MISSING surface their fix path, and that an
    unnamed failure still reports the HTTP status (never a silent swallow).
  */
  it('E_PERMISSION → names Screen Recording, Accessibility, and the docs fix path', () => {
    const msg = formatRemoteViewError(403, {
      error: 'E_PERMISSION',
      message: 'Screen Recording permission is required.',
    });
    expect(msg).toContain('Screen Recording permission is required.');
    expect(msg).toMatch(/Privacy & Security/);
    expect(msg).toMatch(/Accessibility/);
    expect(msg).toContain('docs/how/remote-view.md');
  });

  it('E_BUNDLE_MISSING → prescribes `just streamd-install`', () => {
    const msg = formatRemoteViewError(503, {
      error: 'E_BUNDLE_MISSING',
      message: 'the signed streamd bundle is not installed',
    });
    expect(msg).toContain('just streamd-install');
    expect(msg).toContain('docs/how/remote-view.md');
  });

  it('an unnamed failure still reports the HTTP status (no silent swallow)', () => {
    expect(formatRemoteViewError(500, null)).toContain('HTTP 500');
    expect(formatRemoteViewError(500, { message: 'boom' })).toContain('boom');
  });
});
