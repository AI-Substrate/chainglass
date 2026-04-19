/**
 * Phase 1 + Phase 2 + Phase 3 — MarkdownWysiwygEditor + WysiwygToolbar
 * + LinkPopover harness smoke.
 *
 * Navigates the harness CDP browser to /dev/markdown-wysiwyg-smoke, waits
 * for the lazy Tiptap chunk to hydrate, and asserts:
 *
 *   Phase 1 (T006) — preserved verbatim:
 *     - `<h1>Hello</h1>` appears in the DOM (WYSIWYG rendering works)
 *     - `<img>` src starts with the raw-file API base (resolver runs)
 *     - Zero console messages matching /hydration|did not match|mismatch/i
 *
 *   Phase 2 (T008) — preserved verbatim:
 *     - `role="toolbar"` present with 16 buttons
 *     - Clicking `[data-testid="toolbar-bold"]` on a selection toggles `<strong>`
 *     - Clicking `[data-testid="toolbar-h2"]` toggles an `<h2>`
 *     - `Mod-Alt-C` keybinding toggles a code block
 *
 *   Phase 3 (T008) — NEW (every didyouknow-v2 insight is covered):
 *     (1) click [data-testid="toolbar-link"] → popover opens with role="dialog"
 *     (2) type URL + Enter → popover closes, anchor inserted
 *     (3) caret inside link + Mod-k → popover reopens in Edit mode, pre-fill
 *     (4) click Update → link retained
 *     (5) click Unlink → anchor removed, text preserved
 *     (6a) Esc after toolbar-click open → focus returns to Link button
 *     (6b) Esc after Mod-k open → focus returns to editor contenteditable
 *     (7) type javascript:alert(1) + Enter → error visible, no anchor
 *     (8a) open popover + press Mod-k → popover stays open, URL input focused
 *     (8b) parenthesized-URL round-trip → markdown output preserves href
 *
 * Screenshot persisted under harness/results/phase-3/.
 *
 * Requires: `just harness-dev` from the repo root; app reachable at baseURL.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '../fixtures/base-test.js';

const RESULTS_DIR_P2 = join(import.meta.dirname, '../../results/phase-2');
const RESULTS_DIR_P3 = join(import.meta.dirname, '../../results/phase-3');
const RESULTS_DIR_P4 = join(import.meta.dirname, '../../results/phase-4');
const SMOKE_PATH = '/dev/markdown-wysiwyg-smoke';
const HYDRATION_RX = /hydration|did not match|mismatch/i;
// Harness Chromium runs inside a Linux Docker container — `Mod-` maps to Control.
const MOD_KEY = 'Control';

test.describe('Phase 3 / T008: WYSIWYG smoke (editor + toolbar + link popover)', () => {
  test('editor, toolbar, and link popover compose end-to-end', async ({
    cdpPage,
    baseURL,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'mobile',
      'Mobile toolbar + link popover bottom-sheet verification is Phase 6.4 scope',
    );
    /*
    Test Doc:
    - Why: End-to-end verification that Phases 1–3 compose on Next 16 + React 19.
      Every didyouknow-v2 insight from the dossier has at least one assertion
      here (popover anchor, selection pre-fill, parenthesized URL round-trip,
      Mod-k swallow, focus-return path depending on opener).
    - Contract: full matrix from the file-level doc comment above.
    - Quality contribution: locks in AC-04 (toolbar click), AC-05 (Mod-k),
      AC-13 (link insertion + sanitation), AC-17 (a11y basics).
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
    const h1Text = await editorRoot.locator('h1').first().textContent();
    expect(h1Text).toContain('Hello');
    const imgSrc = await editorRoot.locator('img').first().getAttribute('src');
    expect(imgSrc).not.toBeNull();
    expect(imgSrc).toMatch(/\/api\/workspaces\/test\/files\/raw\?worktree=test&file=/);

    // ── Phase 2 assertions ──────────────────────────────────────────
    const toolbar = cdpPage.locator('[data-testid="wysiwyg-toolbar"]');
    await toolbar.waitFor({ timeout: 5_000 });
    await expect(toolbar).toHaveAttribute('role', 'toolbar');
    const buttons = toolbar.locator('[data-testid^="toolbar-"]');
    await expect(buttons).toHaveCount(16);

    // Bold click (select-all → Bold)
    await editorRoot.locator('h1').first().click();
    await cdpPage.keyboard.press(`${MOD_KEY}+a`);
    await cdpPage.locator('[data-testid="toolbar-bold"]').click();
    await expect(editorRoot.locator('strong').first()).toBeVisible({ timeout: 5_000 });

    // H2 click
    await editorRoot.locator('p', { hasText: 'Some text.' }).click();
    await cdpPage.locator('[data-testid="toolbar-h2"]').click();
    await expect(editorRoot.locator('h2').first()).toBeVisible({ timeout: 5_000 });

    // Mod-Alt-C code block
    await editorRoot.click();
    await cdpPage.keyboard.press(`${MOD_KEY}+End`);
    await cdpPage.keyboard.press(`${MOD_KEY}+Alt+c`);
    await expect(editorRoot.locator('pre code').first()).toBeVisible({ timeout: 5_000 });

    // Phase 2 screenshot — preserved.
    if (!existsSync(RESULTS_DIR_P2)) mkdirSync(RESULTS_DIR_P2, { recursive: true });
    await cdpPage.screenshot({
      path: join(RESULTS_DIR_P2, `toolbar-${testInfo.project.name}.png`),
      fullPage: false,
    });

    // ── Phase 3 assertions ──────────────────────────────────────────
    // Reload page for a clean editor state — Phase 2 heavily mutates the
    // doc, and Phase 3 wants to start fresh so the link-insertion paths
    // are predictable.
    await cdpPage.goto(`${baseURL}${SMOKE_PATH}`, { waitUntil: 'domcontentloaded' });
    await cdpPage.waitForSelector('[data-testid="md-wysiwyg-root"]', { timeout: 15_000 });
    await cdpPage.waitForSelector('[data-testid="wysiwyg-toolbar"]', { timeout: 5_000 });
    const linkButton = cdpPage.locator('[data-testid="toolbar-link"]');
    const linkPopover = cdpPage.locator('[data-testid="link-popover"]');
    const urlInput = cdpPage.locator('[data-testid="link-popover-url-input"]');
    const textInput = cdpPage.locator('[data-testid="link-popover-text-input"]');
    const submitBtn = cdpPage.locator('[data-testid="link-popover-submit"]');
    const unlinkBtn = cdpPage.locator('[data-testid="link-popover-unlink"]');
    const errorEl = cdpPage.locator('[data-testid="link-popover-error"]');

    // Start from a clean paragraph. Place caret at end and type a fresh line.
    await editorRoot.click();
    await cdpPage.keyboard.press(`${MOD_KEY}+End`);
    await cdpPage.keyboard.press('Enter');
    await cdpPage.keyboard.type('target');
    await cdpPage.keyboard.press(`${MOD_KEY}+a`);
    // (Select-all so the link wraps the full doc; harmless for our assertion
    // that at least one <a> appears.)

    // (1) click toolbar Link → popover opens
    await linkButton.click();
    await expect(linkPopover).toBeVisible({ timeout: 5_000 });
    await expect(linkPopover).toHaveAttribute('role', 'dialog');

    // (2) type URL + Enter → popover closes, anchor inserted
    await urlInput.fill('https://example.com');
    await urlInput.press('Enter');
    await expect(linkPopover).not.toBeVisible({ timeout: 5_000 });
    await expect(editorRoot.locator('a[href="https://example.com"]').first()).toBeVisible({
      timeout: 5_000,
    });

    // (3) Caret inside the link + Mod-k → popover reopens in Edit mode, pre-fill
    await editorRoot.locator('a[href="https://example.com"]').first().click();
    await cdpPage.keyboard.press(`${MOD_KEY}+k`);
    await expect(linkPopover).toBeVisible({ timeout: 5_000 });
    await expect(cdpPage.locator('#link-popover-title')).toContainText('Edit link');
    await expect(urlInput).toHaveValue('https://example.com');
    const prefilledText = await textInput.inputValue();
    expect(prefilledText.length).toBeGreaterThan(0);

    // (4) Click Update (unchanged URL) → link retained, popover closes
    await submitBtn.click();
    await expect(linkPopover).not.toBeVisible({ timeout: 5_000 });
    await expect(editorRoot.locator('a[href="https://example.com"]').first()).toBeVisible();

    // (5) Caret inside link + Mod-k → click Unlink → anchor removed
    await editorRoot.locator('a[href="https://example.com"]').first().click();
    await cdpPage.keyboard.press(`${MOD_KEY}+k`);
    await expect(linkPopover).toBeVisible({ timeout: 5_000 });
    await expect(unlinkBtn).toBeVisible();
    await unlinkBtn.click();
    await expect(linkPopover).not.toBeVisible({ timeout: 5_000 });
    await expect(editorRoot.locator('a[href="https://example.com"]')).toHaveCount(0);

    // (6a) Focus-return after toolbar-click open → Link button regains focus on Esc
    await editorRoot.click();
    await linkButton.click();
    await expect(linkPopover).toBeVisible({ timeout: 5_000 });
    await cdpPage.keyboard.press('Escape');
    await expect(linkPopover).not.toBeVisible({ timeout: 5_000 });
    const focusedAfterToolbarEsc = await cdpPage.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? '',
    );
    expect(focusedAfterToolbarEsc).toBe('toolbar-link');

    // (6b) Focus-return after Mod-k open → editor contenteditable regains focus
    await editorRoot.click();
    await cdpPage.keyboard.press(`${MOD_KEY}+k`);
    await expect(linkPopover).toBeVisible({ timeout: 5_000 });
    await cdpPage.keyboard.press('Escape');
    await expect(linkPopover).not.toBeVisible({ timeout: 5_000 });
    const focusedAfterModKEsc = await cdpPage.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute('contenteditable') ?? '';
    });
    expect(focusedAfterModKEsc).toBe('true');

    // (7) javascript: URL → rejected, error visible, no new anchor
    await linkButton.click();
    await expect(linkPopover).toBeVisible({ timeout: 5_000 });
    await urlInput.fill('javascript:alert(1)');
    await urlInput.press('Enter');
    await expect(errorEl).toBeVisible({ timeout: 5_000 });
    // Popover stays open
    await expect(linkPopover).toBeVisible();
    await expect(editorRoot.locator('a[href^="javascript:"]')).toHaveCount(0);
    await cdpPage.keyboard.press('Escape');
    await expect(linkPopover).not.toBeVisible({ timeout: 5_000 });

    // (8a) Mod-k swallow while popover open → popover stays open, URL focused
    await linkButton.click();
    await expect(linkPopover).toBeVisible({ timeout: 5_000 });
    await urlInput.fill('partial-text');
    await cdpPage.keyboard.press(`${MOD_KEY}+k`);
    await expect(linkPopover).toBeVisible();
    await expect(urlInput).toBeFocused();
    await expect(urlInput).toHaveValue('partial-text');
    await cdpPage.keyboard.press('Escape');

    // (8b) Parenthesized URL round-trip
    await editorRoot.click();
    await cdpPage.keyboard.press(`${MOD_KEY}+End`);
    await cdpPage.keyboard.press('Enter');
    await cdpPage.keyboard.type('paren-link-text');
    await cdpPage.keyboard.press(`${MOD_KEY}+a`);
    await linkButton.click();
    await expect(linkPopover).toBeVisible({ timeout: 5_000 });
    const parenHref = 'https://en.wikipedia.org/wiki/Foo_(bar)';
    await urlInput.fill(parenHref);
    await urlInput.press('Enter');
    await expect(linkPopover).not.toBeVisible({ timeout: 5_000 });
    await expect(editorRoot.locator(`a[href="${parenHref}"]`).first()).toBeVisible({
      timeout: 5_000,
    });
    // Read the dev route's window.__smokeGetMarkdown() hook → check href
    // is byte-preserved in the serialized markdown. tiptap-markdown
    // backslash-escapes balanced parens inside URLs (`\(` / `\)`) so a
    // downstream parser re-reads the href correctly. Normalize the escape
    // before comparison — that's the guarantee AC-09 actually protects
    // (semantic byte preservation on round-trip, not a specific escape
    // style).
    const emittedMarkdown = await cdpPage.evaluate(() => {
      const w = window as Window & { __smokeGetMarkdown?: () => string };
      return w.__smokeGetMarkdown?.() ?? '';
    });
    const unescapedMarkdown = emittedMarkdown.replace(/\\([()])/g, '$1');
    expect(unescapedMarkdown, emittedMarkdown).toContain(parenHref);

    // Settle any residual hydration work before asserting the console log.
    await cdpPage.waitForLoadState('networkidle');

    // Phase 3 screenshot.
    if (!existsSync(RESULTS_DIR_P3)) mkdirSync(RESULTS_DIR_P3, { recursive: true });
    const screenshot = join(RESULTS_DIR_P3, `link-popover-${testInfo.project.name}.png`);
    await cdpPage.screenshot({ path: screenshot, fullPage: false });
    expect(existsSync(screenshot)).toBe(true);

    // ── Phase 4 assertions — front-matter round-trip ────────────────
    // Reload for a clean doc. Phase 3 mutations leave the editor in an
    // unpredictable state; Phase 4's assertion is about byte-identity of
    // the fm prefix and needs a deterministic starting point.
    await cdpPage.goto(`${baseURL}${SMOKE_PATH}`, { waitUntil: 'domcontentloaded' });
    await cdpPage.waitForSelector('[data-testid="md-wysiwyg-root"]', { timeout: 15_000 });

    // Click the fm-fixture toggle → editor's value prop swaps to an
    // fm-bearing markdown string ('---\ntitle: Test Doc\n…\n---\n\n# Body\n…').
    const fmToggle = cdpPage.locator('[data-testid="fixture-toggle-frontmatter"]');
    await fmToggle.click();

    // (P4-1) Body renders: <h1>Body</h1> replaces <h1>Hello</h1>.
    await expect(editorRoot.locator('h1', { hasText: 'Body' }).first()).toBeVisible({
      timeout: 5_000,
    });

    // (P4-2) Front-matter markers are STRIPPED from the rendered DOM — the
    // `---` fences and the YAML keys must not appear as visible text in
    // the editor (they live only in frontMatterRef, invisible to the user).
    const renderedText = (await editorRoot.textContent()) ?? '';
    expect(renderedText).not.toContain('---');
    expect(renderedText).not.toContain('title: Test Doc');
    expect(renderedText).toContain('Body');
    expect(renderedText).toContain('paragraph.');

    // (P4-3) Trigger a real edit so onChange fires and captures the
    // assembled (fm + body) markdown into the dev route's ref.
    await editorRoot.click();
    await cdpPage.keyboard.press(`${MOD_KEY}+End`);
    await cdpPage.keyboard.type(' edited');

    // (P4-4) Read the captured onChange argument — this is the authoritative
    // end-to-end assertion. It proves the full pipeline works in a real
    // browser: split() parsed the fm prefix into frontMatterRef on mount,
    // the user edit fired onUpdate with docChanged=true, the editor called
    // join(frontMatterRef, bodyMd), and the emitted string retained the
    // fm prefix byte-for-byte. This is the browser-level mirror of the
    // unit test `markdown-wysiwyg-editor.test.tsx › preserves front-matter
    // on a real edit`.
    const emittedMarkdownP4 = await cdpPage.evaluate(() => {
      const w = window as Window & { __smokeGetLastEmittedMarkdown?: () => string };
      return w.__smokeGetLastEmittedMarkdown?.() ?? '';
    });
    expect(emittedMarkdownP4.length, 'onChange should have fired at least once').toBeGreaterThan(0);
    expect(
      emittedMarkdownP4.startsWith('---\ntitle: Test Doc\n'),
      `expected emitted markdown to start with the fm prefix; got: ${JSON.stringify(
        emittedMarkdownP4.slice(0, 60),
      )}`,
    ).toBe(true);
    // And the body's edit marker is preserved too — proves we're not just
    // echoing the original value.
    expect(emittedMarkdownP4).toContain('edited');

    // Phase 4 screenshot.
    if (!existsSync(RESULTS_DIR_P4)) mkdirSync(RESULTS_DIR_P4, { recursive: true });
    const screenshotP4 = join(RESULTS_DIR_P4, `frontmatter-roundtrip-${testInfo.project.name}.png`);
    await cdpPage.screenshot({ path: screenshotP4, fullPage: false });
    expect(existsSync(screenshotP4)).toBe(true);

    expect(hydrationWarnings, hydrationWarnings.join('\n')).toEqual([]);
  });
});
