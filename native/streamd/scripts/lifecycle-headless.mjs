// Headless lifecycle smoke for streamd (Plan 088 Phase 4, T008).
//
// Verifies the registry + lifecycle paths that need NO TCC grant: the discovery registry is
// written on listen with the right fields; SIGTERM sends `bye{shutdown}` to the viewer then
// closes + removes the registry + exits; deleting the registry self-exits the daemon (~poll).
//
// Usage: node lifecycle-headless.mjs --bin <path> --fixtures <dir>
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), [])
);
const BIN = args.bin;
const FIX = args.fixtures;
const SECRET = 'life-secret';
const ORIGIN = 'http://localhost:3000';

const b64url = (b) => Buffer.from(b).toString('base64url');
function mintToken() {
  const h = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const p = b64url(JSON.stringify({ sub: 'u', iss: 'chainglass', aud: 'remote-view-ws', iat: now, exp: now + 300 }));
  const s = b64url(crypto.createHmac('sha256', Buffer.from(SECRET)).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(30); } return fn() || null; }

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { (c ? pass++ : fail++); console.log(`${c ? '  ✅' : '  ❌'} ${n}${d ? ` — ${d}` : ''}`); };

function spawnDaemon(port, registry, extraEnv = {}) {
  return spawn(BIN, ['--port', String(port), '--registry', registry], {
    env: { ...process.env, AUTH_SECRET: SECRET, CG_REMOTE_VIEW__FIXTURES_DIR: FIX,
           CG_REMOTE_VIEW__ALLOWED_ORIGINS: ORIGIN, CG_REMOTE_VIEW__VANISH_POLL_SECONDS: '1', ...extraEnv },
    stdio: 'ignore',
  });
}

async function main() {
  console.log('\n streamd lifecycle smoke (registry / SIGTERM→bye / vanish→exit)\n');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'streamd-life-'));

  // ── Part A: registry write + SIGTERM → bye{shutdown} ─────────────────────────
  const regA = path.join(dir, '.chainglass/streamd-4500.json');
  const a = spawnDaemon(6098, regA);
  let aExited = null; a.on('exit', (code) => { aExited = code ?? 0; });

  const wrote = await waitFor(() => (fs.existsSync(regA) ? true : null), 4000);
  ok('registry written on listen', !!wrote);
  if (wrote) {
    const reg = JSON.parse(fs.readFileSync(regA, 'utf-8'));
    ok('registry fields correct', reg.pid === a.pid && reg.port === 6098 && reg.protocolVersion === 1 &&
       typeof reg.daemonVersion === 'string' && reg.bundleId === 'com.chainglass.streamd' && !('daemonPort' in reg),
       `pid=${reg.pid} port=${reg.port} v=${reg.daemonVersion}`);
  }

  // attach a viewer, then SIGTERM the daemon → expect bye{shutdown} + close
  const token = mintToken();
  const ws = new WebSocket(`ws://127.0.0.1:6098/stream?session=life&token=${token}`, { headers: { Origin: ORIGIN } });
  const text = []; let closeCode = null;
  ws.on('message', (d, isBin) => { if (!isBin) { try { text.push(JSON.parse(d.toString())); } catch {} } });
  ws.on('close', (c) => { closeCode = c; });
  await waitFor(() => (ws.readyState === WebSocket.OPEN ? true : null), 2000);
  ws.send(JSON.stringify({ t: 'hello', v: 1, session: 'life' }));
  await waitFor(() => text.find((m) => m.t === 'hello-ok'), 2000);

  a.kill('SIGTERM');
  const bye = await waitFor(() => text.find((m) => m.t === 'bye'), 2000);
  ok('SIGTERM → bye{shutdown}', !!bye && bye.reason === 'shutdown', `reason=${bye?.reason}`);
  await waitFor(() => (aExited != null ? true : null), 3000);
  ok('SIGTERM → daemon exits', aExited != null, `exit=${aExited}`);
  ok('SIGTERM → registry removed', !fs.existsSync(regA));

  // ── Part B: delete registry → self-exit (~poll interval) ─────────────────────
  const regB = path.join(dir, '.chainglass/streamd-4501.json');
  const b = spawnDaemon(6097, regB);
  let bExited = null; b.on('exit', (code) => { bExited = code ?? 0; });
  await waitFor(() => (fs.existsSync(regB) ? true : null), 4000);
  fs.rmSync(regB);
  const gone = await waitFor(() => (bExited != null ? true : null), 4000);   // poll is 1s
  ok('vanished registry → self-exit', !!gone, `exit=${bExited}`);
  if (!gone) b.kill('SIGKILL');

  try { ws.close(); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error('lifecycle smoke crashed:', e); process.exit(2); });
