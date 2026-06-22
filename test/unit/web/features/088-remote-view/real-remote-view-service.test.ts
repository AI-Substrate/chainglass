// @vitest-environment node
/**
 * Plan 088 Phase 5 — T003: daemon-backed RealRemoteViewService.
 *
 * Runs the FROZEN Phase-2 contract suite (the same 7 tests the fake passes)
 * against the real adapter wired to a daemon-double transport, plus
 * adapter-specific orchestration tests (ensureDaemon-before-proxy, daemon-as-
 * authority on every attach, stale-mirror eviction after a daemon restart, detach
 * teardown, failure propagation). No live daemon — the `DaemonSessionsClient`
 * transport is injected, so the whole adapter is unit-tested. Also covers the
 * production config seam (F001 — canonical workspace root, not raw cwd).
 */
import type { DaemonInfo } from '@/features/088-remote-view/server/daemon-manager';
import {
  type DaemonSessionsClient,
  type IRemoteViewService,
  RealRemoteViewService,
  type SessionSummary,
  createHttpDaemonSessionsClient,
} from '@/features/088-remote-view/server/remote-view-service';
import { resolveProductionDaemonConfig } from '@/features/088-remote-view/server/remote-view-service.production';
import { FAKE_WINDOW } from '@/features/088-remote-view/testing/fixtures';
import { describe, expect, it, vi } from 'vitest';
import { remoteViewServiceContractTests } from '../../../../contracts/remote-view-service.contract';

/**
 * A daemon-double: mimics the daemon's AUTHORITATIVE `/sessions` table without a
 * live daemon. `create` is idempotent per window (single-viewer v1 — the real
 * daemon returns the existing session, never a duplicate); `restart()` models a
 * streamd crash/restart that loses the in-memory table (the F002 hazard).
 */
class FakeDaemonSessionsClient implements DaemonSessionsClient {
  public creates = 0;
  public removes: string[] = [];
  private counter = 0;
  private byWindow = new Map<number, SessionSummary>();

  async create(_daemonPort: number, windowId: number): Promise<SessionSummary> {
    this.creates += 1;
    const existing = this.byWindow.get(windowId);
    if (existing) return { ...existing };
    this.counter += 1;
    const known = windowId === FAKE_WINDOW.id ? FAKE_WINDOW : null;
    const summary: SessionSummary = {
      sessionId: `ses_real${String(this.counter).padStart(8, '0')}`,
      windowId,
      app: known?.app ?? 'Unknown',
      title: known?.title ?? `window-${windowId}`,
      state: 'streaming',
    };
    this.byWindow.set(windowId, summary);
    return { ...summary };
  }

  async remove(_daemonPort: number, sessionId: string): Promise<void> {
    this.removes.push(sessionId);
    for (const [w, s] of this.byWindow) {
      if (s.sessionId === sessionId) this.byWindow.delete(w);
    }
  }

  /** Model a daemon crash/restart — the authoritative session table is lost. */
  restart(): void {
    this.byWindow.clear();
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

  it('attach() re-verifies the daemon every time and reconciles to one session per window', async () => {
    /*
    Test Doc:
    - Why: the daemon's session table is authoritative (Workshop 002) — the mirror is a sync read-cache, not the source of truth; every attach must re-run ensureDaemon (crash respawn/version handshake) rather than short-circuit on a cached entry (F002).
    - Contract: 2× attach(same window) → ensureDaemon called twice, daemon create called twice; same sessionId (daemon is idempotent); list() length 1 (no duplicate).
    - Usage Notes: idempotency now comes from the daemon, not a local no-round-trip fast-path.
    - Quality Contribution: removes the stale-mirror short-circuit while keeping one-session-per-window.
    - Worked Example: attach(34202)×2 → same sessionId, list length 1, ensureDaemon×2.
    */
    const transport = new FakeDaemonSessionsClient();
    const ensureDaemon = vi.fn(async () => FAKE_INFO);
    const svc = new RealRemoteViewService({ ensureDaemon, sessions: transport });
    const a = await svc.attach(FAKE_WINDOW.id);
    const b = await svc.attach(FAKE_WINDOW.id);
    expect(b.sessionId).toBe(a.sessionId);
    expect(svc.list()).toHaveLength(1);
    expect(ensureDaemon).toHaveBeenCalledTimes(2);
    expect(transport.creates).toBe(2);
  });

  it('attach() after a daemon restart returns a fresh session and evicts the stale mirror entry (F002)', async () => {
    /*
    Test Doc:
    - Why: if streamd crashes/restarts, a cached mirror session must NOT be handed back — the daemon's NEW table is authoritative, and the old sessionId is dead (Workshop 002 R6: sessions don't survive restart).
    - Contract: attach(w) → [daemon restart] → attach(w) → a new sessionId; list() shows only the fresh session, never the stale one.
    - Usage Notes: ensureDaemon + the daemon's idempotent POST /sessions reconcile the read-cache; this is the hole the old local fast-path created.
    - Quality Contribution: closes the stale-session correctness gap a restarted daemon would otherwise expose to CLI/MCP/UI re-attach.
    - Worked Example: attach(34202)=ses_real…1, restart, attach(34202)=ses_real…2, list()===[ses_real…2].
    */
    const transport = new FakeDaemonSessionsClient();
    const svc = new RealRemoteViewService({
      ensureDaemon: async () => FAKE_INFO,
      sessions: transport,
    });
    const first = await svc.attach(FAKE_WINDOW.id);
    transport.restart(); // streamd crashed → its authoritative session table is gone
    const second = await svc.attach(FAKE_WINDOW.id);
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(svc.list()).toEqual([second]);
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

// 4) Production config assembly — the daemon root must be the CANONICAL workspace
//    root (auth's source of truth), NOT raw process.cwd() (F001 / Plan 084 FX003).
describe('resolveProductionDaemonConfig (canonical workspace root, F001)', () => {
  it('resolves bootstrap + daemon root from findWorkspaceRoot, not raw cwd', () => {
    /*
    Test Doc:
    - Why: under `just dev`/Turbo, Next runs from apps/web/, but auth mints/verifies the bootstrap code from findWorkspaceRoot(process.cwd()) (the repo root holding .chainglass/). The daemon must be spawned against that SAME root, or its --bootstrap/--registry paths diverge from where the web process signs tokens and live /sessions auth fails on the first attach.
    - Contract: cwd=<repo>/apps/web + findRoot→<repo> ⇒ workspaceRoot=<repo>, bootstrapPath=<repo>/.chainglass/bootstrap-code.json.
    - Usage Notes: cwd/findRoot/env are injected so the seam is deterministic — no real filesystem walk.
    - Quality Contribution: pins the cwd-split fix the daemon registry + token verification both depend on.
    - Worked Example: cwd '/r/apps/web' → workspaceRoot '/r', bootstrapPath '/r/.chainglass/bootstrap-code.json'.
    */
    const cfg = resolveProductionDaemonConfig({
      cwd: '/r/apps/web',
      findRoot: () => '/r',
      env: { PORT: '4123' },
    });
    expect(cfg.workspaceRoot).toBe('/r');
    expect(cfg.bootstrapPath).toBe('/r/.chainglass/bootstrap-code.json');
    expect(cfg.webPort).toBe(4123);
  });

  it('honors CG_REMOTE_VIEW__DAEMON_PORT override and defaults the web port to 3000', () => {
    /*
    Test Doc:
    - Why: the daemon-port override (ADR-0003) and the default web port must survive the config seam.
    - Contract: env CG_REMOTE_VIEW__DAEMON_PORT set → daemonPortOverride parsed; no PORT → webPort 3000.
    - Usage Notes: both are read from the injected env, numbers parsed from strings.
    - Quality Contribution: guards the override/default wiring through the seam.
    - Worked Example: {CG_REMOTE_VIEW__DAEMON_PORT:'9000'} → daemonPortOverride 9000, webPort 3000.
    */
    const cfg = resolveProductionDaemonConfig({
      cwd: '/r/apps/web',
      findRoot: () => '/r',
      env: { CG_REMOTE_VIEW__DAEMON_PORT: '9000' },
    });
    expect(cfg.daemonPortOverride).toBe(9000);
    expect(cfg.webPort).toBe(3000);
  });
});
