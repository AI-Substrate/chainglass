'use client';

/**
 * MarkdownPreview — Client component for rendering server-rendered markdown HTML.
 *
 * Renders HTML from renderMarkdownToHtml() and activates mermaid diagrams
 * by finding data-mermaid divs and rendering them via MermaidRenderer portals.
 *
 * Fix FX001-7: Viewer integration for markdown preview.
 */

import { useTheme } from 'next-themes';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
  /** Called when user clicks a relative file link (e.g., ./other.md) */
  onNavigateToFile?: (resolvedPath: string) => void;
}

export const MarkdownPreview = memo(function MarkdownPreview({
  html,
  currentFilePath,
  onNavigateToFile,
}: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [mermaidPortals, setMermaidPortals] = useState<MermaidPortal[]>([]);

  // Find mermaid divs after HTML is set and create portal targets
  useEffect(() => {
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
        key: `mermaid-${Math.random().toString(36).slice(2, 8)}`,
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
        // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is server-rendered from trusted markdown via renderMarkdownToHtml
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {mermaidPortals.map((portal) =>
        createPortal(<MermaidRenderer code={portal.code} />, portal.container, portal.key)
      )}
    </>
  );
});
