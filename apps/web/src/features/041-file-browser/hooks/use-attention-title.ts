'use client';

/**
 * useAttentionTitle — Dynamic browser tab title with workspace emoji.
 *
 * Sets document.title to "{emoji} {pageName}" with optional ❗ prefix
 * when attention is needed. Restores original title on unmount.
 *
 * Phase 3: UI Overhaul — Plan 041: File Browser
 */

import { useEffect } from 'react';

export interface UseAttentionTitleOptions {
  emoji: string;
  pageName: string;
  workspaceName?: string;
  needsAttention?: boolean;
}

export function useAttentionTitle({
  emoji,
  pageName,
  workspaceName,
  needsAttention,
}: UseAttentionTitleOptions) {
  useEffect(() => {
    const prefix = emoji || (workspaceName ? workspaceName.charAt(0).toUpperCase() : '');
    const attention = needsAttention ? '❗ ' : '';
    const title = `${attention}${prefix} ${pageName}`.trim();
    if (!title) return;

    document.title = title;

    // Next.js metadata re-applies <title> during soft navigations (e.g. nuqs
    // param changes), overwriting our client-set title. MutationObserver
    // re-asserts the dynamic title whenever the <title> element changes.
    const titleEl = document.querySelector('title');
    if (!titleEl) return;

    const observer = new MutationObserver(() => {
      if (document.title !== title) {
        document.title = title;
      }
    });
    observer.observe(titleEl, { childList: true, characterData: true, subtree: true });

    return () => observer.disconnect();
  }, [emoji, pageName, workspaceName, needsAttention]);
}
