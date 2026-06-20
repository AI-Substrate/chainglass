// Headless wire-protocol smoke for streamd (Plan 088 Phase 4, T006).
//
// Drives the REAL daemon binary (fixture frame source, no TCC grant) with a real `ws`
// client over an authenticated socket — the daemon-side equivalent of the Phase-3 browser
// stream smoke. Verifies: auth gate (good/bad token, bad origin), handshake order, binary
// frame streaming (keyframe seq 0 + monotonic sequence), ping→pong, request-keyframe,
// latest-attach-wins displacement (4002), detach→bye+1000, E_VERSION, unknown-t tolerance,
// and the /health + /sessions REST shapes.
//
// Usage: node smoke-headless.mjs --port <n> --secret <s> --origin <o>
import { WebSocket } from 'ws';
import crypto from 'node:crypto';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), [])
);
const PORT = args.port ?? '6099';
const SECRET = args.secret ?? 'smoke-secret';
const ORIGIN = args.origin ?? 'http://localhost:3000';
const BASE = `127.0.0.1:${PORT}`;

const b64url = (buf) => Buffer.from(buf).toString('base64url');
function mintToken({ sub = 'remote-user', iss = 'chainglass', aud = 'remote-view-ws', expSec = 300 } = {}) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ sub, iss, aud, iat: now, exp: now + expSec }));
  const sig = b64url(crypto.createHmac('sha256', Buffer.from(SECRET)).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { (cond ? pass++ : fail++); console.log(`${cond ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeHeader(buf) {
  return {
    frameType: buf[0],
    keyframe: (buf[1] & 0x01) !== 0,
    sequence: buf.readUInt32BE(4),
    tsMicros: buf.readBigUInt64BE(8),
    payloadLen: buf.length - 16,
  };
}

function open(name, { token, origin = ORIGIN, session = 'smoke-1' }) {
  const url = `ws://${BASE}/stream?session=${session}&token=${token}`;
  const ws = new WebSocket(url, { headers: { Origin: origin } });
  const c = { ws, name, text: [], frames: [], closeCode: null, opened: false };
  ws.on('message', (data, isBinary) => {
    if (isBinary) c.frames.push(decodeHeader(Buffer.from(data)));
    else { try { c.text.push(JSON.parse(data.toString())); } catch {} }
  });
  ws.on('open', () => { c.opened = true; });
  ws.on('close', (code) => { c.closeCode = code; });
  c.send = (obj) => ws.send(JSON.stringify(obj));
  c.waitText = async (t, ms = 1500) => waitFor(() => c.text.find((m) => m.t === t), ms);
  c.waitClose = async (ms = 1500) => waitFor(() => (c.closeCode != null ? c.closeCode : null), ms);
  c.waitFrames = async (n, ms = 2000) => waitFor(() => (c.frames.length >= n ? c.frames : null), ms);
  return c;
}
async function waitFor(fn, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const v = fn(); if (v) return v; await sleep(20); }
  return fn() || null;
}

async function main() {
  console.log(`\n streamd headless smoke → ${BASE} (origin ${ORIGIN})\n`);
  const token = mintToken();

  // 1. /health
  {
    const r = await fetch(`http://${BASE}/health`).then((x) => x.json()).catch(() => null);
    ok('/health ok+versions', !!r && r.ok === true && r.protocolVersion === 1 && typeof r.daemonVersion === 'string',
       r ? `daemonVersion=${r.daemonVersion}` : 'no response');
    ok('/health named grants', !!r?.permissions && 'screenRecording' in r.permissions && 'accessibility' in r.permissions,
       r?.permissions ? JSON.stringify(r.permissions) : '');
  }

  // 2. handshake + streaming
  const a = open('A', { token });
  await waitFor(() => a.opened, 1500);
  a.send({ t: 'hello', v: 1, session: 'smoke-1' });
  const helloOk = await a.waitText('hello-ok');
  ok('hello-ok received', !!helloOk && helloOk.window?.id === 34202, helloOk ? `window=${helloOk.window?.app}` : '');
  const vcfg = await a.waitText('video-config');
  ok('video-config before frames', !!vcfg && vcfg.codec === 'avc1.640020' && typeof vcfg.description === 'string' && vcfg.description.length > 0,
     vcfg ? `${vcfg.width}x${vcfg.height}@${vcfg.fps}` : '');
  const frames = await a.waitFrames(10);
  ok('binary frames stream', !!frames && frames.length >= 10, frames ? `${frames.length} frames` : '');
  if (frames) {
    ok('first frame keyframe seq0', frames[0].keyframe === true && frames[0].sequence === 0 && frames[0].frameType === 1);
    const seqs = frames.map((f) => f.sequence);
    const monotonic = seqs.every((s, i) => i === 0 || s === seqs[i - 1] + 1);
    ok('sequence monotonic per attach', monotonic, `seq ${seqs[0]}..${seqs[seqs.length - 1]}`);
    ok('avcc payload non-empty', frames.every((f) => f.payloadLen > 0));
  }

  // 3. ping → pong
  a.send({ t: 'ping', sentAt: 424242 });
  const pong = await a.waitText('pong');
  ok('ping → pong', !!pong && pong.sentAt === 424242 && typeof pong.daemonAt === 'number');

  // 4. request-keyframe → a keyframe arrives
  const before = a.frames.length;
  a.send({ t: 'request-keyframe' });
  const kf = await waitFor(() => a.frames.slice(before).find((f) => f.keyframe), 1500);
  ok('request-keyframe → keyframe', !!kf);

  // 5. unknown t tolerated (no close), still responsive
  a.send({ t: 'totally-unknown-message', foo: 1 });
  a.send({ t: 'ping', sentAt: 99 });
  const pong2 = await waitFor(() => a.text.filter((m) => m.t === 'pong').find((m) => m.sentAt === 99), 1000);
  ok('unknown t ignored (still alive)', !!pong2 && a.closeCode == null);

  // 6. displacement (latest-attach-wins → A gets displaced + 4002)
  const b = open('B', { token, session: 'smoke-1' });
  await waitFor(() => b.opened, 1500);
  b.send({ t: 'hello', v: 1, session: 'smoke-1' });
  const displaced = await a.waitText('displaced');
  const aClose = await a.waitClose();
  ok('2nd attach displaces 1st', !!displaced && aClose === 4002, `closeCode=${aClose}`);
  const bFrames = await b.waitFrames(3);
  ok('displacing viewer streams', !!bFrames && bFrames[0]?.keyframe === true && bFrames[0]?.sequence === 0);
  b.ws.close();

  // 7. detach → bye{detached} + close 1000
  const d = open('D', { token, session: 'smoke-detach' });
  await waitFor(() => d.opened, 1500);
  d.send({ t: 'hello', v: 1, session: 'smoke-detach' });
  await d.waitText('hello-ok');
  d.send({ t: 'detach' });
  const bye = await d.waitText('bye');
  const dClose = await d.waitClose();
  ok('detach → bye{detached} + 1000', !!bye && bye.reason === 'detached' && dClose === 1000, `reason=${bye?.reason} code=${dClose}`);

  // 8. E_VERSION (hello v≠1, before hello-ok)
  const v = open('V', { token, session: 'smoke-ver' });
  await waitFor(() => v.opened, 1500);
  v.send({ t: 'hello', v: 2, session: 'smoke-ver' });
  const verr = await v.waitText('error');
  ok('hello v≠1 → E_VERSION fatal', !!verr && verr.code === 'E_VERSION' && verr.fatal === true);
  v.ws.close();

  // 9. bad token → E_AUTH 4401
  const bad = open('BAD', { token: mintToken({ aud: 'wrong-aud' }), session: 'smoke-bad' });
  await waitFor(() => bad.opened, 1500);
  const aerr = await bad.waitText('error');
  const badClose = await bad.waitClose();
  ok('bad token → E_AUTH + 4401', !!aerr && aerr.code === 'E_AUTH' && badClose === 4401, `code=${badClose}`);

  // 10. bad origin → E_ORIGIN 4402
  const evil = open('EVIL', { token, origin: 'http://evil.example.com', session: 'smoke-evil' });
  await waitFor(() => evil.opened, 1500);
  const oerr = await evil.waitText('error');
  const evilClose = await evil.waitClose();
  ok('bad origin → E_ORIGIN + 4402', !!oerr && oerr.code === 'E_ORIGIN' && evilClose === 4402, `code=${evilClose}`);

  // 11. /sessions flat SessionSummary (now JWT-gated — token required)
  {
    const r = await fetch(`http://${BASE}/sessions?token=${token}`).then((x) => x.json()).catch(() => null);
    const list = r?.sessions ?? [];
    const shapeOk = Array.isArray(list) && list.length > 0 &&
      list.every((s) => 'sessionId' in s && 'windowId' in s && 'state' in s && 'app' in s && 'title' in s);
    ok('/sessions flat SessionSummary', shapeOk, `${list.length} sessions, states=[${list.map((s) => s.state).join(',')}]`);
  }

  // 12. REST auth — only /health is public; every other endpoint needs a daemon JWT (F002)
  {
    const status = (path, opts) => fetch(`http://${BASE}${path}`, opts).then((r) => r.status).catch(() => 0);
    ok('GET /windows  no token → 401', (await status('/windows')) === 401);
    ok('GET /sessions no token → 401', (await status('/sessions')) === 401);
    ok('POST /sessions no token → 401', (await status('/sessions', { method: 'POST', body: '{}' })) === 401);
    ok('DELETE /sessions/:id no token → 401', (await status('/sessions/smoke-1', { method: 'DELETE' })) === 401);
    ok('GET /health stays public (200)', (await status('/health')) === 200);
    // With a valid token, /windows is the narrowed single-window contract (F005)
    const w = await fetch(`http://${BASE}/windows?token=${token}`).then((r) => r.json()).catch(() => null);
    ok('GET /windows token → narrowed single window', !!w && w.single === true && w.count === 1 &&
       Array.isArray(w.windows) && w.windows.length === 1, w ? `id=${w.windows?.[0]?.id}` : 'no response');
  }

  // 13. listener bound to loopback only — a non-loopback interface must NOT be reachable (F001)
  {
    const os = await import('node:os');
    const nonLoopback = Object.values(os.networkInterfaces()).flat()
      .find((n) => n && n.family === 'IPv4' && !n.internal)?.address;
    if (!nonLoopback) {
      ok('non-loopback unreachable (skipped: no external IPv4)', true, 'no non-loopback IPv4 on this host');
    } else {
      let reachable = false;
      try { reachable = (await fetch(`http://${nonLoopback}:${PORT}/health`, { signal: AbortSignal.timeout(800) })).ok; }
      catch { reachable = false; }
      ok('daemon not reachable on non-loopback iface', reachable === false, `tried ${nonLoopback}:${PORT}`);
    }
  }

  // 14. pre-hello controls are no-ops — a valid-token socket cannot drive input/pause/keyframe
  //     before it attaches (F003). The (ignored) pause must NOT freeze the stream after hello.
  {
    const p = open('PRE', { token, session: 'smoke-prehello' });
    await waitFor(() => p.opened, 1500);
    p.send({ t: 'pause' });               // would freeze the stream if the gate were missing
    p.send({ t: 'request-keyframe' });
    p.send({ t: 'input', events: [{ type: 'mousedown', x: 0.5, y: 0.5, button: 0 }] });
    await sleep(150);
    ok('pre-hello controls do not close the socket', p.closeCode == null);
    p.send({ t: 'hello', v: 1, session: 'smoke-prehello' });
    const helloOkP = await p.waitText('hello-ok');
    const framesP = await p.waitFrames(5);
    ok('stream healthy after ignored pre-hello controls',
       !!helloOkP && !!framesP && framesP.length >= 5 && framesP[0].keyframe === true);
    p.ws.close();
  }

  // 15. malformed Content-Length is rejected (400) and does NOT crash the daemon (F004)
  {
    const net = await import('node:net');
    const rawStatus = await new Promise((resolve) => {
      let buf = '';
      const code = () => { const m = buf.match(/^HTTP\/1\.1 (\d+)/); return m ? Number(m[1]) : 0; };
      const sock = net.connect(Number(PORT), '127.0.0.1', () => {
        sock.write('POST /sessions HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: -1\r\n\r\n');
      });
      sock.on('data', (d) => { buf += d.toString(); });
      sock.on('close', () => resolve(code()));
      sock.on('error', () => resolve(code()));
      setTimeout(() => { try { sock.destroy(); } catch {} resolve(code()); }, 1000);
    });
    ok('negative Content-Length → 400', rawStatus === 400, `status=${rawStatus}`);
    const alive = await fetch(`http://${BASE}/health`).then((r) => r.ok).catch(() => false);
    ok('daemon alive after malformed request', alive === true);
  }

  // 16. POST /sessions body validation — a non-empty body MUST be a JSON object; empty/valid → 200,
  //     malformed/non-object → 400 (no silent default-create on garbage) (F009/FT-009)
  {
    const post = (body) => fetch(`http://${BASE}/sessions?token=${token}`, { method: 'POST', body })
      .then((r) => r.status).catch(() => 0);
    ok('POST /sessions malformed body → 400', (await post('not json at all')) === 400);
    ok('POST /sessions non-object (array) → 400', (await post('[1,2,3]')) === 400);
    ok('POST /sessions empty body → 200', (await post('')) === 200);
    ok('POST /sessions valid {} → 200', (await post('{}')) === 200);
  }

  // 17. pause lifecycle — a viewer that pauses the global frame source then disconnects without
  //     resuming must NOT wedge the next viewer; attach resumes the source (F002/FT-002).
  {
    const p1 = open('PAUSE1', { token, session: 'smoke-pause' });
    await waitFor(() => p1.opened, 1500);
    p1.send({ t: 'hello', v: 1, session: 'smoke-pause' });
    await p1.waitText('hello-ok');
    await p1.waitFrames(3);          // confirm it is streaming first
    p1.send({ t: 'pause' });         // pause the GLOBAL source…
    await sleep(150);
    p1.ws.close();                   // …and leave without resuming
    await sleep(200);

    const p2 = open('PAUSE2', { token, session: 'smoke-pause2' });
    await waitFor(() => p2.opened, 1500);
    p2.send({ t: 'hello', v: 1, session: 'smoke-pause2' });
    const okP2 = await p2.waitText('hello-ok');
    const framesP2 = await p2.waitFrames(5, 3000);
    ok('attach after orphaned pause still streams', !!okP2 && !!framesP2 && framesP2.length >= 5,
       framesP2 ? `${framesP2.length} frames` : 'no frames — source wedged paused');
    p2.ws.close();
  }

  a.ws.close();
  console.log(`\n ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('smoke crashed:', e); process.exit(2); });
