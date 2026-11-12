import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire('/Users/jordanknight/substrate/chainglass/package.json');
const { chromium } = require('playwright');
const base = 'http://localhost:3000';
const WT = 'worktree=/Users/jordanknight/substrate/chainglass';
const manifest = JSON.parse(readFileSync('/Users/jordanknight/substrate/chainglass/apps/web/.next/server/server-reference-manifest.json', 'utf8'));
const names = {};
for (const [id, v] of Object.entries(manifest.node ?? {})) names[id] = v.exportedName ?? v.filename ?? JSON.stringify(v).slice(0, 120);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const code = JSON.parse(readFileSync('/Users/jordanknight/substrate/chainglass/.chainglass/bootstrap-code.json', 'utf8')).code;
await ctx.request.post(base + '/api/bootstrap/verify', { data: { code } });
for (const path of [`/workspaces/chainglass/browser?${WT}`, '/workspaces/chainglass']) {
  const page = await ctx.newPage();
  const t0 = Date.now(); const info = new Map();
  const skip = new Set(['script', 'image', 'stylesheet', 'font']);
  page.on('request', (r) => { if (skip.has(r.resourceType())) return; const u = new URL(r.url()); const id = r.headers()['next-action']; info.set(r, { at: Date.now() - t0, k: `${r.method()} ${u.pathname}`, name: id ? (names[id] ?? id) : (r.headers()['next-router-prefetch'] ? 'prefetch' : ''), resp: null, done: null, status: null }); });
  page.on('response', (r) => { const i = info.get(r.request()); if (i) { i.resp = Date.now() - t0; i.status = r.status(); } });
  page.on('requestfinished', (r) => { const i = info.get(r); if (i) i.done = Date.now() - t0; });
  page.on('requestfailed', (r) => { const i = info.get(r); if (i) i.done = 'FAILED ' + (r.failure()?.errorText ?? ''); });
  let err = null;
  try { await page.goto(base + path, { waitUntil: 'load', timeout: 180_000 }); } catch (e) { err = String(e).slice(0, 100); }
  const tLoad = Date.now() - t0;
  await page.waitForTimeout(15_000);
  console.log('\n' + path, 'load', tLoad, err ?? '');
  for (const i of info.values()) console.log(String(i.at).padStart(6), 'resp@' + String(i.resp).padStart(6), 'done@' + String(i.done).padStart(6), i.status, i.k, i.name);
  await page.close();
}
await browser.close();
