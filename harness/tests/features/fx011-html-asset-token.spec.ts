/**
 * FX011 verification — HtmlViewer renders an HTML file with relative `<img>`
 * references via the new asset-token flow. The sandboxed iframe must:
 *   (a) load the HTML body successfully,
 *   (b) carry the freshly-minted asset token on every sub-resource request,
 *   (c) get back 200 for image fetches (NOT 401 bootstrap-required).
 *
 * This is the load-bearing harness manual-verification step for FX011.
 *
 * Pre-reqs: `just harness dev` running; `just harness seed` registered the
 * `harness-test-workspace`; this test populates fx011/test.html + an image
 * via the host filesystem (mounted at /app in the container).
 *
 * Output: results/fx011-html-rendered.png (the visual eyeball check).
 */
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Request, Response } from '@playwright/test';
import { test, expect } from '../fixtures/base-test.js';

const RESULTS_DIR = join(import.meta.dirname, '../../results');
const BOOTSTRAP_CODE = '6A3J-DJ8A-YCK3'; // Harness's pinned code (same as host — .chainglass mounted)
const SLUG = 'harness-test-workspace';
const WORKTREE = '/app/scratch/harness-test-workspace'; // Container path — host mounts repo root at /app
const FILE = 'fx011/test.html';

test.describe('FX011 — HtmlViewer asset token end-to-end', () => {
  test('renders HTML file with relative <img> ref; iframe sub-resources 200 with _at token', async ({
    cdpPage,
    baseURL,
  }) => {
    mkdirSync(RESULTS_DIR, { recursive: true });

    // Collect network requests so we can verify the iframe's image fetch.
    const rawFileReqs: Array<{ url: string; status: number; hasToken: boolean }> = [];
    const mintReqs: Array<{ url: string; status: number }> = [];

    cdpPage.on('response', (response: Response) => {
      const url = response.url();
      if (url.includes('/api/workspaces/') && url.includes('/files/raw')) {
        rawFileReqs.push({
          url,
          status: response.status(),
          hasToken: url.includes('_at='),
        });
      }
      if (url.includes('/api/bootstrap/asset-token')) {
        mintReqs.push({ url, status: response.status() });
      }
    });

    const target = `${baseURL}/workspaces/${SLUG}/browser?worktree=${encodeURIComponent(WORKTREE)}&session=${SLUG}&dir=fx011&file=${encodeURIComponent(FILE)}`;
    await cdpPage.goto(target, { waitUntil: 'domcontentloaded' });

    // Bootstrap popup paints — unlock it.
    await cdpPage.waitForSelector('[data-testid="bootstrap-popup"]', { timeout: 10_000 });
    await cdpPage.fill('[data-testid="bootstrap-code-input"]', BOOTSTRAP_CODE.replace(/-/g, ''));
    await cdpPage.click('[data-testid="bootstrap-code-submit"]');
    await cdpPage.waitForSelector('[data-testid="bootstrap-popup"]', {
      state: 'detached',
      timeout: 15_000,
    });

    // Wait for HtmlViewer iframe to mount + render.
    const iframe = cdpPage.locator('iframe[title="HTML viewer"]');
    await iframe.waitFor({ state: 'visible', timeout: 15_000 });

    // Sandbox immutability — regression-lock for AC #9.
    const sandboxAttr = await iframe.getAttribute('sandbox');
    expect(sandboxAttr).toBe('allow-scripts');

    // Give the iframe time to fetch its sub-resource (the red.png).
    await cdpPage.waitForTimeout(3000);

    // Save the visual eyeball check.
    await cdpPage.screenshot({
      path: join(RESULTS_DIR, 'fx011-html-rendered.png'),
      fullPage: false,
    });

    // Network-level verification:
    //  (1) At least one mint request fired (parent React → /api/bootstrap/asset-token)
    expect(mintReqs.length).toBeGreaterThan(0);
    const okMints = mintReqs.filter((r) => r.status === 200);
    expect(okMints.length).toBeGreaterThan(0);

    //  (2) At least one raw-file request carried _at= (the image inside the iframe)
    const tokenedRequests = rawFileReqs.filter((r) => r.hasToken);
    expect(tokenedRequests.length).toBeGreaterThan(0);

    //  (3) Every tokened request succeeded (200) — NOT 401
    for (const req of tokenedRequests) {
      expect(req.status, `Token request must succeed: ${req.url}`).toBe(200);
    }

    //  (4) Specifically the image must be fetched (not just the HTML body)
    const imageReqs = tokenedRequests.filter((r) =>
      r.url.includes(encodeURIComponent('fx011/images/red.png'))
    );
    expect(imageReqs.length, 'red.png image must be fetched via token path').toBeGreaterThan(0);
    for (const req of imageReqs) {
      expect(req.status).toBe(200);
    }
  });
});
