// Read-only navigation probe. Usage: node nav-probe.mjs <baseUrl> <outJson>
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync } from 'node:fs';
const require = createRequire('/Users/jordanknight/substrate/chainglass/package.json');
const { chromium } = require('playwright');

const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3];
const WT = 'worktree=/Users/jordanknight/substrate/chainglass';
const pages = [
  ['home', '/'],
  ['workspace', '/workspaces/chainglass'],
  ['browser', `/workspaces/chainglass/browser?${WT}`],
  ['terminal', `/workspaces/chainglass/terminal?${WT}`],
  ['workflows', `/workspaces/chainglass/workflows?${WT}`],
  ['work-units', `/workspaces/chainglass/work-units?${WT}`],
  ['pij', `/workspaces/chainglass/pij?${WT}`],
];
const IDLE_MS = 30_000;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const results = [];
{
  const code = JSON.parse(readFileSync('/Users/jordanknight/substrate/chainglass/.chainglass/bootstrap-code.json', 'utf8')).code;
  const r = await ctx.request.post(base + '/api/bootstrap/verify', { data: { code } });
  console.log('bootstrap verify status', r.status());
}


for (const [name, path] of pages) {
  const page = await ctx.newPage();
  const reqs = [];
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('request', (r) => reqs.push({ t: Date.now(), url: r.url(), type: r.resourceType(), method: r.method() }));
  const sizes = new Map();
  page.on('response', async (r) => {
    const len = Number(r.headers()['content-length'] ?? 0);
    sizes.set(r.url(), { status: r.status(), len });
  });
  const t0 = Date.now();
  let err = null;
  try {
    await page.goto(base + path, { waitUntil: 'load', timeout: 120_000 });
  } catch (e) { err = String(e).slice(0, 200); }
  const tLoad = Date.now() - t0;
  // settle: wait until no new non-streaming request for 1.5s (cap 20s)
  let lastCount = -1; let quietSince = Date.now();
  const tSettleStart = Date.now();
  while (Date.now() - tSettleStart < 20_000) {
    await page.waitForTimeout(250);
    if (reqs.length !== lastCount) { lastCount = reqs.length; quietSince = Date.now(); }
    else if (Date.now() - quietSince > 1500) break;
  }
  const tSettled = quietSince - t0;
  const loadReqs = reqs.length;
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource');
    const js = res.filter((r) => r.initiatorType === 'script' || r.name.endsWith('.js'));
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
    return {
      ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd),
      fcp: fcp && Math.round(fcp),
      jsCount: js.length,
      jsBytes: js.reduce((a, r) => a + (r.decodedBodySize || 0), 0),
      jsTransfer: js.reduce((a, r) => a + (r.transferSize || 0), 0),
      totalRes: res.length,
      domNodes: document.querySelectorAll('*').length,
    };
  }).catch((e) => ({ error: String(e) }));
  // idle window
  const idleStart = Date.now();
  const before = reqs.length;
  await page.waitForTimeout(IDLE_MS);
  const idle = reqs.slice(before).filter((r) => r.t >= idleStart);
  const idleByPath = {};
  for (const r of idle) {
    const u = new URL(r.url);
    const k = `${r.method} ${u.pathname}`;
    idleByPath[k] = (idleByPath[k] ?? 0) + 1;
  }
  const loadByType = {};
  for (const r of reqs.slice(0, loadReqs)) loadByType[r.type] = (loadByType[r.type] ?? 0) + 1;
  const apiDuringLoad = {};
  for (const r of reqs.slice(0, loadReqs)) {
    const u = new URL(r.url);
    if (u.pathname.startsWith('/api') || r.type === 'fetch' || r.type === 'eventsource') {
      const k = `${r.method} ${u.pathname}`;
      apiDuringLoad[k] = (apiDuringLoad[k] ?? 0) + 1;
    }
  }
  results.push({ name, path, err, tLoad, tSettled, loadReqs, loadByType, apiDuringLoad, nav, idleCount: idle.length, idleByPath, consoleErrors: consoleErrors.slice(0, 8) });
  console.log(JSON.stringify(results.at(-1)));
  await page.close();
}
// --- soft (client-side) navigation: one tab, router.push between pages, two laps
{
  const page = await ctx.newPage();
  const reqs = [];
  page.on('request', (r) => reqs.push({ t: Date.now(), url: r.url(), type: r.resourceType(), method: r.method() }));
  await page.goto(base + pages[1][1], { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(4000);
  const soft = [];
  for (const lap of [1, 2]) {
    for (const [name, path] of pages.slice(1)) {
      const before = reqs.length;
      const t0 = Date.now();
      await page.evaluate((p) => window.next.router.push(p), path);
      const target = new URL(base + path).pathname;
      let tUrl = null;
      try { await page.waitForFunction((t) => location.pathname === t, target, { timeout: 60_000 }); tUrl = Date.now() - t0; } catch {}
      let lastCount = -1; let quietSince = Date.now(); const s0 = Date.now();
      while (Date.now() - s0 < 20_000) {
        await page.waitForTimeout(200);
        if (reqs.length !== lastCount) { lastCount = reqs.length; quietSince = Date.now(); }
        else if (Date.now() - quietSince > 1500) break;
      }
      const mine = reqs.slice(before);
      const byKey = {};
      for (const r of mine) { const u = new URL(r.url); const k = r.type === 'script' ? 'script' : `${r.method} ${u.pathname}`; byKey[k] = (byKey[k] ?? 0) + 1; }
      const row = { lap, name, tUrlChanged: tUrl, tSettled: quietSince - t0, reqs: mine.length, byKey };
      soft.push(row);
      console.log('SOFT ' + JSON.stringify(row));
    }
  }
  results.push({ soft });
  await page.close();
}
await browser.close();
if (out) writeFileSync(out, JSON.stringify(results, null, 2));
