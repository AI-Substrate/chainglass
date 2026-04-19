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

import { useTheme } from 'next-themes';
import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MermaidRenderer } from '../../../components/viewers/mermaid-renderer';
import { resolveImageUrl } from '@/features/_platform/viewer';

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
  /** Called when user clicks a relative file link (e.g., ./other.md) */
  onNavigateToFile?: (resolvedPath: string) => void;
}

export const MarkdownPreview = memo(function MarkdownPreview({
  html,
  currentFilePath,
  rawFileBaseUrl,
  onNavigateToFile,
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

  // Handle anchor link clicks and relative file link navigation
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;

      // Anchor links — scroll within the preview container
      if (href.startsWith('#')) {
        e.preventDefault();
        const id = href.slice(1);
        const el = containerRef.current?.querySelector(`#${CSS.escape(id)}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      // Relative file links — resolve and navigate via file browser
      if (
        onNavigateToFile &&
        currentFilePath &&
        !href.startsWith('http') &&
        !href.startsWith('//')
      ) {
        e.preventDefault();
        const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
        // Resolve relative path: join current dir + href, then normalize ../ segments
        const parts = `${currentDir}/${href}`.split('/');
        const resolved: string[] = [];
        for (const part of parts) {
          if (part === '..') resolved.pop();
          else if (part !== '.' && part !== '') resolved.push(part);
        }
        onNavigateToFile(resolved.join('/'));
      }
    },
    [currentFilePath, onNavigateToFile]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;

      if (href.startsWith('#')) {
        e.preventDefault();
        const id = href.slice(1);
        const el = containerRef.current?.querySelector(`#${CSS.escape(id)}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return;
      }

      if (
        onNavigateToFile &&
        currentFilePath &&
        !href.startsWith('http') &&
        !href.startsWith('//')
      ) {
        e.preventDefault();
        const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
        const parts = `${currentDir}/${href}`.split('/');
        const resolved: string[] = [];
        for (const part of parts) {
          if (part === '..') resolved.pop();
          else if (part !== '.' && part !== '') resolved.push(part);
        }
        onNavigateToFile(resolved.join('/'));
      }
    },
    [currentFilePath, onNavigateToFile]
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
