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
