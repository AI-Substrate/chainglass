/**
 * Remote-view session service — interface + in-memory fake.
 *
 * Constitution P2 sequence: the interface + fake land in Phase 2; the real
 * daemon-backed adapter joins this same contract suite in Phase 5. The contract
 * test is reused verbatim against the real adapter then — so the field set is
 * FROZEN here.
 *
 * `SessionSummary` carries `windowId` + `title` because two later consumers need
 * them: R4 (SSE attach push names the window) and R6 (auto-recreate by windowId).
 *
 * Plan 088 Phase 2 — T009.
 */
import { FAKE_WINDOW } from '../testing/fixtures';
import type { DaemonInfo } from './daemon-manager';

/** Daemon-side session lifecycle state (Workshop 002 ownership model). */
export type SessionState = 'idle' | 'streaming' | 'unwatched' | 'closed';

/** The frozen shape `remote-view list`/`attach`/`getSession` return. */
export interface SessionSummary {
  sessionId: string;
  windowId: number;
  app: string;
  title: string;
  state: SessionState;
}

export interface IRemoteViewService {
  /** Active (non-closed) sessions. */
  list(): SessionSummary[];
  /** Attach/create a session for a window (idempotent per window — single-viewer v1). */
  attach(windowId: number): Promise<SessionSummary>;
  /** Detach (close) a session. */
  detach(sessionId: string): Promise<void>;
  /** Look up an active session, or null if unknown/closed. */
  getSession(sessionId: string): SessionSummary | null;
}

/**
 * In-memory fake backed by the same pinned window descriptor as the frame-replay
 * fake (`FAKE_WINDOW`). One session per window (single-viewer); deterministic ids.
 */
export class FakeRemoteViewService implements IRemoteViewService {
  private readonly sessions = new Map<string, SessionSummary>();
  private counter = 0;

  list(): SessionSummary[] {
    return [...this.sessions.values()].filter((s) => s.state !== 'closed').map((s) => ({ ...s }));
  }

  async attach(windowId: number): Promise<SessionSummary> {
    const existing = [...this.sessions.values()].find(
      (s) => s.windowId === windowId && s.state !== 'closed'
    );
    if (existing) {
      existing.state = 'streaming';
      return { ...existing };
    }
    this.counter += 1;
    const sessionId = `ses_fake${String(this.counter).padStart(8, '0')}`;
    const known = windowId === FAKE_WINDOW.id ? FAKE_WINDOW : null;
    const summary: SessionSummary = {
      sessionId,
      windowId,
      app: known?.app ?? 'Unknown',
      title: known?.title ?? `window-${windowId}`,
      state: 'streaming',
    };
    this.sessions.set(sessionId, summary);
    return { ...summary };
  }

  async detach(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) s.state = 'closed';
  }

  getSession(sessionId: string): SessionSummary | null {
    const s = this.sessions.get(sessionId);
    return s && s.state !== 'closed' ? { ...s } : null;
  }
}

/**
 * Production placeholder until the daemon-backed adapter lands (Phase 5). It is
 * resolvable from the DI container (so the token wiring is real today) but every
 * method throws a clear "not yet" — there is no daemon to talk to in Phase 2.
 */
export function createUnimplementedRemoteViewService(): IRemoteViewService {
  const notYet = (): never => {
    throw new Error(
      'RemoteViewService: the daemon-backed real adapter lands in Plan 088 Phase 5; no production implementation exists in Phase 2.'
    );
  };
  return { list: notYet, attach: notYet, detach: notYet, getSession: notYet };
}

// ============================================================================
// Plan 088 Phase 5 — T003: daemon-backed real adapter.
// ============================================================================

/**
 * The daemon `/sessions` transport the real adapter proxies through. Injectable
 * so the frozen Phase-2 contract suite + orchestration tests run against a
 * daemon-double; the live HTTP client (below) is exercised in Phase 6.
 */
export interface DaemonSessionsClient {
  /** `POST /sessions {windowId}` on the daemon → the created/attached summary. */
  create(daemonPort: number, windowId: number): Promise<SessionSummary>;
  /** `DELETE /sessions/{sessionId}` on the daemon (idempotent; 404 tolerated). */
  remove(daemonPort: number, sessionId: string): Promise<void>;
}

export interface RealRemoteViewServiceDeps {
  /** Spawn/poll/version-handshake the daemon, returning how to reach it (T001 manager). */
  ensureDaemon: () => Promise<DaemonInfo>;
  /** Daemon `/sessions` transport — HTTP in prod, a double in tests. */
  sessions: DaemonSessionsClient;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

/**
 * Daemon-backed adapter (Plan 088 Phase 5 — T003). Implements IRemoteViewService
 * by proxying the daemon's `/sessions` endpoints, ensuring the daemon is running
 * first (T001 manager). A local session mirror backs the **synchronous**
 * `list()`/`getSession()` reads (the interface is sync there) and is kept in step
 * by the async `attach()`/`detach()` daemon round-trips. One session per window
 * (single-viewer v1), mirroring `FakeRemoteViewService`'s semantics so it passes
 * the same frozen contract suite.
 *
 * NOTE: SSE emit (T006) and GlobalState publish (T007) attach at the `attach()`/
 * `detach()` seams marked below — intentionally NOT wired in T003.
 */
export class RealRemoteViewService implements IRemoteViewService {
  private readonly sessions = new Map<string, SessionSummary>();

  constructor(private readonly deps: RealRemoteViewServiceDeps) {}

  list(): SessionSummary[] {
    return [...this.sessions.values()].filter((s) => s.state !== 'closed').map((s) => ({ ...s }));
  }

  async attach(windowId: number): Promise<SessionSummary> {
    // The daemon's session table is the AUTHORITY (Workshop 002); the local mirror
    // is only a sync read-cache for list()/getSession(). So every attach re-runs
    // ensureDaemon() (crash respawn + version handshake) and lets the daemon's
    // idempotent POST /sessions decide the session — never a stale-mirror
    // short-circuit, which would hand back a dead sessionId after a daemon restart
    // and skip the respawn path (F002 / Workshop 002 R6: sessions don't survive a
    // restart).
    const { daemonPort } = await this.deps.ensureDaemon();
    // Mirror only AFTER a successful daemon create — a failure leaves no phantom session.
    const summary = await this.deps.sessions.create(daemonPort, windowId);
    // Reconcile the read-cache: evict any prior entry for this window (e.g. a stale
    // session from a since-restarted daemon) so one window never shows two
    // sessions, then record the authoritative summary.
    for (const [id, s] of this.sessions) {
      if (s.windowId === windowId && id !== summary.sessionId) this.sessions.delete(id);
    }
    this.sessions.set(summary.sessionId, { ...summary });
    // ← T006 seam: emit('remote-view','attached',summary). T007 seam: publish status.
    return { ...summary };
  }

  async detach(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s || s.state === 'closed') return; // unknown/closed → no daemon round-trip.
    const { daemonPort } = await this.deps.ensureDaemon();
    await this.deps.sessions.remove(daemonPort, sessionId);
    s.state = 'closed';
    // ← T006 seam: emit('remote-view','detached',{sessionId}). T007 seam: publish status:closed.
  }

  getSession(sessionId: string): SessionSummary | null {
    const s = this.sessions.get(sessionId);
    return s && s.state !== 'closed' ? { ...s } : null;
  }
}

export function createRealRemoteViewService(deps: RealRemoteViewServiceDeps): IRemoteViewService {
  return new RealRemoteViewService(deps);
}

export interface HttpDaemonSessionsClientDeps {
  /** Mint a daemon JWT (`aud=remote-view-ws`, HS256) — server-side, per call. */
  mintToken: () => Promise<string>;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
  /** Daemon bind host (loopback). */
  host?: string;
}

/**
 * Live HTTP transport to the daemon's JWT-gated `/sessions` (Phase 4 contract).
 * Pure over its injected `mintToken`/`fetchFn`, so it is unit-testable; the
 * end-to-end path against a real daemon is verified live in Phase 6.
 */
export function createHttpDaemonSessionsClient(
  deps: HttpDaemonSessionsClientDeps
): DaemonSessionsClient {
  const fetchFn = deps.fetchFn ?? fetch;
  const host = deps.host ?? '127.0.0.1';
  return {
    async create(daemonPort, windowId) {
      const token = await deps.mintToken();
      const res = await fetchFn(`http://${host}:${daemonPort}/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ windowId }),
      });
      if (!res.ok) {
        throw new Error(`daemon POST /sessions failed: ${res.status}`);
      }
      return (await res.json()) as SessionSummary;
    },
    async remove(daemonPort, sessionId) {
      const token = await deps.mintToken();
      const res = await fetchFn(
        `http://${host}:${daemonPort}/sessions/${encodeURIComponent(sessionId)}`,
        { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }
      );
      // 404 ⇒ already gone ⇒ idempotent detach.
      if (!res.ok && res.status !== 404) {
        throw new Error(`daemon DELETE /sessions failed: ${res.status}`);
      }
    },
  };
}
