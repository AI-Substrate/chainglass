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
import { useEffect, useRef } from 'react';

interface MarkdownPreviewProps {
  html: string;
}

export function MarkdownPreview({ html }: MarkdownPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  // Activate mermaid diagrams after HTML is rendered
  // biome-ignore lint/correctness/useExhaustiveDependencies: html changes trigger re-render which needs mermaid re-activation
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const mermaidDivs = container.querySelectorAll<HTMLElement>('[data-mermaid="true"]');
    if (mermaidDivs.length === 0) return;

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
    });

    return () => {
      mounted = false;
    };
  }, [html, resolvedTheme]);

  return (
    <div
      ref={containerRef}
      className="prose dark:prose-invert max-w-none"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: HTML is server-rendered from trusted markdown via renderMarkdownToHtml
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
