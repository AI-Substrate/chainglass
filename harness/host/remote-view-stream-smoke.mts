/**
 * Plan 088 Phase 3 — T007 host streaming smoke ("does Mac streaming work?").
 *
 * Runs ON the Mac host (not the Docker container — Docker-on-Mac is painful and the
 * fake binds 127.0.0.1, which a host browser reaches directly). It proves the real
 * streaming pipeline end to end in a REAL browser:
 *
 *   fake-streamd (real `ws` server, real protocol + 16-byte binary codec, 254 real
 *   sck-capture H.264 frames)  →  WebSocket  →  System Google Chrome  →  WebCodecs
 *   VideoDecoder (avc1, avcC from video-config)  →  <canvas>.
 *
 * Uses `channel: 'chrome'` because Playwright's bundled Chromium ships without the
 * proprietary H.264 decoder; system Chrome (what users run) has it — the realistic
 * Mac target. The decode loop mirrors the production viewport (data-driven
 * video-config, keyframe resync, 16-byte header parse) so a green run means the
 * pipeline the viewport relies on actually decodes on a real Mac.
 *
 * Browser-side code is passed as STRINGS (not functions) so tsx/esbuild's keepNames
 * transform can't inject a `__name` helper that doesn't exist in the page.
 *
 * Run:  npx tsx harness/host/remote-view-stream-smoke.mts
 * Exit: 0 = PASS (≥ TARGET_FRAMES decoded), 1 = FAIL.
 */

import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { startFakeStreamd } from '../../apps/web/src/features/088-remote-view/testing/fake-streamd';

const TARGET_FRAMES = 30;
const STREAM_FRAMES = 80;

function harnessHtml(wsUrl: string): string {
  // Plain ES5-ish JS embedded in the page — mirrors the viewport decode pipeline.
  const js = `
window.__rvFrames = 0; window.__rvErr = null; window.__rvConfigured = false;
(function () {
  function b64(s){ var x=atob(s); var a=new Uint8Array(x.length); for(var i=0;i<x.length;i++) a[i]=x.charCodeAt(i); return a; }
  var ws = new WebSocket(${JSON.stringify(wsUrl)}); ws.binaryType='arraybuffer';
  var decoder=null, awaitingKey=true;
  ws.onopen = function(){ ws.send(JSON.stringify({ t:'hello', v:1, session:'ses_smoke' })); };
  ws.onclose = function(ev){ if(!window.__rvErr) window.__rvErr = 'ws-close:'+ev.code; };
  ws.onmessage = function(ev){
    if (typeof ev.data === 'string') {
      var m = JSON.parse(ev.data);
      if (m.t === 'video-config') {
        try {
          decoder = new VideoDecoder({
            output: function(f){ window.__rvFrames++; var c=document.getElementById('c'); c.width=f.displayWidth; c.height=f.displayHeight; c.getContext('2d').drawImage(f,0,0); f.close(); },
            error: function(e){ window.__rvErr='decoder:'+e; }
          });
          decoder.configure({ codec:m.codec, codedWidth:m.width, codedHeight:m.height, description:b64(m.description), optimizeForLatency:true });
          window.__rvConfigured = true;
        } catch (e) { window.__rvErr='configure:'+e; }
      }
      return;
    }
    var buf=new Uint8Array(ev.data); var dv=new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    var key=(dv.getUint8(1)&1)!==0; var ts=Number(dv.getBigUint64(8,false)); var payload=buf.subarray(16);
    if (!decoder || decoder.state!=='configured') return;
    if (awaitingKey){ if(!key) return; awaitingKey=false; }
    try { decoder.decode(new EncodedVideoChunk({ type:key?'key':'delta', timestamp:ts, data:payload })); }
    catch (e) { window.__rvErr='decode:'+e; }
  };
})();`;
  return `<!doctype html><html><body><canvas id="c"></canvas><script>${js}</script></body></html>`;
}

async function main(): Promise<void> {
  const fake = await startFakeStreamd();
  const wsUrl = `${fake.url}/stream?session=ses_smoke&token=test`;
  console.log(`[smoke] fake-streamd at ${fake.url}`);

  // WebCodecs (VideoDecoder) is only exposed in a secure context — serve the harness
  // over http://127.0.0.1 (localhost is treated as secure) rather than about:blank.
  const html = harnessHtml(wsUrl);
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const pagePort = typeof addr === 'object' && addr ? addr.port : 0;

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${pagePort}/`, { waitUntil: 'load' });

    await page.waitForTimeout(600);
    fake.pushFrames(STREAM_FRAMES);

    await page
      .waitForFunction(`window.__rvFrames >= ${TARGET_FRAMES}`, null, { timeout: 15_000 })
      .catch(() => {});

    const frames = (await page.evaluate('window.__rvFrames')) as number;
    const err = (await page.evaluate('window.__rvErr')) as string | null;
    const configured = (await page.evaluate('window.__rvConfigured')) as boolean;
    const hasWebCodecs = (await page.evaluate("'VideoDecoder' in window")) as boolean;
    console.log(
      `[smoke] webcodecs=${hasWebCodecs} configured=${configured} decoded=${frames} err=${err ?? 'none'}`
    );

    if (frames >= TARGET_FRAMES) {
      console.log(`[smoke] PASS — ${frames} H.264 frames decoded to canvas on real Chrome`);
    } else {
      console.log(`[smoke] FAIL — only ${frames}/${TARGET_FRAMES} frames decoded`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await fake.close();
    server.close();
  }
}

main().catch((e) => {
  console.error('[smoke] error', e);
  process.exit(1);
});
