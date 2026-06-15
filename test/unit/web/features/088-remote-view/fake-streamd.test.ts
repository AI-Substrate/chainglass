// @vitest-environment node
/**
 * Plan 088 Phase 2 — T005: frame-replay fake streamer daemon (AC-12).
 *
 * Drives the fake as a real `ws` client and asserts it speaks the full
 * Workshop-003 protocol and every scriptable Workshop-002 race cue. This is the
 * daemon-absent substrate the session hook (T007) and Phase 3 browser smoke run
 * against. Serial suite → ephemeral port + full teardown in afterEach.
 */
import { decodeFrameHeader } from '@/features/088-remote-view/protocol/binary';
import type { ServerMessage } from '@/features/088-remote-view/protocol/messages';
import { type FakeStreamd, startFakeStreamd } from '@/features/088-remote-view/testing/fake-streamd';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

let fake: FakeStreamd;
const clients: WebSocket[] = [];

class Client {
  ws: WebSocket;
  texts: ServerMessage[] = [];
  bins: Uint8Array[] = [];
  wsPings = 0;
  opened: Promise<void>;
  constructor(url: string, session: string, token: string | null) {
    const q = token === null ? `session=${session}` : `session=${session}&token=${token}`;
    this.ws = new WebSocket(`${url}/stream?${q}`);
    clients.push(this.ws);
    this.opened = new Promise((res) => this.ws.on('open', () => res()));
    this.ws.on('message', (data, isBinary) => {
      if (isBinary) this.bins.push(new Uint8Array(data as Buffer));
      else this.texts.push(JSON.parse(data.toString()) as ServerMessage);
    });
    this.ws.on('ping', () => {
      this.wsPings += 1;
    });
  }
  send(obj: unknown): void {
    this.ws.send(JSON.stringify(obj));
  }
  hello(session: string): void {
    this.send({ t: 'hello', v: 1, session });
  }
  textsOf(t: string): ServerMessage[] {
    return this.texts.filter((m) => m.t === t);
  }
  seqs(): number[] {
    return this.bins.map((b) => decodeFrameHeader(b)?.sequence ?? -1);
  }
}

async function waitFor(fn: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}

beforeEach(async () => {
  fake = await startFakeStreamd();
});
afterEach(async () => {
  for (const c of clients.splice(0)) c.terminate();
  await fake.close();
});

describe('fake-streamd', () => {
  it('drives hello → hello-ok → video-config → keyframe → deltas', async () => {
    /*
    Test Doc:
    - Why: the fake must reproduce the real attach handshake so the viewport reaches `live` with no daemon (AC-12).
    - Contract: after hello, the client receives hello-ok (pinned window) + video-config (from manifest) + a binary keyframe (seq 0); pushFrames streams deltas with incrementing sequence.
    - Usage Notes: binary frames decode via decodeFrameHeader; first frame keyframe=true.
    - Quality Contribution: proves the core replay path the whole phase depends on.
    - Worked Example: hello → keyframe seq0 → pushFrames(3) → seq 1,2,3.
    */
    const c = new Client(fake.url, 'ses_a', 'tok');
    await c.opened;
    c.hello('ses_a');
    await waitFor(() => c.textsOf('hello-ok').length > 0 && c.textsOf('video-config').length > 0 && c.bins.length >= 1);
    const helloOk = c.textsOf('hello-ok')[0] as Extract<ServerMessage, { t: 'hello-ok' }>;
    expect(helloOk.window.id).toBe(34202);
    expect(helloOk.window.app).toBe('Godot');
    const config = c.textsOf('video-config')[0] as Extract<ServerMessage, { t: 'video-config' }>;
    expect(config.codec).toBe('avc1.640020');
    expect(config.width).toBe(800);
    const first = decodeFrameHeader(c.bins[0]);
    expect(first?.keyframe).toBe(true);
    expect(first?.sequence).toBe(0);

    const sent = fake.pushFrames(3);
    expect(sent).toBe(3);
    await waitFor(() => c.bins.length >= 4);
    expect(c.seqs().slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(decodeFrameHeader(c.bins[1])?.keyframe).toBe(false);
  });

  it('reattach: R2 displaces a live viewer; R1 resumes an unwatched session with a keyframe', async () => {
    /*
    Test Doc:
    - Why: refresh (R1) and second-tab (R2) are the headline session races — both must resolve to the new viewer holding the slot with a fresh keyframe.
    - Contract: a 2nd hello on a live session → old viewer gets `displaced`+close(4002), new viewer gets a keyframe; a hello after a clean close → session was `unwatched`, resumes streaming.
    - Usage Notes: latest-attach-wins; the displaced old socket's close must not reset the new viewer's slot.
    - Quality Contribution: gives T007 the R1/R2 substrate.
    - Worked Example: A live → B hello → A displaced → B keyframe; close B → unwatched → C hello → streaming.
    */
    const a = new Client(fake.url, 'ses_x', 'tok');
    await a.opened;
    a.hello('ses_x');
    await waitFor(() => a.bins.length >= 1);

    // R2: B attaches the same session → A displaced.
    const b = new Client(fake.url, 'ses_x', 'tok');
    await b.opened;
    b.hello('ses_x');
    await waitFor(() => a.textsOf('displaced').length > 0 && b.bins.length >= 1);
    expect(decodeFrameHeader(b.bins[0])?.keyframe).toBe(true);
    expect(fake.getSession('ses_x')?.state).toBe('streaming');

    // R1: clean-close B → unwatched; C reattaches → resumes with keyframe.
    b.ws.close(1000);
    await waitFor(() => fake.getSession('ses_x')?.state === 'unwatched');
    const c = new Client(fake.url, 'ses_x', 'tok');
    await c.opened;
    c.hello('ses_x');
    await waitFor(() => c.bins.length >= 1);
    expect(decodeFrameHeader(c.bins[0])?.keyframe).toBe(true);
    expect(fake.getSession('ses_x')?.state).toBe('streaming');
  });

  it('ping→pong, WS heartbeat ping, and socket-death → unwatched (R5)', async () => {
    /*
    Test Doc:
    - Why: clock-offset (pong), liveness (heartbeat), and crashed-tab detection (R5) are all needed by the HUD + session machine.
    - Contract: ping{sentAt} → pong{sentAt,daemonAt}; sendHeartbeatPing → client sees a WS ping; an abrupt terminate → session goes `unwatched`.
    - Usage Notes: heartbeat uses WS-level ping frames (ws.ping), not a JSON message.
    - Quality Contribution: gives T007 the R5 + clock substrate.
    - Worked Example: terminate the socket → getSession().state === 'unwatched'.
    */
    const c = new Client(fake.url, 'ses_p', 'tok');
    await c.opened;
    c.hello('ses_p');
    await waitFor(() => c.bins.length >= 1);

    c.send({ t: 'ping', sentAt: 12345 });
    await waitFor(() => c.textsOf('pong').length > 0);
    const pong = c.textsOf('pong')[0] as Extract<ServerMessage, { t: 'pong' }>;
    expect(pong.sentAt).toBe(12345);
    expect(typeof pong.daemonAt).toBe('number');

    fake.sendHeartbeatPing('ses_p');
    await waitFor(() => c.wsPings >= 1);

    c.ws.terminate(); // crashed tab — no clean close
    await waitFor(() => fake.getSession('ses_p')?.state === 'unwatched');
  });

  it('honours request-keyframe and resume (both yield a fresh keyframe)', async () => {
    /*
    Test Doc:
    - Why: decoder reset / degraded-entry / resume must each get an IDR so the client never decodes a delta cold (Workshop 003 keyframe rule).
    - Contract: request-keyframe and resume each produce a new binary frame with keyframe=true.
    - Usage Notes: after streaming deltas, a request-keyframe re-sends the IDR.
    - Quality Contribution: covers the keyframe-on-demand path the hook uses on degraded entry.
    - Worked Example: live + deltas → request-keyframe → next binary keyframe=true.
    */
    const c = new Client(fake.url, 'ses_k', 'tok');
    await c.opened;
    c.hello('ses_k');
    await waitFor(() => c.bins.length >= 1);
    fake.pushFrames(2);
    await waitFor(() => c.bins.length >= 3);

    const before = c.bins.length;
    c.send({ t: 'request-keyframe' });
    await waitFor(() => c.bins.length > before);
    expect(decodeFrameHeader(c.bins[c.bins.length - 1])?.keyframe).toBe(true);

    const before2 = c.bins.length;
    c.send({ t: 'resume' });
    await waitFor(() => c.bins.length > before2);
    expect(decodeFrameHeader(c.bins[c.bins.length - 1])?.keyframe).toBe(true);
  });

  it('cue API emits displaced / window-state / error on demand', async () => {
    /*
    Test Doc:
    - Why: the R1–R9 races and AC-7/AC-10/AC-14 UI states need scriptable cues without macOS.
    - Contract: sendWindowState/sendError deliver the matching server message; sendDisplaced delivers `displaced` and closes the socket.
    - Usage Notes: cues target the latest session by default.
    - Quality Contribution: the scripting surface the hook + Phase 3 smoke drive states from.
    - Worked Example: sendError('E_PERMISSION',…) → client gets {t:'error',code:'E_PERMISSION'}.
    */
    const c = new Client(fake.url, 'ses_c', 'tok');
    await c.opened;
    c.hello('ses_c');
    await waitFor(() => c.bins.length >= 1);

    fake.sendWindowState('resized', { pixelWidth: 1280, pixelHeight: 1024 });
    fake.sendError('E_PERMISSION', 'Screen Recording not granted', true);
    await waitFor(() => c.textsOf('window-state').length > 0 && c.textsOf('error').length > 0);
    const ws0 = c.textsOf('window-state')[0] as Extract<ServerMessage, { t: 'window-state' }>;
    expect(ws0.state).toBe('resized');
    expect(ws0.pixelWidth).toBe(1280);
    const err = c.textsOf('error')[0] as Extract<ServerMessage, { t: 'error' }>;
    expect(err.code).toBe('E_PERMISSION');

    fake.sendDisplaced('ses_c');
    await waitFor(() => c.textsOf('displaced').length > 0);
  });

  it('drop-simulation produces an observable sequence gap, and logs input', async () => {
    /*
    Test Doc:
    - Why: the HUD counts dropped frames via sequence gaps, and AC-3 needs input serialization proven.
    - Contract: dropFrames(n) makes the next frame's sequence jump by n; received input events land in inputLog in order.
    - Usage Notes: a gap (e.g. 2→8) is what the degraded/HUD logic keys on.
    - Quality Contribution: the drop + input-log substrate for T007 and AC-3.
    - Worked Example: seqs [0,1,2] then dropFrames(5) + pushFrames(1) → next seq 8.
    */
    const c = new Client(fake.url, 'ses_d', 'tok');
    await c.opened;
    c.hello('ses_d');
    await waitFor(() => c.bins.length >= 1);
    fake.pushFrames(2);
    await waitFor(() => c.bins.length >= 3);
    fake.dropFrames(5);
    fake.pushFrames(1);
    await waitFor(() => c.bins.length >= 4);
    const seqs = c.seqs();
    expect(seqs.slice(0, 3)).toEqual([0, 1, 2]);
    expect(seqs[3]).toBe(8); // jumped from 2 → 8 (a 5-frame gap)

    c.send({
      t: 'input',
      events: [
        { k: 'mousemove', x: 0.5, y: 0.5 },
        { k: 'keydown', code: 'KeyW', modifiers: { shift: false, ctrl: false, alt: false, meta: false } },
      ],
    });
    await waitFor(() => fake.inputLog.length >= 2);
    expect(fake.inputLog[0].k).toBe('mousemove');
    expect(fake.inputLog[1].k).toBe('keydown');
  });

  it('rejects a connection missing session/token (shape-only auth) with E_AUTH', async () => {
    /*
    Test Doc:
    - Why: the stream socket must meet the terminal socket's auth bar (AC-9); a tokenless upgrade is refused.
    - Contract: connecting without a token → {t:'error',code:'E_AUTH'} then close.
    - Usage Notes: shape-only here (real JWT verify is the daemon's job, Task 4.4).
    - Quality Contribution: pins the fake's auth-shape gate so the hook's error path has a trigger.
    - Worked Example: ws ?session=x (no token) → error E_AUTH.
    */
    const c = new Client(fake.url, 'ses_n', null);
    await c.opened;
    await waitFor(() => c.textsOf('error').length > 0);
    expect((c.textsOf('error')[0] as Extract<ServerMessage, { t: 'error' }>).code).toBe('E_AUTH');
  });
});
