/**
 * CodeExcerptCard — feed-card preview slot for code files.
 *
 * Lazy-fetches a server-truncated code excerpt via `fetchFileExcerpt` (T020).
 * Renders as a monospace `<pre><code>` with the detected language as a
 * data-language attribute (in case future Shiki integration wants it).
 * Fade-out gradient at the bottom hints more content — workshop §2.
 *
 * Server-side Shiki HTML rendering is deferred — the orchestrator returns
 * raw text for v1; click-to-open routes to FileViewerPanel for full
 * highlighted view.
 *
 * Plan recent-changes-feed T022.
 */

'use client';

import { useLazyLoad } from '@/features/041-file-browser/hooks/use-lazy-load';
import { useEffect, useState } from 'react';
import { fetchFileExcerpt } from '../../../../../../app/actions/file-actions';
import type { FeedItem } from '../types';

export interface CodeExcerptCardProps {
  item: FeedItem;
  worktreePath: string;
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; content: string; lang: string }
  | { status: 'error'; reason: string };

export function CodeExcerptCard({ item, worktreePath }: CodeExcerptCardProps) {
  const { ref, isVisible } = useLazyLoad();
  const [state, setState] = useState<FetchState>({ status: 'idle' });

  useEffect(() => {
    if (!isVisible || state.status !== 'idle') return;
    let cancelled = false;
    setState({ status: 'loading' });
    fetchFileExcerpt(worktreePath, item.path, 'excerpt')
      .then((result) => {
        if (cancelled) return;
        if (result.ok && result.kind === 'code') {
          setState({ status: 'ready', content: result.content, lang: result.lang });
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
          <pre
            className="px-4 py-3 text-xs font-mono whitespace-pre text-card-foreground/90 max-h-[60vh] overflow-x-auto"
            data-language={state.lang}
          >
            <code>{state.content}</code>
          </pre>
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent"
            aria-hidden="true"
          />
        </>
      )}
    </div>
  );
}
