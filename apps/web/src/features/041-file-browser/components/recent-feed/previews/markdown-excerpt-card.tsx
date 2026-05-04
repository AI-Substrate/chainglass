/**
 * MarkdownExcerptCard — feed-card preview slot for markdown files.
 *
 * Lazy-fetches a server-truncated markdown excerpt via `fetchFileExcerpt`
 * (T020 — server-side `truncateMarkdown` from T014). Output is rendered as
 * `<pre>` text with a fade-out gradient — workshop §2 visual treatment.
 *
 * Full markdown rendering (mermaid + code blocks + tables) is deferred to
 * v1.x — the excerpt card's job is to show "what's in this file" cheaply.
 * Click-to-open routes to the existing FileViewerPanel which has full
 * Mermaid + Shiki rendering.
 *
 * Plan recent-changes-feed T021.
 */

'use client';

import { useLazyLoad } from '@/features/041-file-browser/hooks/use-lazy-load';
import { useEffect, useState } from 'react';
import { fetchFileExcerpt } from '../../../../../../app/actions/file-actions';
import type { FeedItem } from '../types';

export interface MarkdownExcerptCardProps {
  item: FeedItem;
  worktreePath: string;
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; content: string }
  | { status: 'error'; reason: string };

export function MarkdownExcerptCard({ item, worktreePath }: MarkdownExcerptCardProps) {
  const { ref, isVisible } = useLazyLoad();
  const [state, setState] = useState<FetchState>({ status: 'idle' });

  useEffect(() => {
    if (!isVisible || state.status !== 'idle') return;
    let cancelled = false;
    setState({ status: 'loading' });
    fetchFileExcerpt(worktreePath, item.path, 'excerpt')
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.kind === 'markdown') {
          setState({ status: 'ready', content: result.content });
        } else {
          setState({
            status: 'error',
            reason: result.ok ? 'unexpected-kind' : result.error,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ status: 'error', reason: err instanceof Error ? err.message : 'unknown' });
      });
    return () => {
      cancelled = true;
    };
  }, [isVisible, state.status, worktreePath, item.path]);

  return (
    <div ref={ref} className="relative bg-muted/30 max-h-[60vh] overflow-hidden">
      {state.status === 'idle' || state.status === 'loading' ? (
        <div className="px-4 py-6 text-xs text-muted-foreground">Loading excerpt…</div>
      ) : state.status === 'error' ? (
        <div className="px-4 py-6 text-xs text-muted-foreground">
          Excerpt unavailable ({state.reason})
        </div>
      ) : (
        <>
          <pre className="px-4 py-3 text-xs font-mono whitespace-pre-wrap text-card-foreground/90 max-h-[60vh] overflow-hidden">
            {state.content}
          </pre>
          {/* Fade-out gradient hinting more content */}
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent"
            aria-hidden="true"
          />
        </>
      )}
    </div>
  );
}
