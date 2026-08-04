'use client';

/**
 * MarkdownPreview — Client component for rendering server-rendered markdown HTML.
 *
 * Renders HTML from renderMarkdownToHtml() and activates mermaid diagrams
 * by finding data-mermaid divs and rendering them via MermaidRenderer portals.
 *
 * innerHTML is set via ref (not dangerouslySetInnerHTML) so that React does not
 * re-write the DOM on state-driven re-renders, which would destroy portal targets.
 *
 * Fix FX001-7: Viewer integration for markdown preview.
 */

import { resolveImageUrl } from '@/features/_platform/viewer';
import { useTheme } from 'next-themes';
import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MermaidRenderer } from '../../../components/viewers/mermaid-renderer';

interface MermaidPortal {
  code: string;
  container: HTMLElement;
  key: string;
}

interface MarkdownPreviewProps {
  html: string;
  /** Current file path relative to workspace root, for resolving relative links */
  currentFilePath?: string;
  /** Base URL for raw file API, e.g. /api/workspaces/slug/files/raw?worktree=... */
  rawFileBaseUrl?: string;
  /**
   * Called when user clicks a relative file link (e.g., ./other.md).
   * `fragment` carries the `#heading` portion when the link had one, so the
   * destination can scroll to it — the path itself is always fragment-free.
   */
  onNavigateToFile?: (resolvedPath: string, fragment?: string) => void;
  /** Anchor id to scroll to once this document has rendered (cross-file `#heading` links) */
  scrollToAnchor?: string | null;
}

/**
 * Split a markdown href into its path and `#fragment` parts.
 *
 * A link may be path-only (`./other.md`), fragment-only (`#rows`), or both
 * (`../../backpressure.dd.md#rows`). The third form is the one that matters:
 * treating it as an opaque path asks the file API for a file literally named
 * `backpressure.dd.md#rows`, which never exists.
 */
function splitHref(href: string): { path: string; fragment: string } {
  const hashIndex = href.indexOf('#');
  if (hashIndex === -1) return { path: href, fragment: '' };
  return { path: href.slice(0, hashIndex), fragment: href.slice(hashIndex + 1) };
}

/** Resolve a relative markdown link against the current file's directory. */
function resolveRelativePath(currentFilePath: string, path: string): string {
  const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
  const parts = `${currentDir}/${path}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  return resolved.join('/');
}

export const MarkdownPreview = memo(function MarkdownPreview({
  html,
  currentFilePath,
  rawFileBaseUrl,
  onNavigateToFile,
  scrollToAnchor,
}: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [mermaidPortals, setMermaidPortals] = useState<MermaidPortal[]>([]);
  const prevHtmlRef = useRef<string>('');

  // Set innerHTML via ref so React does not own these DOM nodes.
  // This prevents React from re-writing innerHTML on state-driven re-renders
  // (e.g. when setMermaidPortals triggers a re-render), which would destroy
  // the portal target elements that MermaidRenderer is rendered into.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (prevHtmlRef.current === html) return;
    prevHtmlRef.current = html;
    container.innerHTML = html;

    // Rewrite relative image src attributes via the shared resolver.
    // Rich mode uses the same resolver so both surfaces agree on image URLs.
    const imgs = container.querySelectorAll<HTMLImageElement>('img[src]');
    for (const img of imgs) {
      const resolved = resolveImageUrl({
        src: img.getAttribute('src') ?? undefined,
        currentFilePath,
        rawFileBaseUrl,
      });
      if (resolved !== null) img.src = resolved;
    }
  }, [html, rawFileBaseUrl, currentFilePath]);

  // Find mermaid divs after HTML is set and create portal targets
  // biome-ignore lint/correctness/useExhaustiveDependencies: html and resolvedTheme trigger re-scan of data-mermaid divs
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const mermaidDivs = container.querySelectorAll<HTMLElement>('[data-mermaid="true"]');
    if (mermaidDivs.length === 0) {
      setMermaidPortals([]);
      return;
    }

    const portals: MermaidPortal[] = [];
    for (const div of mermaidDivs) {
      const code = div.getAttribute('data-mermaid-code');
      if (!code) continue;
      portals.push({
        code,
        container: div,
        key: `mermaid-${code.length}-${code.charCodeAt(0)}`,
      });
    }
    setMermaidPortals(portals);
  }, [html, resolvedTheme]);

  const scrollToId = useCallback((id: string) => {
    if (!id) return false;
    const el = containerRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }, []);

  // Cross-file `#heading` links: the destination document scrolls to the anchor
  // once its HTML is in the DOM. Declared after the innerHTML layout effect so
  // it runs against the new content in the same commit.
  useLayoutEffect(() => {
    if (!scrollToAnchor) return;
    scrollToId(scrollToAnchor);
  }, [scrollToAnchor, scrollToId]);

  // Single activation path for both pointer and keyboard, so the two cannot drift.
  const activateLink = useCallback(
    (anchor: HTMLAnchorElement): boolean => {
      const href = anchor.getAttribute('href');
      if (!href) return false;

      const { path, fragment } = splitHref(href);

      // Fragment-only link — scroll within this document. Always claimed, even
      // when the target id is absent: letting a dead `#anchor` reach the browser
      // would strand a hash on the URL that the file browser does not own.
      if (!path) {
        scrollToId(fragment);
        return true;
      }

      if (!onNavigateToFile || !currentFilePath) return false;
      if (path.startsWith('http') || path.startsWith('//')) return false;

      const resolved = resolveRelativePath(currentFilePath, path);

      // A relative link that points back at the open file is a same-document
      // jump; navigating would be a no-op that swallows the scroll.
      if (resolved === currentFilePath) {
        scrollToId(fragment);
        return true;
      }

      onNavigateToFile(resolved, fragment || undefined);
      return true;
    },
    [currentFilePath, onNavigateToFile, scrollToId]
  );

  // Handle anchor link clicks and relative file link navigation
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      if (activateLink(anchor)) e.preventDefault();
    },
    [activateLink]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      if (activateLink(anchor)) e.preventDefault();
    },
    [activateLink]
  );

  return (
    <>
      <div
        ref={containerRef}
        className="prose dark:prose-invert max-w-none"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      />
      {mermaidPortals.map((portal) =>
        createPortal(<MermaidRenderer code={portal.code} />, portal.container, portal.key)
      )}
    </>
  );
});
