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

  // 11. /sessions flat SessionSummary
  {
    const r = await fetch(`http://${BASE}/sessions`).then((x) => x.json()).catch(() => null);
    const list = r?.sessions ?? [];
    const shapeOk = Array.isArray(list) && list.length > 0 &&
      list.every((s) => 'sessionId' in s && 'windowId' in s && 'state' in s && 'app' in s && 'title' in s);
    ok('/sessions flat SessionSummary', shapeOk, `${list.length} sessions, states=[${list.map((s) => s.state).join(',')}]`);
  }

  a.ws.close();
  console.log(`\n ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('smoke crashed:', e); process.exit(2); });
