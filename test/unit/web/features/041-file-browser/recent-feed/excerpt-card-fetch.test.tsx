/**
 * Excerpt-card lifecycle test — verifies that mounting CodeExcerptCard /
 * MarkdownExcerptCard actually fires `fetchFileExcerpt` and renders the
 * resolved content (not stuck on "Loading excerpt…").
 *
 * Regression guard for the bug where putting `state.status` in the effect's
 * dep array caused the cleanup to cancel its own in-flight fetch on the
 * idle→loading state transition, leaving the card stuck on the loading UI.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../apps/web/app/actions/file-actions', () => ({
  fetchFileExcerpt: vi.fn(async (_w: string, p: string, _m: string) => {
    if (p.endsWith('.md')) {
      return { ok: true, kind: 'markdown', content: '# Hello md', mode: 'excerpt' };
    }
    return {
      ok: true,
      kind: 'code',
      content: 'console.log(1)',
      lang: 'javascript',
      mode: 'excerpt',
    };
  }),
}));

import { CodeExcerptCard } from '@/features/041-file-browser/components/recent-feed/previews/code-excerpt-card';
import { MarkdownExcerptCard } from '@/features/041-file-browser/components/recent-feed/previews/markdown-excerpt-card';
import type { FeedItem } from '@/features/041-file-browser/components/recent-feed/types';

afterEach(() => cleanup());

const codeItem: FeedItem = {
  path: 'src/index.js',
  absolutePath: '/tmp/wt/src/index.js',
  name: 'index.js',
  changedAt: 0,
  size: 0,
  kind: 'code',
  eventType: 'changed',
};

const mdItem: FeedItem = {
  path: 'README.md',
  absolutePath: '/tmp/wt/README.md',
  name: 'README.md',
  changedAt: 0,
  size: 0,
  kind: 'markdown',
  eventType: 'changed',
};

describe('CodeExcerptCard / MarkdownExcerptCard mount lifecycle', () => {
  it('fetches and renders code excerpt content on mount', async () => {
    render(<CodeExcerptCard item={codeItem} worktreePath="/tmp/wt" />);
    await waitFor(() => {
      expect(screen.getByText('console.log(1)')).toBeTruthy();
    });
  });

  it('fetches and renders markdown excerpt content on mount', async () => {
    render(<MarkdownExcerptCard item={mdItem} worktreePath="/tmp/wt" />);
    await waitFor(() => {
      expect(screen.getByText('# Hello md')).toBeTruthy();
    });
  });
});
