// @vitest-environment node
/**
 * Plan 088 Phase 5 — T003: daemon-backed RealRemoteViewService.
 *
 * Runs the FROZEN Phase-2 contract suite (the same 7 tests the fake passes)
 * against the real adapter wired to a daemon-double transport, plus
 * adapter-specific orchestration tests (ensureDaemon-before-proxy, idempotent
 * local fast-path, detach teardown, failure propagation). No live daemon — the
 * `DaemonSessionsClient` transport is injected, so the whole adapter is unit-tested.
 */
import type { DaemonInfo } from '@/features/088-remote-view/server/daemon-manager';
import {
  type DaemonSessionsClient,
  type IRemoteViewService,
  RealRemoteViewService,
  type SessionSummary,
  createHttpDaemonSessionsClient,
} from '@/features/088-remote-view/server/remote-view-service';
import { FAKE_WINDOW } from '@/features/088-remote-view/testing/fixtures';
import { describe, expect, it, vi } from 'vitest';
import { remoteViewServiceContractTests } from '../../../../contracts/remote-view-service.contract';

/** A daemon-double: mimics `POST/DELETE /sessions` without a live daemon. */
class FakeDaemonSessionsClient implements DaemonSessionsClient {
  public creates = 0;
  public removes: string[] = [];
  private counter = 0;

  async create(_daemonPort: number, windowId: number): Promise<SessionSummary> {
    this.creates += 1;
    this.counter += 1;
    const known = windowId === FAKE_WINDOW.id ? FAKE_WINDOW : null;
    return {
      sessionId: `ses_real${String(this.counter).padStart(8, '0')}`,
      windowId,
      app: known?.app ?? 'Unknown',
      title: known?.title ?? `window-${windowId}`,
      state: 'streaming',
    };
  }

  async remove(_daemonPort: number, sessionId: string): Promise<void> {
    this.removes.push(sessionId);
  }
}

const FAKE_INFO: DaemonInfo = { daemonPort: 7099, daemonVersion: '0.1.0', protocolVersion: 1 };

function makeRealService(): IRemoteViewService {
  return new RealRemoteViewService({
    ensureDaemon: async () => FAKE_INFO,
    sessions: new FakeDaemonSessionsClient(),
  });
}

// 1) The frozen Phase-2 contract suite — the real adapter passes the SAME 7 tests.
remoteViewServiceContractTests(makeRealService, 'RealRemoteViewService');

// 2) Adapter-specific orchestration the fake doesn't exercise.
describe('RealRemoteViewService daemon orchestration', () => {
  it('attach() ensures the daemon, then creates the session via the transport', async () => {
    /*
    Test Doc:
    - Why: the real adapter must spawn/handshake the daemon (ensureDaemon) before proxying attach.
    - Contract: attach → ensureDaemon() called once; transport.create(daemonPort, windowId) called once.
    - Usage Notes: ensureDaemon supplies the daemonPort the transport proxies to (T001 → T003 seam).
    - Quality Contribution: pins the spawn-before-proxy ordering.
    - Worked Example: attach(34202) → ensureDaemon ran, transport.create(7099, 34202).
    */
    const transport = new FakeDaemonSessionsClient();
    const ensureDaemon = vi.fn(async () => FAKE_INFO);
    const svc = new RealRemoteViewService({ ensureDaemon, sessions: transport });
    const s = await svc.attach(FAKE_WINDOW.id);
    expect(ensureDaemon).toHaveBeenCalledTimes(1);
    expect(transport.creates).toBe(1);
    expect(s.sessionId).toMatch(/^ses_real/);
  });

  it('attach() is idempotent without a second daemon round-trip (local fast-path)', async () => {
    /*
    Test Doc:
    - Why: re-attaching a live window must reuse the mirror, not re-spawn/re-proxy (single-viewer v1).
    - Contract: 2× attach(same window) → transport.create called once; ensureDaemon called once.
    - Usage Notes: the local session mirror is the sync source of truth for list()/getSession().
    - Quality Contribution: encodes one-session-per-window + avoids a redundant spawn/proxy.
    - Worked Example: attach(34202)×2 → creates === 1, same sessionId.
    */
    const transport = new FakeDaemonSessionsClient();
    const ensureDaemon = vi.fn(async () => FAKE_INFO);
    const svc = new RealRemoteViewService({ ensureDaemon, sessions: transport });
    const a = await svc.attach(FAKE_WINDOW.id);
    const b = await svc.attach(FAKE_WINDOW.id);
    expect(b.sessionId).toBe(a.sessionId);
    expect(transport.creates).toBe(1);
    expect(ensureDaemon).toHaveBeenCalledTimes(1);
  });

  it('detach() proxies a DELETE to the daemon transport and closes the mirror', async () => {
    /*
    Test Doc:
    - Why: detach must tear down the daemon session, not just the local mirror.
    - Contract: detach(id) → transport.remove(daemonPort, id) called; getSession(id) → null afterwards.
    - Usage Notes: closed sessions are filtered from list()/getSession().
    - Quality Contribution: pins the daemon teardown proxy.
    - Worked Example: attach → detach → transport.removes contains the id.
    */
    const transport = new FakeDaemonSessionsClient();
    const svc = new RealRemoteViewService({
      ensureDaemon: async () => FAKE_INFO,
      sessions: transport,
    });
    const s = await svc.attach(FAKE_WINDOW.id);
    await svc.detach(s.sessionId);
    expect(transport.removes).toContain(s.sessionId);
    expect(svc.getSession(s.sessionId)).toBeNull();
  });

  it('detach(unknown) is a no-op (no daemon round-trip)', async () => {
    /*
    Test Doc:
    - Why: detaching a stale/unknown id must not spawn the daemon or throw.
    - Contract: detach('ses_nope') → ensureDaemon NOT called; transport.remove NOT called.
    - Usage Notes: guards stale rv params (mirrors getSession(unknown) → null).
    - Quality Contribution: avoids a needless spawn on a no-op detach.
    - Worked Example: detach('ses_nope') resolves; removes === [].
    */
    const transport = new FakeDaemonSessionsClient();
    const ensureDaemon = vi.fn(async () => FAKE_INFO);
    const svc = new RealRemoteViewService({ ensureDaemon, sessions: transport });
    await svc.detach('ses_nope');
    expect(ensureDaemon).not.toHaveBeenCalled();
    expect(transport.removes).toEqual([]);
  });

  it('attach() propagates a daemon failure and mirrors nothing', async () => {
    /*
    Test Doc:
    - Why: a daemon /sessions failure must surface to the caller, not leave a phantom local session.
    - Contract: transport.create rejects → attach rejects; list() stays empty.
    - Usage Notes: the mirror is written only after a successful daemon create.
    - Quality Contribution: prevents a half-attached session ghost.
    - Worked Example: create throws → attach throws, list() === [].
    */
    const transport: DaemonSessionsClient = {
      create: async () => {
        throw new Error('daemon /sessions 500');
      },
      remove: async () => {},
    };
    const svc = new RealRemoteViewService({
      ensureDaemon: async () => FAKE_INFO,
      sessions: transport,
    });
    await expect(svc.attach(FAKE_WINDOW.id)).rejects.toThrow(/daemon/);
    expect(svc.list()).toEqual([]);
  });
});

// 3) The live HTTP transport (Phase-4 daemon /sessions contract), over a fetch double.
describe('createHttpDaemonSessionsClient (live transport)', () => {
  const SUMMARY: SessionSummary = {
    sessionId: 'ses_x',
    windowId: FAKE_WINDOW.id,
    app: 'Godot',
    title: 'spike-target',
    state: 'streaming',
  };
  const fakeResponse = (status: number, body?: unknown): Response =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });

  it('create() POSTs {windowId} with a Bearer token and returns the summary', async () => {
    /*
    Test Doc:
    - Why: the live transport must hit the daemon's JWT-gated POST /sessions with the right shape.
    - Contract: create(port, windowId) → POST http://127.0.0.1:<port>/sessions, Bearer token, body {windowId}.
    - Usage Notes: mintToken supplies the daemon JWT (aud=remote-view-ws) per call.
    - Quality Contribution: pins the daemon request contract before Phase-6 live wiring.
    - Worked Example: create(7099, 34202) → POST …:7099/sessions, returns the daemon summary.
    */
    let captured: { url: string; init?: RequestInit } | undefined;
    const fetchFn: typeof fetch = async (url, init) => {
      captured = { url: String(url), init };
      return fakeResponse(200, SUMMARY);
    };
    const client = createHttpDaemonSessionsClient({ mintToken: async () => 'tok123', fetchFn });
    const s = await client.create(7099, FAKE_WINDOW.id);
    expect(s).toEqual(SUMMARY);
    expect(captured?.url).toBe('http://127.0.0.1:7099/sessions');
    expect(captured?.init?.method).toBe('POST');
    expect(new Headers(captured?.init?.headers).get('authorization')).toBe('Bearer tok123');
    expect(JSON.parse(String(captured?.init?.body))).toEqual({ windowId: FAKE_WINDOW.id });
  });

  it('create() throws on a non-2xx daemon response', async () => {
    /*
    Test Doc:
    - Why: a daemon error must surface (the adapter relies on this to avoid a phantom session).
    - Contract: create() with a 500 response → rejects with the status.
    - Usage Notes: any non-2xx is an error (no silent empty summary).
    - Quality Contribution: pins the create() error path.
    - Worked Example: 500 → throws /500/.
    */
    const fetchFn: typeof fetch = async () => fakeResponse(500);
    const client = createHttpDaemonSessionsClient({ mintToken: async () => 't', fetchFn });
    await expect(client.create(7099, 1)).rejects.toThrow(/500/);
  });

  it('remove() DELETEs the session id and tolerates 404 (idempotent detach)', async () => {
    /*
    Test Doc:
    - Why: detach must be idempotent — a session already gone (404) is success, not an error.
    - Contract: remove(port, id) → DELETE …/sessions/<id>; 404 resolves.
    - Usage Notes: the daemon may have already closed the session (vanish/exit).
    - Quality Contribution: pins idempotent teardown.
    - Worked Example: DELETE …/sessions/ses_gone → 404 → resolves.
    */
    let captured: string | undefined;
    const fetchFn: typeof fetch = async (url, init) => {
      captured = `${init?.method} ${String(url)}`;
      return fakeResponse(404);
    };
    const client = createHttpDaemonSessionsClient({ mintToken: async () => 't', fetchFn });
    await expect(client.remove(7099, 'ses_gone')).resolves.toBeUndefined();
    expect(captured).toBe('DELETE http://127.0.0.1:7099/sessions/ses_gone');
  });

  it('remove() throws on a non-404 error', async () => {
    /*
    Test Doc:
    - Why: a real daemon failure on detach (not "already gone") must surface.
    - Contract: remove() with a 500 → rejects.
    - Usage Notes: distinguishes 404 (tolerated) from other failures.
    - Quality Contribution: pins the remove() error path.
    - Worked Example: 500 → throws /500/.
    */
    const fetchFn: typeof fetch = async () => fakeResponse(500);
    const client = createHttpDaemonSessionsClient({ mintToken: async () => 't', fetchFn });
    await expect(client.remove(7099, 'ses_x')).rejects.toThrow(/500/);
  });
});
