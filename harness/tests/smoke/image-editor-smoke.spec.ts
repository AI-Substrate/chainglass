/**
 * Plan 086 T016 — Image editor browser smoke (Playwright + CDP).
 *
 * Drives the real file-browser surface: open a raster image, enter Edit mode,
 * draw with the pen, Save as new, and assert the editor exported a Blob with
 * NO SecurityError (the canvas is same-origin → untainted, AC-17) and the
 * `<name>-edited.png` sibling appears on disk. Also exercises Cancel (AC-11).
 *
 * This is the runtime sensor for: AC-1/16 (render), AC-11/12 (save/cancel UX),
 * AC-17 (export/CORS), and the Next-16 ssr:false lazy import (finding 03).
 * It deliberately does NOT prove AC-2 pen feel/pressure — that stays manual.
 *
 * Fixture: a real (zlib-IDAT) PNG written to the seeded harness test workspace.
 * Requires: `just harness dev` (container) running.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { expect, test } from '../fixtures/base-test.js';

const WORKSPACE_SLUG = 'harness-test-workspace';
const WORKTREE_PATH = '/app/scratch/harness-test-workspace';
const HOST_WORKSPACE = join(import.meta.dirname, '../../../scratch/harness-test-workspace');
const FIXTURE_FILE = 'sample-image.png';
const EDITED_FILE = 'sample-image-edited.png';

const SMOKE_PATH =
  `/workspaces/${WORKSPACE_SLUG}/browser?worktree=${encodeURIComponent(WORKTREE_PATH)}` +
  `&file=${encodeURIComponent(FIXTURE_FILE)}`;

// Harness workspaces are gated behind a bootstrap code (see single-xterm smoke).
const BOOTSTRAP_CODE = '6A3J-DJ8A-YCK3';

const RESULTS_DIR = join(import.meta.dirname, '../../results/plan-086');

// --- real, decodable PNG (signature + IHDR + zlib IDAT + IEND) ---------------

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function makeRealPng(width: number, height: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const row = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x++) {
    const o = 1 + x * 4;
    row[o] = 200;
    row[o + 1] = 220;
    row[o + 2] = 255;
    row[o + 3] = 255;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => Buffer.from(row)));
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test.beforeAll(() => {
  mkdirSync(HOST_WORKSPACE, { recursive: true });
  writeFileSync(join(HOST_WORKSPACE, FIXTURE_FILE), makeRealPng(160, 120));
  // Start clean so "the -edited file appears" is a meaningful assertion.
  rmSync(join(HOST_WORKSPACE, EDITED_FILE), { force: true });
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
});

test.describe('Plan 086: image editor smoke', () => {
  test('open → edit → draw → save-as-new produces an -edited file with no SecurityError', async ({
    cdpPage,
    baseURL,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile',
      'Mobile image-edit layout is out of scope for this smoke',
    );

    const securityErrors: string[] = [];
    cdpPage.on('console', (msg) => {
      if (msg.type() === 'error' && /security/i.test(msg.text())) securityErrors.push(msg.text());
    });
    cdpPage.on('pageerror', (err) => {
      if (/security/i.test(String(err))) securityErrors.push(String(err));
    });

    const response = await cdpPage.goto(`${baseURL}${SMOKE_PATH}`, {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);

    // Dismiss the bootstrap unlock popup if it appears.
    const popup = cdpPage.locator('[data-testid="bootstrap-popup"]');
    try {
      await popup.waitFor({ state: 'visible', timeout: 3_000 });
      await cdpPage.fill('[data-testid="bootstrap-code-input"]', BOOTSTRAP_CODE.replace(/-/g, ''));
      await cdpPage.click('[data-testid="bootstrap-code-submit"]');
      await popup.waitFor({ state: 'detached', timeout: 15_000 });
    } catch {
      /* already bootstrapped */
    }

    // AC-1/16: a raster image shows an Edit affordance.
    const editButton = cdpPage.locator('[data-testid="image-edit-button"]');
    await expect(editButton).toBeVisible({ timeout: 15_000 });

    // Enter edit mode — the canvas editor must mount (no ssr:false runtime break).
    await editButton.click();
    const canvas = cdpPage.locator('[data-testid="image-editor-canvas"]');
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // AC-2 (smoke only): draw a stroke via pointer events.
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      await cdpPage.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.35);
      await cdpPage.mouse.down();
      await cdpPage.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.65, { steps: 10 });
      await cdpPage.mouse.up();
    }

    await cdpPage.screenshot({
      path: join(RESULTS_DIR, `editor-${testInfo.project.name}.png`),
      fullPage: false,
    });

    // AC-12/17: Save as new → exports a Blob (no SecurityError) and writes the file.
    await cdpPage.locator('[data-testid="image-editor-save-as-new"]').click();

    await expect
      .poll(() => existsSync(join(HOST_WORKSPACE, EDITED_FILE)), { timeout: 15_000 })
      .toBe(true);

    // On success the editor exits back to the preview (Edit button returns).
    await expect(editButton).toBeVisible({ timeout: 10_000 });
    expect(securityErrors, securityErrors.join('\n')).toEqual([]);

    // AC-11: Cancel from a fresh edit returns to the plain image view.
    await editButton.click();
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    await cdpPage.locator('[data-testid="image-editor-cancel"]').click();
    await expect(editButton).toBeVisible({ timeout: 10_000 });
  });
});
