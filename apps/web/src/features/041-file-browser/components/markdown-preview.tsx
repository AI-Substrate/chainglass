'use client';

/**
 * MarkdownPreview — Client component for rendering server-rendered markdown HTML.
 *
 * Renders HTML from renderMarkdownToHtml() and activates mermaid diagrams
 * by finding data-mermaid divs and rendering them with the mermaid library.
 *
 * Fix FX001-7: Viewer integration for markdown preview.
 */

import { useTheme } from 'next-themes';
import { memo, useCallback, useEffect, useRef } from 'react';

interface MarkdownPreviewProps {
  html: string;
}

export const MarkdownPreview = memo(function MarkdownPreview({ html }: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const renderedHtmlRef = useRef<string>('');

  // Activate mermaid diagrams after HTML is rendered
  // biome-ignore lint/correctness/useExhaustiveDependencies: html changes trigger re-render which needs mermaid re-activation
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Skip if already rendered for this exact html + theme combo
    const cacheKey = `${html}::${resolvedTheme}`;
    if (renderedHtmlRef.current === cacheKey) return;

    const mermaidDivs = container.querySelectorAll<HTMLElement>('[data-mermaid="true"]');
    if (mermaidDivs.length === 0) {
      renderedHtmlRef.current = cacheKey;
      return;
    }

    let mounted = true;

    import('mermaid').then(async (mod) => {
      if (!mounted) return;
      const mermaid = mod.default;

      mermaid.initialize({
        startOnLoad: false,
        theme: resolvedTheme === 'dark' ? 'dark' : 'default',
        securityLevel: 'strict',
      });

      for (const div of mermaidDivs) {
        // Skip already-rendered diagrams
        if (div.classList.contains('mermaid-renderer-svg')) continue;
        const code = div.getAttribute('data-mermaid-code');
        if (!code || !mounted) continue;

        try {
          const id = `mermaid-preview-${Math.random().toString(36).slice(2, 8)}`;
          const result = await mermaid.render(id, code);
          if (mounted) {
            div.innerHTML = result.svg;
            div.classList.add('mermaid-renderer-svg');
          }
        } catch {
          if (mounted) {
            div.textContent = 'Diagram rendering failed';
            div.classList.add('mermaid-renderer-error');
          }
        }
      }

      if (mounted) {
        renderedHtmlRef.current = cacheKey;
      }
    });

    return () => {
      mounted = false;
    };
  }, [html, resolvedTheme]);

  // Handle anchor link clicks — scroll within the preview container
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href?.startsWith('#')) return;
    e.preventDefault();
    const id = href.slice(1);
    const el = containerRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href?.startsWith('#')) return;
    e.preventDefault();
    const id = href.slice(1);
    const el = containerRef.current?.querySelector(`#${CSS.escape(id)}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="prose dark:prose-invert max-w-none"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is server-rendered from trusted markdown via renderMarkdownToHtml
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
