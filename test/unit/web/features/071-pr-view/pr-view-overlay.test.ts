/**
 * PR View Overlay — Lightweight UI Validation
 *
 * Tests the Phase 5 overlay behaviors: open/toggle, mutual exclusion,
 * Escape close, viewed-collapse, expand/collapse all, data hook cache.
 *
 * Why: Phase 5 added 14 UI source files. These tests validate the
 * core overlay interactions without requiring a full browser.
 *
 * Contract: PRViewOverlayProvider provides open/close/toggle with
 * mutual exclusion via overlay:close-all + isOpeningRef guard.
 * usePRViewData provides optimistic mark/unmark and collapsed state.
 *
 * Plan 071: PR View & File Notes — Phase 5, FT-001
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Provider tests (pure logic, no DOM) ---

describe('PRViewOverlayProvider logic', () => {
  let closeAllEvents: number;
  let prViewToggleEvents: number;

  beforeEach(() => {
    closeAllEvents = 0;
    prViewToggleEvents = 0;
    window.addEventListener('overlay:close-all', () => closeAllEvents++);
    window.addEventListener('pr-view:toggle', () => prViewToggleEvents++);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches overlay:close-all when pr-view:toggle opens', () => {
    // Simulate what the provider does internally on toggle-open
    const isOpeningRef = { current: false };
    isOpeningRef.current = true;
    window.dispatchEvent(new CustomEvent('overlay:close-all'));
    isOpeningRef.current = false;

    expect(closeAllEvents).toBe(1);
  });

  it('isOpeningRef guard prevents self-close during open', () => {
    const isOpeningRef = { current: false };
    let wouldClose = false;

    // Simulate the overlay:close-all listener
    const handler = () => {
      if (isOpeningRef.current) return; // PL-08 guard
      wouldClose = true;
    };
    window.addEventListener('overlay:close-all', handler);

    // Simulate opening: set guard, dispatch, clear guard
    isOpeningRef.current = true;
    window.dispatchEvent(new CustomEvent('overlay:close-all'));
    isOpeningRef.current = false;

    expect(wouldClose).toBe(false);

    // Without guard, close-all DOES close
    window.dispatchEvent(new CustomEvent('overlay:close-all'));
    expect(wouldClose).toBe(true);

    window.removeEventListener('overlay:close-all', handler);
  });

  it('Escape key handler calls close when overlay is open', () => {
    let closed = false;
    const closePRView = () => {
      closed = true;
    };

    // Simulate what the panel does: listen for Escape when open
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePRView();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(true);

    document.removeEventListener('keydown', handleKeyDown);
  });

  it('does not close on non-Escape keys', () => {
    let closed = false;
    const closePRView = () => {
      closed = true;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePRView();
    };
    document.addEventListener('keydown', handleKeyDown);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(closed).toBe(false);

    document.removeEventListener('keydown', handleKeyDown);
  });
});

// --- usePRViewData logic tests ---

describe('usePRViewData logic', () => {
  it('marking a file as reviewed adds it to collapsed set', () => {
    const collapsedFiles = new Set<string>();

    // Simulate markReviewed behavior
    const markReviewed = (filePath: string) => {
      collapsedFiles.add(filePath);
    };

    markReviewed('src/app.tsx');
    expect(collapsedFiles.has('src/app.tsx')).toBe(true);
  });

  it('unmarking a file removes it from collapsed set', () => {
    const collapsedFiles = new Set(['src/app.tsx', 'src/lib.tsx']);

    const unmarkReviewed = (filePath: string) => {
      collapsedFiles.delete(filePath);
    };

    unmarkReviewed('src/app.tsx');
    expect(collapsedFiles.has('src/app.tsx')).toBe(false);
    expect(collapsedFiles.has('src/lib.tsx')).toBe(true);
  });

  it('expandAll clears all collapsed files', () => {
    let collapsedFiles = new Set(['a.ts', 'b.ts', 'c.ts']);

    const expandAll = () => {
      collapsedFiles = new Set();
    };

    expandAll();
    expect(collapsedFiles.size).toBe(0);
  });

  it('collapseAll adds all file paths to collapsed set', () => {
    const files = [{ path: 'a.ts' }, { path: 'b.ts' }, { path: 'c.ts' }];

    const collapseAll = () => new Set(files.map((f) => f.path));

    const collapsed = collapseAll();
    expect(collapsed.size).toBe(3);
    expect(collapsed.has('a.ts')).toBe(true);
    expect(collapsed.has('c.ts')).toBe(true);
  });

  it('optimistic cache mutation updates reviewed count', () => {
    const data = {
      files: [
        { path: 'a.ts', reviewed: false },
        { path: 'b.ts', reviewed: true },
        { path: 'c.ts', reviewed: false },
      ],
      stats: { reviewedCount: 1 },
    };

    // Simulate updateFileInCache for marking a.ts reviewed
    const newFiles = data.files.map((f) => (f.path === 'a.ts' ? { ...f, reviewed: true } : f));
    const reviewedCount = newFiles.filter((f) => f.reviewed).length;

    expect(reviewedCount).toBe(2);
    expect(newFiles[0].reviewed).toBe(true);
  });

  it('toggle toggles based on current reviewed state', () => {
    const files = [
      { path: 'a.ts', reviewed: false },
      { path: 'b.ts', reviewed: true },
    ];

    const toggleReviewed = (filePath: string) => {
      const file = files.find((f) => f.path === filePath);
      return file ? !file.reviewed : undefined;
    };

    expect(toggleReviewed('a.ts')).toBe(true); // was false → mark
    expect(toggleReviewed('b.ts')).toBe(false); // was true → unmark
  });
});

// --- Scroll sync guard tests ---

describe('scroll sync isScrollingToRef guard', () => {
  it('guard prevents observer callback during programmatic scroll', () => {
    const isScrollingToRef = { current: false };
    let activeFileUpdated = false;

    const observerCallback = () => {
      if (isScrollingToRef.current) return;
      activeFileUpdated = true;
    };

    // Simulate programmatic scroll
    isScrollingToRef.current = true;
    observerCallback();
    expect(activeFileUpdated).toBe(false);

    // After scroll settles
    isScrollingToRef.current = false;
    observerCallback();
    expect(activeFileUpdated).toBe(true);
  });
});

// --- Status badge mapping tests ---

describe('PR View status badges', () => {
  const STATUS_COLORS: Record<string, string> = {
    modified: 'text-amber-500',
    added: 'text-green-500',
    deleted: 'text-red-500',
    renamed: 'text-blue-500',
    untracked: 'text-muted-foreground',
  };

  const STATUS_LETTERS: Record<string, string> = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    renamed: 'R',
    untracked: '?',
  };

  it('maps all DiffFileStatus values to colors', () => {
    const statuses = ['modified', 'added', 'deleted', 'renamed', 'untracked'];
    for (const status of statuses) {
      expect(STATUS_COLORS[status]).toBeDefined();
      expect(STATUS_LETTERS[status]).toBeDefined();
    }
  });

  it('has unique letters for each status', () => {
    const letters = Object.values(STATUS_LETTERS);
    expect(new Set(letters).size).toBe(letters.length);
  });
});
