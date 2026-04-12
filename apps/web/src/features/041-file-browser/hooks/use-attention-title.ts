'use client';

/**
 * useAttentionTitle — Dynamic browser tab title with workspace emoji.
 *
 * Sets document.title to "{emoji} {pageName}" with optional ❗ prefix
 * when attention is needed. Restores original title on unmount.
 *
 * Uses the shared TitleManager SDK so other features (e.g. question popper)
 * can add prefixes without fighting over document.title.
 *
 * Phase 3: UI Overhaul — Plan 041: File Browser
 */

import { clearTitlePrefix, setTitleBase, setTitlePrefix } from '@/lib/sdk/title-manager';
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
    const prefix = emoji || (workspaceName ? workspaceName.substring(0, 2).toUpperCase() : '');
    const base = `${prefix} ${pageName}`.trim();
    if (base) setTitleBase(base);

    if (needsAttention) {
      setTitlePrefix('attention', '❗');
    } else {
      clearTitlePrefix('attention');
    }

    return () => clearTitlePrefix('attention');
  }, [emoji, pageName, workspaceName, needsAttention]);
}
