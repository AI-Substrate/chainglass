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

import { RecentFeedView } from '@/features/041-file-browser/components/recent-feed/recent-feed-view';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const BROWSER_CLIENT_PATH = resolve(
  __dirname,
  '../../../../../../apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx'
);

describe('RecentFeedView stub', () => {
  it('renders the placeholder loading message', () => {
    const onClose = vi.fn();
    render(
      <RecentFeedView
        slug="test-slug"
        worktreePath="/tmp/wt"
        isGit={true}
        onClose={onClose}
      />
    );
    // The stub copy is part of the public T003→T012 handoff; T012 replaces
    // the body but keeps the props.
    expect(screen.getByText(/recent changes feed/i)).toBeDefined();
  });

  it('does not invoke onClose during render', () => {
    const onClose = vi.fn();
    render(
      <RecentFeedView
        slug="test-slug"
        worktreePath="/tmp/wt"
        isGit={false}
        onClose={onClose}
      />
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

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

  it('places `view === \'recent-feed\'` branch BEFORE `selectedFile ?` in the mobile contentView render point', () => {
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
    expect(viewIdx).toBeGreaterThan(0);
    expect(fileIdx).toBeGreaterThan(viewIdx);
  });

  it('places `view === \'recent-feed\'` branch BEFORE `selectedFile ?` in the desktop main slot render point', () => {
    // The desktop block sits inside `main={` ... `}`. We search from the
    // first `main={` and assert ordering inside.
    const desktopBlockStart = source.indexOf('main={');
    expect(desktopBlockStart).toBeGreaterThan(0);
    const desktopBlockEnd = source.indexOf('</MainPanel>', desktopBlockStart);
    expect(desktopBlockEnd).toBeGreaterThan(desktopBlockStart);
    const desktopBlock = source.slice(desktopBlockStart, desktopBlockEnd);

    const viewIdx = desktopBlock.indexOf("view === 'recent-feed'");
    const fileIdx = desktopBlock.indexOf('selectedFile ? (');
    expect(viewIdx).toBeGreaterThan(0);
    expect(fileIdx).toBeGreaterThan(viewIdx);
  });
});
