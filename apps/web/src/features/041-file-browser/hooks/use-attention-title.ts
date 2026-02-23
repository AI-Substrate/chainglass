'use client';

/**
 * useAttentionTitle — Dynamic browser tab title with workspace emoji.
 *
 * Sets document.title to "{emoji} {pageName}" with optional ❗ prefix
 * when attention is needed. Restores original title on unmount.
 *
 * Phase 3: UI Overhaul — Plan 041: File Browser
 */

import { useEffect, useRef } from 'react';

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
  const originalTitle = useRef<string>('');

  useEffect(() => {
    originalTitle.current = document.title;

    return () => {
      document.title = originalTitle.current;
    };
  }, []);

  useEffect(() => {
    const prefix = emoji || (workspaceName ? workspaceName.charAt(0).toUpperCase() : '');
    const attention = needsAttention ? '❗ ' : '';
    document.title = `${attention}${prefix} ${pageName}`;
  }, [emoji, pageName, workspaceName, needsAttention]);
}
