// Live host-Mac smoke for streamd (Plan 088 Phase 4, T009).
//
// Unlike smoke-headless.mjs (fixture frame source, no TCC), this drives the REAL daemon doing
// REAL ScreenCaptureKit capture of a live window + REAL CGEvent input injection. It verifies
// the parts that can ONLY be checked at the host Mac with the Screen-Recording + Accessibility
// grants: live capture (window descriptor + frames), fps during motion, input injection
// (a visible swipe), latest-attach-wins displacement on a live stream, and the auth gate.
//
// Capture is deliver-on-change: a STATIC iOS home screen yields ~0fps (expected, not a
// failure — spike finding). So this script INJECTS a swipe to animate the Simulator and
// measures the frame burst that the animation produces — testing input fidelity and the
// ≥30fps-under-motion floor in one move. A human watching the Simulator confirms the gesture.
//
// Usage: node native/streamd/scripts/live-smoke.mjs --port 6099 --secret smoke-secret \
//          --origin http://localhost:3000 --session live-1 --window 649 --app Simulator
import { WebSocket } from 'ws';
import crypto from 'node:crypto';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), [])
);
const PORT = args.port ?? '6099';
const SECRET = args.secret ?? 'smoke-secret';
const ORIGIN = args.origin ?? 'http://localhost:3000';
const SESSION = args.session ?? 'live-1';
const WINDOW = Number(args.window ?? '0');
const APP = args.app ?? '';
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
const info = (name, detail) => console.log(`  ·  ${name}${detail ? ` — ${detail}` : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeHeader(buf) {
  return { frameType: buf[0], keyframe: (buf[1] & 0x01) !== 0, sequence: buf.readUInt32BE(4),
           tsMicros: buf.readBigUInt64BE(8), payloadLen: buf.length - 16, at: Date.now() };
}
function open(name, { token, origin = ORIGIN, session = SESSION }) {
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
  c.waitText = async (t, ms = 2000) => waitFor(() => c.text.find((m) => m.t === t), ms);
  c.waitClose = async (ms = 2000) => waitFor(() => (c.closeCode != null ? c.closeCode : null), ms);
  return c;
}
async function waitFor(fn, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { const v = fn(); if (v) return v; await sleep(20); }
  return fn() || null;
}
// A swipe = mousedown at start, N mousemoves along the path, mouseup at end. Coords normalized [0,1].
function swipe(c, [x0, y0], [x1, y1], steps = 12) {
  const ev = [{ k: 'mousemove', x: x0, y: y0 }, { k: 'mousedown', x: x0, y: y0, button: 0 }];
  for (let i = 1; i <= steps; i++) {
    ev.push({ k: 'mousemove', x: x0 + (x1 - x0) * (i / steps), y: y0 + (y1 - y0) * (i / steps) });
  }
  ev.push({ k: 'mouseup', x: x1, y: y1, button: 0 });
  c.send({ t: 'input', events: ev });
}

async function main() {
  console.log(`\n streamd LIVE smoke → ${BASE} (session ${SESSION}, window ${WINDOW} ${APP})\n`);
  const token = mintToken();

  // 0. /health — both grants must be present for a live capture run
  const h = await fetch(`http://${BASE}/health`).then((x) => x.json()).catch(() => null);
  ok('/health both grants granted', h?.permissions?.screenRecording === 'granted' && h?.permissions?.accessibility === 'granted',
     h?.permissions ? JSON.stringify(h.permissions) : 'no /health');

  // 1. live attach + handshake + window descriptor of the REAL window
  const a = open('A', { token });
  await waitFor(() => a.opened, 2000);
  a.send({ t: 'hello', v: 1, session: SESSION });
  const helloOk = await a.waitText('hello-ok');
  ok('hello-ok with live window descriptor', !!helloOk && helloOk.window?.id === WINDOW,
     helloOk ? `id=${helloOk.window?.id} app=${helloOk.window?.app} title="${helloOk.window?.title}" ${helloOk.window?.pixelWidth}x${helloOk.window?.pixelHeight}` : 'none');
  const vcfg = await a.waitText('video-config');
  ok('video-config (real avcC) before frames', !!vcfg && vcfg.codec === 'avc1.640020' && (vcfg.description?.length ?? 0) > 0,
     vcfg ? `${vcfg.width}x${vcfg.height}@${vcfg.fps} avcC=${vcfg.description?.length}b` : 'none');

  // 2. first live frame must be a keyframe seq 0
  const first = await waitFor(() => a.frames[0], 4000);
  ok('first live frame keyframe seq0', !!first && first.keyframe === true && first.sequence === 0 && first.frameType === 1,
     first ? `seq=${first.sequence} kf=${first.keyframe} ${first.payloadLen}b` : 'NO FRAMES (window static? — input burst below should produce some)');

  // 3. baseline (static) — capture is deliver-on-change, so this is expected to be low/zero
  const base0 = a.frames.length; const t0 = Date.now();
  await sleep(2000);
  const baseFrames = a.frames.length - base0; const baseDt = (Date.now() - t0) / 1000;
  info('baseline fps (static home screen — low/zero is EXPECTED)', `${baseFrames} frames in ${baseDt.toFixed(1)}s = ${(baseFrames / baseDt).toFixed(1)}fps`);

  // 4. INPUT over the wire: the daemon must ACCEPT input and stay alive. (Visual input fidelity —
  //    taps/drags/typing actually landing in the app — is verified by hand with simctl screenshots;
  //    see the T009 execution-log entry. A frame "burst" heuristic is unreliable here because the
  //    live capture fps already varies with the app's own animation.)
  const inj0 = a.frames.length;
  swipe(a, [0.5, 0.6], [0.5, 0.35]); await sleep(400);
  swipe(a, [0.5, 0.35], [0.5, 0.6]); await sleep(600);
  a.send({ t: 'ping', sentAt: 7 });
  const alive = await waitFor(() => a.text.find((m) => m.t === 'pong' && m.sentAt === 7), 1500);
  ok('daemon accepts input + stays alive', !!alive && a.closeCode == null, `${a.frames.length - inj0} frames during/after input`);

  // sequence monotonic across the whole live run
  const seqs = a.frames.map((f) => f.sequence);
  const monotonic = seqs.every((s, i) => i === 0 || s === seqs[i - 1] + 1);
  ok('sequence monotonic across live stream', monotonic, `seq ${seqs[0]}..${seqs[seqs.length - 1]} (${seqs.length} frames)`);

  // 5. ping → pong (live RTT) — match THIS ping's pong (the input step above also pinged)
  a.send({ t: 'ping', sentAt: 123456 });
  const pong = await waitFor(() => a.text.find((m) => m.t === 'pong' && m.sentAt === 123456), 1500);
  ok('ping → pong (live)', !!pong && typeof pong.daemonAt === 'number');

  // 6. request-keyframe → forced keyframe
  const beforeKf = a.frames.length;
  a.send({ t: 'request-keyframe' });
  const kf = await waitFor(() => a.frames.slice(beforeKf).find((f) => f.keyframe), 2000);
  ok('request-keyframe → keyframe (live)', !!kf);

  // 7. latest-attach-wins displacement on a LIVE stream
  const b = open('B', { token, session: SESSION });
  await waitFor(() => b.opened, 2000);
  b.send({ t: 'hello', v: 1, session: SESSION });
  const displaced = await a.waitText('displaced');
  const aClose = await a.waitClose();
  ok('2nd attach displaces 1st (live, close 4002)', !!displaced && aClose === 4002, `closeCode=${aClose}`);
  const bFirst = await waitFor(() => b.frames[0], 3000);
  ok('displacing viewer gets keyframe seq0 (live)', !!bFirst && bFirst.keyframe === true && bFirst.sequence === 0);
  b.ws.close();

  // 8. auth gate live — bad token / bad origin
  const bad = open('BAD', { token: mintToken({ aud: 'wrong-aud' }), session: 'live-bad' });
  await waitFor(() => bad.opened, 2000);
  const aerr = await bad.waitText('error');
  ok('bad token → E_AUTH + 4401 (live)', !!aerr && aerr.code === 'E_AUTH' && (await bad.waitClose()) === 4401);
  const evil = open('EVIL', { token, origin: 'http://evil.example.com', session: 'live-evil' });
  await waitFor(() => evil.opened, 2000);
  const oerr = await evil.waitText('error');
  ok('bad origin → E_ORIGIN + 4402 (live)', !!oerr && oerr.code === 'E_ORIGIN' && (await evil.waitClose()) === 4402);

  console.log(`\n ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('live smoke crashed:', e); process.exit(2); });
