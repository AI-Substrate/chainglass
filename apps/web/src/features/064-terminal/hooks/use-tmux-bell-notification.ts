'use client';

/**
 * useTmuxBellNotification — Play sound + flash tab title on tmux bell events.
 *
 * Subscribes to the 'tmux-events' SSE channel and reacts to BELL events
 * from tmux sessions matching the current workspace. Plays a wav file and
 * sets a temporary 🔔 prefix on the browser tab title.
 *
 * Plan 080: tmux Eventing System
 */

import { useWorkspaceContext } from '@/features/041-file-browser/hooks/use-workspace-context';
import { clearTitlePrefix, setTitlePrefix } from '@/lib/sdk/title-manager';
import type { MultiplexedSSEMessage } from '@/lib/sse/types';
import { useChannelCallback } from '@/lib/sse/use-channel-callback';
import { useCallback, useEffect, useRef } from 'react';
import { sanitizeSessionName } from '../lib/sanitize-session-name';

const BELL_SOUND_URL = '/sounds/bell.mp3';
const TITLE_FLASH_MS = 5000;

/**
 * Derive the expected tmux session name for the current workspace.
 * Uses the worktree directory basename, sanitized the same way terminal-ws.ts does.
 */
function deriveSessionName(worktreePath: string | undefined): string | null {
  if (!worktreePath) return null;
  const basename = worktreePath.split('/').filter(Boolean).pop();
  if (!basename) return null;
  return sanitizeSessionName(basename);
}

export function useTmuxBellNotification(): void {
  const ctx = useWorkspaceContext();
  const worktreePath = ctx?.worktreeIdentity?.worktreePath;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-create audio element on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio(BELL_SOUND_URL);
      audioRef.current.volume = 0.5;
    }
    return () => {
      audioRef.current = null;
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  const handleEvent = useCallback(
    (event: MultiplexedSSEMessage) => {
      if (event.type !== 'BELL') return;

      const eventSession = (event as Record<string, unknown>).session;
      if (typeof eventSession !== 'string') return;

      // Match bell to this workspace's tmux session
      const expectedSession = deriveSessionName(worktreePath);
      if (expectedSession && eventSession !== expectedSession) return;

      // Play sound (gracefully handle autoplay restrictions)
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {
          // Autoplay blocked — degrade to title-only flash
        });
      }

      // Flash title prefix
      setTitlePrefix('bell', '🔔');
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
      }
      flashTimerRef.current = setTimeout(() => {
        clearTitlePrefix('bell');
        flashTimerRef.current = null;
      }, TITLE_FLASH_MS);
    },
    [worktreePath]
  );

  useChannelCallback('tmux-events', handleEvent);
}
