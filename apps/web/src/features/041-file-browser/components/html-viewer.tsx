'use client';

/**
 * HtmlViewer — Inline HTML rendering via blob URL in sandboxed iframe.
 *
 * Fetches the HTML file as text, rewrites relative asset references
 * (img src, link href, script src) to use the raw file API, then
 * renders the rewritten HTML as a blob URL in a sandboxed iframe.
 *
 * This mirrors the approach in MarkdownPreview for resolving relative
 * image paths — without rewriting, blob: URLs have no path context
 * so relative references fail.
 */

import { AsciiSpinner } from '@/features/_platform/panel-layout';
import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface HtmlViewerProps {
  src: string;
  /** Current file path relative to workspace root, for resolving relative asset URLs */
  currentFilePath?: string;
  /** Base URL for raw file API (without &file= param) */
  rawFileBaseUrl?: string;
}

/**
 * Resolve a relative path against a directory, normalizing ../ segments.
 * Same algorithm as MarkdownPreview.
 */
function resolveRelativePath(currentDir: string, relativePath: string): string {
  const parts = `${currentDir}/${relativePath}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  return resolved.join('/');
}

/**
 * Rewrite relative asset URLs in HTML string to use the raw file API.
 * URLs are made fully absolute (including origin) so they work inside
 * sandboxed blob: iframes which have an opaque origin.
 */
function rewriteRelativeUrls(
  html: string,
  currentFilePath: string,
  rawFileBaseUrl: string,
  origin: string
): string {
  const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
  const absoluteBase = `${origin}${rawFileBaseUrl}`;

  // Match src="..." or href="..." (not starting with http, //, data:, #, or /)
  return html.replace(
    /(\b(?:src|href)=["'])([^"'#][^"']*)(["'])/gi,
    (match, prefix: string, url: string, suffix: string) => {
      if (
        url.startsWith('http') ||
        url.startsWith('//') ||
        url.startsWith('data:') ||
        url.startsWith('/') ||
        url.startsWith('#')
      ) {
        return match;
      }
      const resolved = resolveRelativePath(currentDir, url);
      return `${prefix}${absoluteBase}&file=${encodeURIComponent(resolved)}${suffix}`;
    }
  );
}

export function HtmlViewer({ src, currentFilePath, rawFileBaseUrl }: HtmlViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let revoke: string | null = null;

    fetch(src, { signal: controller.signal })
      .then((res) => res.text())
      .then((html) => {
        if (controller.signal.aborted) return;

        // Rewrite relative URLs if we have the context to do so
        // Must use absolute URLs (with origin) because the sandboxed blob:
        // iframe has an opaque origin and can't resolve root-relative paths
        const rewritten =
          currentFilePath && rawFileBaseUrl
            ? rewriteRelativeUrls(html, currentFilePath, rawFileBaseUrl, window.location.origin)
            : html;

        const blob = new Blob([rewritten], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        revoke = url;
        setBlobUrl(url);
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(true);
      });
    return () => {
      controller.abort();
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [src, currentFilePath, rawFileBaseUrl]);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-end px-2 py-1 border-b shrink-0">
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          Open in new tab
        </a>
      </div>
      {!blobUrl && !error && (
        <div className="flex items-center justify-center p-8">
          <AsciiSpinner active={true} />
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          Failed to load HTML file
        </div>
      )}
      {blobUrl && (
        <iframe
          src={blobUrl}
          sandbox="allow-scripts"
          className="flex-1 w-full border-0 min-h-0 bg-white"
          title="HTML viewer"
        />
      )}
    </div>
  );
}
