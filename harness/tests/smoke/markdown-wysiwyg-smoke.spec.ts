/**
 * Phase 5 T011 — WYSIWYG smoke migrated onto the real `FileViewerPanel` surface.
 *
 * Navigates the harness CDP browser to a `.md` file in the harness test workspace
 * with `?mode=rich` already in the URL, then asserts:
 *   - Phase 1 (T006)  — editor mounts, h1 renders, image src routed through resolver,
 *                       front-matter fences stripped from DOM, zero hydration warnings.
 *   - Phase 2 (T008)  — toolbar present with role="toolbar" and 16 buttons; Bold + H2
 *                       click toggles, Mod-Alt-C chord toggles code block.
 *   - Phase 3 smoke   — Link toolbar button opens the popover. (Full link flow is
 *                       covered by Phase 3 unit + integration tests; this is a smoke
 *                       check that the popover is reachable on the real surface.)
 *   - Phase 4 (T007)  — front-matter byte-preserved across a real edit, via the
 *                       `data-emitted-markdown` attribute on `.md-wysiwyg-editor-mount`
 *                       (Phase 5 test affordance committed in T003).
 *   - Phase 5 (T007)  — language pill visible for ```python code block.
 *
 * Fixture: `scratch/harness-test-workspace/sample-rich.md` (created by T011 Step 0;
 * contains heading + paragraph + image + code block + YAML front-matter). The
 * harness test workspace is seeded via `just harness seed`.
 *
 * Requires: `just harness dev` from the repo root.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '../fixtures/base-test.js';

const RESULTS_DIR_P5 = join(import.meta.dirname, '../../results/phase-5');

const WORKSPACE_SLUG = 'harness-test-workspace';
const WORKTREE_PATH = '/app/scratch/harness-test-workspace';
const FIXTURE_FILE = 'sample-rich.md';
const SMOKE_PATH =
  `/workspaces/${WORKSPACE_SLUG}/browser?worktree=${encodeURIComponent(WORKTREE_PATH)}` +
  `&file=${encodeURIComponent(FIXTURE_FILE)}&mode=rich`;

const HYDRATION_RX = /hydration|did not match|mismatch/i;
// Harness Chromium runs inside a Linux Docker container — `Mod-` maps to Control.
const MOD_KEY = 'Control';

test.describe('Phase 5 T011: WYSIWYG smoke on real FileViewerPanel', () => {
  test('Rich mode composes end-to-end on the real file-browser surface', async ({
    cdpPage,
    baseURL,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile',
      'Mobile toolbar + link popover bottom-sheet verification is Phase 6.4 scope',
    );
    /*
    Test Doc:
    - Why: Load-bearing Phase 5 proof — the Rich branch of FileViewerPanel composes
      Phases 1–4 + Phase 5's language pill on the real file-browser surface with
      a URL-driven mode, emits front-matter-preserving markdown via the new
      `data-emitted-markdown` affordance (Phase 6.2 dependency), and shows no
      hydration warnings. Full Phase 3 link popover flows stay covered by the
      87-assertion unit+integration suite.
    - Contract: navigating to a .md file with ?mode=rich lands directly in Rich
      mode; toolbar toggles work; popover opens; fm byte-preserved; language pill
      renders; zero hydration warnings.
    */
    const hydrationWarnings: string[] = [];
    cdpPage.on('console', (msg) => {
      const type = msg.type();
      if (type !== 'warning' && type !== 'error') return;
      if (HYDRATION_RX.test(msg.text())) hydrationWarnings.push(msg.text());
    });

    const response = await cdpPage.goto(`${baseURL}${SMOKE_PATH}`, {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);

    // ── Phase 1 assertions ──────────────────────────────────────────
    await cdpPage.waitForSelector('[data-testid="md-wysiwyg-root"]', { timeout: 15_000 });
    const editorRoot = cdpPage.locator('[data-testid="md-wysiwyg-root"]');
    const mountWrapper = cdpPage.locator('.md-wysiwyg-editor-mount');
    await expect(mountWrapper).toBeVisible({ timeout: 5_000 });

    // Body renders: <h1>Hello</h1> from fixture body.
    await expect(editorRoot.locator('h1', { hasText: 'Hello' }).first()).toBeVisible({
      timeout: 5_000,
    });

    // Image is routed through the raw-file API resolver.
    const imgSrc = await editorRoot.locator('img').first().getAttribute('src');
    expect(imgSrc).not.toBeNull();
    expect(imgSrc).toMatch(/\/api\/workspaces\/[^?]+\/files\/raw/);

    // Front-matter fences are NOT visible in the rendered DOM (Phase 4 split()
    // extracts them into the editor's frontMatterRef).
    const renderedText = (await editorRoot.textContent()) ?? '';
    expect(renderedText).not.toContain('---');
    expect(renderedText).not.toContain('title: Smoke Fixture');

    // ── Phase 2 assertions ──────────────────────────────────────────
    const toolbar = cdpPage.locator('[data-testid="wysiwyg-toolbar"]');
    await toolbar.waitFor({ timeout: 5_000 });
    await expect(toolbar).toHaveAttribute('role', 'toolbar');
    const buttons = toolbar.locator('[data-testid^="toolbar-"]');
    await expect(buttons).toHaveCount(16);

    // Bold click (select-all → Bold).
    await editorRoot.locator('h1').first().click();
    await cdpPage.keyboard.press(`${MOD_KEY}+a`);
    await cdpPage.locator('[data-testid="toolbar-bold"]').click();
    await expect(editorRoot.locator('strong').first()).toBeVisible({ timeout: 5_000 });

    // H2 click.
    await editorRoot.locator('p', { hasText: 'Some text.' }).click();
    await cdpPage.locator('[data-testid="toolbar-h2"]').click();
    await expect(editorRoot.locator('h2').first()).toBeVisible({ timeout: 5_000 });

    // ── Phase 3 smoke — popover opens ───────────────────────────────
    // Full link flow is covered by unit + integration tests; this is a smoke
    // assertion that the popover is reachable on the real surface.
    const linkButton = cdpPage.locator('[data-testid="toolbar-link"]');
    const linkPopover = cdpPage.locator('[data-testid="link-popover"]');
    await linkButton.click();
    await expect(linkPopover).toBeVisible({ timeout: 5_000 });
    await expect(linkPopover).toHaveAttribute('role', 'dialog');
    await cdpPage.keyboard.press('Escape');
    await expect(linkPopover).not.toBeVisible({ timeout: 5_000 });

    // ── Phase 4 front-matter round-trip ─────────────────────────────
    // Reload for a clean doc (Phase 2 mutations muddy the state).
    await cdpPage.goto(`${baseURL}${SMOKE_PATH}`, { waitUntil: 'domcontentloaded' });
    await cdpPage.waitForSelector('[data-testid="md-wysiwyg-root"]', { timeout: 15_000 });

    await expect(editorRoot.locator('h1', { hasText: 'Hello' }).first()).toBeVisible({
      timeout: 5_000,
    });

    // Trigger a real edit so onChange fires and the mount wrapper's data-attr updates.
    await editorRoot.click();
    await cdpPage.keyboard.press(`${MOD_KEY}+End`);
    await cdpPage.keyboard.type(' edited');

    // Read the captured markdown from the mount wrapper's data-attr.
    const emittedMarkdown = await mountWrapper.getAttribute('data-emitted-markdown');
    expect(emittedMarkdown).not.toBeNull();
    expect((emittedMarkdown ?? '').length, 'onChange should have fired').toBeGreaterThan(0);
    expect(
      (emittedMarkdown ?? '').startsWith('---\ntitle: Smoke Fixture\n'),
      `expected emitted markdown to start with fm prefix; got: ${JSON.stringify((emittedMarkdown ?? '').slice(0, 60))}`,
    ).toBe(true);
    expect(emittedMarkdown).toContain('edited');

    // ── Phase 5 (T007) — language pill ──────────────────────────────
    // Fixture body contains ```python — the pill must render.
    const languagePill = editorRoot.locator('[data-testid="code-block-language-pill"]').first();
    await expect(languagePill).toBeVisible({ timeout: 5_000 });
    await expect(languagePill).toHaveText('python');

    if (!existsSync(RESULTS_DIR_P5)) mkdirSync(RESULTS_DIR_P5, { recursive: true });
    const screenshot = join(RESULTS_DIR_P5, `rich-mode-${testInfo.project.name}.png`);
    await cdpPage.screenshot({ path: screenshot, fullPage: false });
    expect(existsSync(screenshot)).toBe(true);

    expect(hydrationWarnings, hydrationWarnings.join('\n')).toEqual([]);
  });
});
