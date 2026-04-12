'use client';

/**
 * useTmuxBellNotification — Play sound + flash tab title on tmux bell events.
 *
 * Subscribes to the 'tmux-events' SSE channel and reacts to BELL events.
 * Plays a notification sound and sets a temporary 🔔 prefix on the browser
 * tab title. All bells fire regardless of which tmux session originated them.
 *
 * Plan 080: tmux Eventing System
 */

import { clearTitlePrefix, setTitlePrefix } from '@/lib/sdk/title-manager';
import type { MultiplexedSSEMessage } from '@/lib/sse/types';
import { useChannelCallback } from '@/lib/sse/use-channel-callback';
import { useCallback, useEffect, useRef } from 'react';

const BELL_SOUND_URL = '/sounds/bell.mp3';
const TITLE_FLASH_MS = 5000;

export function useTmuxBellNotification(): void {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleEvent = useCallback((event: MultiplexedSSEMessage) => {
    if (event.type !== 'BELL') return;

    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Autoplay blocked — degrade to title-only flash
      });
    }

    setTitlePrefix('bell', '🔔');
    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
    }
    flashTimerRef.current = setTimeout(() => {
      clearTitlePrefix('bell');
      flashTimerRef.current = null;
    }, TITLE_FLASH_MS);
  }, []);

  useChannelCallback('tmux-events', handleEvent);
}
