'use client';

/**
 * Plan 059 Phase 3: Attention System — 3-layer escalation for agent questions
 *
 * Layer 1: Chip amber pulse (handled in AgentChip via status styles)
 * Layer 2: Toast notification when overlay is closed
 * Layer 3: Screen border flash (green glow) + floating ❓ badge
 *
 * Workshop 001: 30s cooldown on screen flash, badge click cycles through agents.
 *
 * This component provides Layer 2 (toast) and Layer 3 (flash + badge).
 * Layer 1 is built into AgentChip's status animation.
 */

import { useAgentOverlay } from '@/hooks/use-agent-overlay';
import { useRecentAgents } from '@/hooks/use-recent-agents';
import { cn } from '@/lib/utils';
import { HelpCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface AttentionFlashProps {
  workspace?: string;
  worktreeSlug?: string;
}

const FLASH_DURATION_MS = 10_000;
const FLASH_COOLDOWN_MS = 30_000;

export function AttentionFlash({ workspace, worktreeSlug }: AttentionFlashProps) {
  const { agents } = useRecentAgents(workspace, worktreeSlug);
  const { openAgent, activeAgentId } = useAgentOverlay();
  const [isFlashing, setIsFlashing] = useState(false);
  const lastFlashRef = useRef(0);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Agents currently waiting for input — only true waiting_input status
  const waitingAgents = agents.filter((a) => (a.status as string) === 'waiting_input');
  const questionCount = waitingAgents.length;

  // Track previously seen waiting agents to detect NEW questions
  const prevWaitingRef = useRef(new Set<string>());

  useEffect(() => {
    const currentWaiting = new Set(waitingAgents.map((a) => a.id));
    const prevWaiting = prevWaitingRef.current;

    // Detect new waiting agents (not previously waiting)
    const newWaiting = waitingAgents.filter((a) => !prevWaiting.has(a.id));

    if (newWaiting.length > 0 && !activeAgentId) {
      // Layer 2: Toast notification per new waiting agent
      for (const agent of newWaiting) {
        toast(`${agent.name} needs input`, {
          description: agent.intent?.slice(0, 80) || 'Waiting for your response',
          action: {
            label: 'View',
            onClick: () => openAgent(agent.id),
          },
          duration: 10_000,
        });
      }

      const now = Date.now();
      // Layer 3: Screen flash with cooldown
      if (now - lastFlashRef.current > FLASH_COOLDOWN_MS) {
        setIsFlashing(true);
        lastFlashRef.current = now;
        if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = setTimeout(() => setIsFlashing(false), FLASH_DURATION_MS);
      }
    }

    prevWaitingRef.current = currentWaiting;
  }, [waitingAgents, activeAgentId, openAgent]);

  // Cleanup flash timeout
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  // Badge click: open first waiting agent, or cycle through them
  const handleBadgeClick = useCallback(() => {
    if (waitingAgents.length === 0) return;
    // Find next waiting agent after current, or first
    const currentIdx = waitingAgents.findIndex((a) => a.id === activeAgentId);
    const nextIdx = (currentIdx + 1) % waitingAgents.length;
    openAgent(waitingAgents[nextIdx].id);
  }, [waitingAgents, activeAgentId, openAgent]);

  return (
    <>
      {/* Layer 3: Screen border flash */}
      {isFlashing && (
        <div
          className="pointer-events-none fixed inset-0 animate-pulse"
          style={{
            boxShadow: 'inset 0 0 60px 10px rgba(34, 197, 94, 0.3)',
            zIndex: 9999,
          }}
          aria-hidden="true"
        />
      )}

      {/* Layer 3: Floating ❓ badge (visible when there are waiting agents and overlay is closed) */}
      {questionCount > 0 && !activeAgentId && (
        <button
          type="button"
          onClick={handleBadgeClick}
          className={cn(
            'fixed top-3 left-3 z-50',
            'inline-flex items-center gap-1 rounded-full',
            'bg-amber-500 text-white px-2.5 py-1.5',
            'text-xs font-bold shadow-lg',
            'hover:bg-amber-600 transition-colors',
            'animate-bounce'
          )}
          aria-label={`${questionCount} agent${questionCount > 1 ? 's' : ''} waiting for input`}
        >
          <HelpCircle className="h-4 w-4" />
          {questionCount}
        </button>
      )}
    </>
  );
}
