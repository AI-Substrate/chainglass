/**
 * Frame-replay fake streamer daemon (AC-12, first-class deliverable).
 *
 * A Node `ws` server that *is* a third implementation of the Workshop-003 wire
 * protocol — it replays the recorded Phase 1 H.264 fixtures (real `sck-capture`,
 * `protocol/fixtures/video/`) and is scriptable to emit every Workshop-002 race
 * cue. It lets the entire web feature run + pass tests with **no daemon present**.
 *
 * Design constraints:
 *  - Fixture reader is dependency-free (fs + the manifest) so the fake runs inside
 *    the Docker harness container in Phase 3 (Finding 06).
 *  - Binds an ephemeral port (`:0`) and fully closes in teardown so the serial
 *    (`fileParallelism:false`) suite doesn't leak listeners.
 *  - Owns its copy of the fixtures from here on — never mutates the
 *    `external-research/` seed (Phase 1 ownership-after-handoff rule).
 *
 * Protocol behaviour:
 *  - on `hello`: hello-ok (pinned window) → video-config (from manifest) → binary
 *    keyframe → (deltas on cue or paced).
 *  - reattach: a 2nd `hello` on a live session displaces the old viewer (R2) or
 *    resumes an `unwatched` one (R1); either way resends a fresh keyframe.
 *  - `ping` → `pong{sentAt,daemonAt}`; WS-level heartbeat ping on cue; socket
 *    close → session `unwatched` (R5 substrate).
 *  - honours `request-keyframe` (fresh keyframe) and `pause`/`resume` (resume ⇒ keyframe).
 *  - scriptable cues: `displaced`, `window-state`, `error`, and a drop-simulation
 *    (sequence gap) the degraded path can observe.
 *  - records received `input` events to an inspectable log (AC-3 serialization half).
 *
 * Plan 088 Phase 2 — T005.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { FRAME_TYPE_VIDEO, encodeFrame } from '../protocol/binary';
import {
  type ClientMessage,
  type ErrorCode,
  type InputEvent,
  type ServerMessage,
  type WindowDescriptor,
  type WindowStateName,
  encodeMessage,
  parseClientMessage,
} from '../protocol/messages';
import { FAKE_WINDOW } from './fixtures';

interface VideoManifest {
  codec: string;
  description: string;
  fps: number;
  width: number;
  height: number;
  source: string;
  frames: { file: string; keyframe: boolean; ptsMicros: number }[];
}

interface SessionEntry {
  id: string;
  ws: WebSocket | null;
  state: 'idle' | 'streaming' | 'unwatched' | 'closed';
  sequence: number; // monotonic per attach
  frameIndex: number; // next fixture frame to send
}

/** Read-only projection of a session (no socket handle). */
export interface FakeSessionView {
  id: string;
  state: SessionEntry['state'];
  sequence: number;
  frameIndex: number;
}

export interface FakeStreamdOptions {
  /** Override the video fixtures dir (default: ../protocol/fixtures/video). */
  fixturesDir?: string;
  /** Override fields of the pinned window descriptor. */
  window?: Partial<WindowDescriptor>;
}

export interface FakeStreamd {
  readonly url: string;
  readonly port: number;
  /** Flattened input events received from clients (AC-3 serialization check). */
  readonly inputLog: InputEvent[];
  /** Every parsed client message received, in order. */
  readonly received: ClientMessage[];
  listSessions(): FakeSessionView[];
  getSession(id: string): FakeSessionView | null;
  /** Stream the next `count` fixture frames (default: to end). Returns frames sent. */
  pushFrames(count?: number, session?: string): number;
  /** Simulate a server-side drop: advance the sequence by `n` without sending (gap). */
  dropFrames(n: number, session?: string): void;
  sendDisplaced(session?: string): void;
  sendWindowState(
    state: WindowStateName,
    dims?: { pixelWidth?: number; pixelHeight?: number },
    session?: string
  ): void;
  sendError(code: ErrorCode, message: string, fatal: boolean, session?: string): void;
  /** Emit a WS-level heartbeat ping to the viewer. */
  sendHeartbeatPing(session?: string): void;
  /** Abruptly drop the viewer socket (code 1011) — an UNEXPECTED close (R5/reconnect substrate). */
  dropViewer(session?: string): void;
  /** Simulate a down/restarting daemon: immediately close every new connection (R6 substrate). */
  failConnections(on: boolean): void;
  close(): Promise<void>;
}

function defaultFixturesDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'protocol', 'fixtures', 'video');
}

export async function startFakeStreamd(opts: FakeStreamdOptions = {}): Promise<FakeStreamd> {
  const fixturesDir = opts.fixturesDir ?? defaultFixturesDir();
  const manifest = JSON.parse(
    readFileSync(join(fixturesDir, 'manifest.json'), 'utf-8')
  ) as VideoManifest;
  const window: WindowDescriptor = { ...FAKE_WINDOW, ...opts.window };

  const sessions = new Map<string, SessionEntry>();
  const wsToSession = new Map<WebSocket, string>();
  const inputLog: InputEvent[] = [];
  const received: ClientMessage[] = [];
  let latestSession: string | null = null;
  let failNewConnections = false;

  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });
  const address = wss.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  function isOpen(ws: WebSocket | null): ws is WebSocket {
    return ws !== null && ws.readyState === WebSocket.OPEN;
  }
  function send(ws: WebSocket | null, msg: ServerMessage): void {
    if (isOpen(ws)) ws.send(encodeMessage(msg));
  }
  function sendBinary(ws: WebSocket | null, bytes: Uint8Array): void {
    if (isOpen(ws)) ws.send(bytes);
  }

  function streamFrame(entry: SessionEntry, idx: number, forceKeyframe?: boolean): void {
    const frame = manifest.frames[idx];
    if (!frame) return;
    const raw = readFileSync(join(fixturesDir, frame.file));
    const bytes = encodeFrame(
      {
        frameType: FRAME_TYPE_VIDEO,
        keyframe: forceKeyframe ?? frame.keyframe,
        sequence: entry.sequence,
        captureTimestampMicros: BigInt(frame.ptsMicros),
      },
      new Uint8Array(raw)
    );
    sendBinary(entry.ws, bytes);
    entry.sequence += 1;
  }

  /** Send a fresh keyframe (fixture frame 0) — used on attach/reattach/request-keyframe/resume. */
  function sendKeyframe(entry: SessionEntry): void {
    streamFrame(entry, 0, true);
    entry.frameIndex = 1;
  }

  function attach(ws: WebSocket, sessionId: string): void {
    const existing = sessions.get(sessionId);
    if (existing && existing.state === 'closed') {
      // Workshop 003: `detach` is an explicit close → the session is terminal.
      // A `hello` carrying a closed session id must NOT resurrect it, or the fake
      // would mask a T007/Phase-3 bug that accidentally reattaches a deleted
      // session. Reject with E_SESSION_UNKNOWN (→ sessionLost client-side). [F006]
      send(ws, { t: 'error', code: 'E_SESSION_UNKNOWN', message: 'session closed', fatal: true });
      ws.close(4404, 'session-unknown');
      return;
    }
    if (existing && existing.ws && existing.ws !== ws && isOpen(existing.ws)) {
      // R2: latest-attach-wins — displace the prior viewer.
      send(existing.ws, { t: 'displaced' });
      existing.ws.close(4002, 'displaced');
    }
    const entry: SessionEntry = existing ?? {
      id: sessionId,
      ws,
      state: 'streaming',
      sequence: 0,
      frameIndex: 0,
    };
    entry.ws = ws;
    entry.state = 'streaming';
    entry.sequence = 0;
    entry.frameIndex = 0;
    sessions.set(sessionId, entry);
    wsToSession.set(ws, sessionId);
    latestSession = sessionId;

    send(ws, { t: 'hello-ok', v: 1, session: sessionId, window });
    send(ws, {
      t: 'video-config',
      codec: manifest.codec,
      description: manifest.description,
      width: manifest.width,
      height: manifest.height,
      fps: manifest.fps,
    });
    sendKeyframe(entry); // first frame is always a keyframe (Workshop 003)
  }

  function resolveTarget(session?: string): SessionEntry | null {
    const sid = session ?? latestSession;
    return sid ? (sessions.get(sid) ?? null) : null;
  }

  wss.on('connection', (ws: WebSocket, req) => {
    if (failNewConnections) {
      // Simulated down/restarting daemon — drop immediately (unexpected close).
      ws.close(1011, 'daemon-down');
      return;
    }
    // Shape-only auth check (the real verify is the daemon's job, Task 4.4).
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.searchParams.get('session') || !url.searchParams.get('token')) {
      send(ws, { t: 'error', code: 'E_AUTH', message: 'missing session or token', fatal: true });
      ws.close(4401, 'auth');
      return;
    }

    ws.on('message', (data, isBinary) => {
      if (isBinary) return; // client → daemon control frames are text only
      const msg = parseClientMessage(data.toString());
      if (!msg) return; // ignore unknown/garbage (forward-compat)
      received.push(msg);

      switch (msg.t) {
        case 'hello':
          attach(ws, msg.session);
          break;
        case 'input':
          inputLog.push(...msg.events);
          break;
        case 'request-keyframe': {
          const entry = wsToSession.get(ws);
          if (entry) {
            const e = sessions.get(entry);
            if (e) sendKeyframe(e);
          }
          break;
        }
        case 'pause':
          break; // streaming is cue-driven in the fake; nothing to pause
        case 'resume': {
          const sid = wsToSession.get(ws);
          const e = sid ? sessions.get(sid) : undefined;
          if (e) sendKeyframe(e); // resume ⇒ keyframe (Workshop 003)
          break;
        }
        case 'ping':
          send(ws, { t: 'pong', sentAt: msg.sentAt, daemonAt: Date.now() });
          break;
        case 'detach': {
          const sid = wsToSession.get(ws);
          const e = sid ? sessions.get(sid) : undefined;
          if (e) e.state = 'closed';
          ws.close(1000, 'detached');
          break;
        }
      }
    });

    ws.on('close', () => {
      const sid = wsToSession.get(ws);
      if (sid) {
        const entry = sessions.get(sid);
        // Only the *current* viewer's close marks the session unwatched (R5/R9);
        // a displaced old socket's close must not (its slot was already replaced).
        if (entry && entry.ws === ws && entry.state !== 'closed') {
          entry.state = 'unwatched';
          entry.ws = null;
        }
      }
      wsToSession.delete(ws);
    });
  });

  return {
    url: `ws://127.0.0.1:${port}`,
    port,
    inputLog,
    received,
    listSessions: () =>
      [...sessions.values()].map((e) => ({
        id: e.id,
        state: e.state,
        sequence: e.sequence,
        frameIndex: e.frameIndex,
      })),
    getSession: (id) => {
      const e = sessions.get(id);
      return e ? { id: e.id, state: e.state, sequence: e.sequence, frameIndex: e.frameIndex } : null;
    },
    pushFrames: (count, session) => {
      const entry = resolveTarget(session);
      if (!entry || !isOpen(entry.ws)) return 0;
      const remaining = manifest.frames.length - entry.frameIndex;
      const max = count ?? remaining;
      let sent = 0;
      while (sent < max && entry.frameIndex < manifest.frames.length) {
        streamFrame(entry, entry.frameIndex);
        entry.frameIndex += 1;
        sent += 1;
      }
      return sent;
    },
    dropFrames: (n, session) => {
      const entry = resolveTarget(session);
      if (!entry) return;
      entry.sequence += n; // sequence jump = observable gap
      entry.frameIndex = Math.min(entry.frameIndex + n, manifest.frames.length);
    },
    sendDisplaced: (session) => {
      const entry = resolveTarget(session);
      if (entry && isOpen(entry.ws)) {
        send(entry.ws, { t: 'displaced' });
        entry.ws.close(4002, 'displaced');
      }
    },
    sendWindowState: (state, dims, session) => {
      const entry = resolveTarget(session);
      if (entry) send(entry.ws, { t: 'window-state', state, ...dims });
    },
    sendError: (code, message, fatal, session) => {
      const entry = resolveTarget(session);
      if (entry) send(entry.ws, { t: 'error', code, message, fatal });
    },
    sendHeartbeatPing: (session) => {
      const entry = resolveTarget(session);
      if (isOpen(entry?.ws ?? null)) entry?.ws?.ping();
    },
    dropViewer: (session) => {
      const entry = resolveTarget(session);
      if (entry && isOpen(entry.ws)) entry.ws.close(1011, 'drop'); // unexpected (code ≠ 1000)
    },
    failConnections: (on) => {
      failNewConnections = on;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const e of sessions.values()) {
          if (e.ws) e.ws.terminate();
        }
        wss.close(() => resolve());
      }),
  };
}
