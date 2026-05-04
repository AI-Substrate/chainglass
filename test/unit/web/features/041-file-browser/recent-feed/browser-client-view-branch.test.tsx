/**
 * Plan recent-changes-feed T004 — Lightweight test that opening + closing the
 * feed view preserves the user's prior selectedFile/currentDir state.
 *
 * Rationale: BrowserClient composes ~25 hooks and contexts. Mocking those would
 * either (a) violate Constitution P4 (no vi.mock of own-domain internals) or
 * (b) drown the test in 150 lines of mock plumbing. Per the plan's lightweight
 * testing approach, this test instead verifies the two specific properties
 * Finding 07 binds:
 *   1. RecentFeedView stub renders with the canonical props it will be called
 *      with from browser-client.tsx.
 *   2. The `view === 'recent-feed'` branch in browser-client.tsx precedes the
 *      `selectedFile`/`currentDir` cascade in BOTH render locations (mobile
 *      contentView + desktop main slot). This is the binding ordering that
 *      keeps the user's prior file/dir state intact while the feed is open.
 *
 * Together these two assertions cover AC A1 ("?view=recent-feed swaps the
 * main panel; tree stays intact") for the routing layer. The seeded view
 * orchestrator's behavior is covered separately by T012/T013 (real git seed
 * integration test).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BROWSER_CLIENT_PATH = resolve(
  __dirname,
  '../../../../../../apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx'
);

// Note: T003's "RecentFeedView stub" rendering tests were removed at T012
// when the stub became the real orchestrator (now requires
// FileChangeProvider context to render). Routing-invariant tests below
// still lock the Finding 07 contract via static source analysis — that's
// the part this file uniquely covers. Live render verification lives in
// integration tests + the harness exercise.

describe('browser-client.tsx routing — Finding 07 ordering invariant', () => {
  const source = readFileSync(BROWSER_CLIENT_PATH, 'utf8');

  it('imports RecentFeedView via next/dynamic with ssr:false', () => {
    expect(source).toMatch(/dynamic\s*\(\s*\(\)\s*=>\s*import\(/);
    expect(source).toContain("'@/features/041-file-browser/components/recent-feed/recent-feed-view'");
    expect(source).toMatch(/ssr:\s*false/);
  });

  it('reads `view` from the params destructuring', () => {
    expect(source).toMatch(/const\s+view\s*=\s*params\.view/);
  });

  it('defines handleCloseRecentFeed that sets view to null without touching other params', () => {
    expect(source).toMatch(/handleCloseRecentFeed\s*=\s*useCallback\(/);
    expect(source).toMatch(/setParams\(\s*\{\s*view:\s*null\s*\}/);
  });

  it('places `view === \'recent-feed\'` branch BEFORE BOTH `selectedFile ?` AND `currentDir ?` in the mobile contentView render point', () => {
    // The mobile contentView declaration block; we slice from its start to
    // the closing `</MainPanel>` of that block to isolate that render point
    // from the desktop one.
    const mobileBlockStart = source.indexOf('const contentView = (');
    expect(mobileBlockStart).toBeGreaterThan(0);
    // Find the next `</MainPanel>)` after that — the closing of contentView's
    // MainPanel. The desktop block uses `<MainPanel>` inside `main={`, so a
    // single forward search from the mobile start ends at contentView's close.
    const mobileBlockEnd = source.indexOf('</MainPanel>', mobileBlockStart);
    expect(mobileBlockEnd).toBeGreaterThan(mobileBlockStart);
    const mobileBlock = source.slice(mobileBlockStart, mobileBlockEnd);

    const viewIdx = mobileBlock.indexOf("view === 'recent-feed'");
    const fileIdx = mobileBlock.indexOf('selectedFile ? (');
    const dirIdx = mobileBlock.indexOf('currentDir ? (');
    expect(viewIdx).toBeGreaterThan(0);
    // F001 fix: also assert `currentDir ?` comes after the view branch — a
    // refactor could otherwise put folder-preview ahead of the feed and these
    // tests would still pass even though `?view=recent-feed&dir=…` would now
    // render the folder preview, breaking AC A1's preservation contract.
    expect(fileIdx).toBeGreaterThan(viewIdx);
    expect(dirIdx).toBeGreaterThan(viewIdx);
  });

  it('places `view === \'recent-feed\'` branch BEFORE BOTH `selectedFile ?` AND `currentDir ?` in the desktop main slot render point', () => {
    // The desktop block sits inside `main={` ... `}`. We search from the
    // first `main={` and assert ordering inside.
    const desktopBlockStart = source.indexOf('main={');
    expect(desktopBlockStart).toBeGreaterThan(0);
    const desktopBlockEnd = source.indexOf('</MainPanel>', desktopBlockStart);
    expect(desktopBlockEnd).toBeGreaterThan(desktopBlockStart);
    const desktopBlock = source.slice(desktopBlockStart, desktopBlockEnd);

    const viewIdx = desktopBlock.indexOf("view === 'recent-feed'");
    const fileIdx = desktopBlock.indexOf('selectedFile ? (');
    const dirIdx = desktopBlock.indexOf('currentDir ? (');
    expect(viewIdx).toBeGreaterThan(0);
    expect(fileIdx).toBeGreaterThan(viewIdx);
    expect(dirIdx).toBeGreaterThan(viewIdx);
  });
});
