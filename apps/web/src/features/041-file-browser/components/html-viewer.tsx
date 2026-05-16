'use client';

/**
 * HtmlViewer — Inline HTML rendering via blob URL in sandboxed iframe.
 *
 * Fetches the HTML file as text, rewrites relative asset references
 * (img src, link href, script src) to use the raw file API, then
 * renders the rewritten HTML as a blob URL in a sandboxed iframe.
 *
 * FX011: every rewritten URL also carries `&_at=<token>` — a short-
 * lived HMAC asset token minted via `/api/bootstrap/asset-token`. The
 * sandbox's opaque origin strips the HttpOnly bootstrap cookie from
 * sub-resource requests, so the iframe needs an alternate credential
 * to authenticate `<img>` / `<link>` / `<script>` loads against the
 * raw-file route. Sandbox stays strict (`allow-scripts` only — DO NOT
 * add `allow-same-origin`; that would let HTML drive the app API as
 * the authenticated user).
 *
 * Fetch ordering is sequential: token FIRST, HTML second. If token
 * mint fails we render the existing error UI rather than an iframe
 * with broken images.
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
 *
 * Exported for unit testing. Each rewritten URL receives `&_at=<token>`
 * so the sandboxed iframe's sub-resource requests authenticate without
 * the HttpOnly bootstrap cookie.
 */
export function rewriteRelativeUrls(
  html: string,
  currentFilePath: string,
  rawFileBaseUrl: string,
  origin: string,
  token: string
): string {
  const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
  const absoluteBase = `${origin}${rawFileBaseUrl}`;
  const tokenParam = `&_at=${encodeURIComponent(token)}`;

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
      return `${prefix}${absoluteBase}&file=${encodeURIComponent(resolved)}${tokenParam}${suffix}`;
    }
  );
}

/** Extract `worktree` query param from the raw-file URL. */
function extractWorktree(src: string): string | null {
  try {
    const url = new URL(
      src,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    );
    return url.searchParams.get('worktree');
  } catch {
    return null;
  }
}

export function HtmlViewer({ src, currentFilePath, rawFileBaseUrl }: HtmlViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let revoke: string | null = null;

    async function loadAndRewrite(): Promise<void> {
      // FX011: token mint MUST happen before HTML fetch so the rewriter
      // has the token when it splices URLs. Race-free sequential flow.
      // No-token path falls back to no-rewrite (used when context lacks
      // currentFilePath/rawFileBaseUrl, e.g., tests).
      let token: string | null = null;
      const worktree = extractWorktree(src);

      if (currentFilePath && rawFileBaseUrl && worktree) {
        const mintRes = await fetch('/api/bootstrap/asset-token', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ worktree }),
          signal: controller.signal,
        });
        if (!mintRes.ok) {
          if (!controller.signal.aborted) setError(true);
          return;
        }
        const minted = (await mintRes.json()) as { token?: string };
        if (!minted.token) {
          if (!controller.signal.aborted) setError(true);
          return;
        }
        token = minted.token;
        // TODO(FX011 v2): proactive token refresh when expiry < 60s,
        // e.g., on visibility-change. For v1 the 10-min TTL covers
        // typical viewing sessions; expired tokens surface as the
        // browser's broken-image icon.
      }

      const bodyRes = await fetch(src, { signal: controller.signal });
      const html = await bodyRes.text();
      if (controller.signal.aborted) return;

      const rewritten =
        currentFilePath && rawFileBaseUrl && token
          ? rewriteRelativeUrls(
              html,
              currentFilePath,
              rawFileBaseUrl,
              window.location.origin,
              token
            )
          : html;

      const blob = new Blob([rewritten], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      revoke = url;
      setBlobUrl(url);
    }

    loadAndRewrite().catch((e: unknown) => {
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
