'use client';

/**
 * Plan 059 Phase 3: Agent Overlay — Context + Hook
 *
 * Provides a global mechanism to open/close an agent chat overlay
 * from anywhere in the component tree. One overlay at a time
 * (walkie-talkie metaphor from Workshop 002).
 *
 * Usage:
 * ```tsx
 * // Wrap content in provider (at DashboardShell level)
 * <AgentOverlayProvider>
 *   <YourContent />
 * </AgentOverlayProvider>
 *
 * // Open from any child component
 * const { openAgent, closeAgent } = useAgentOverlay();
 * openAgent('agent-abc');
 * ```
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

interface AgentOverlayState {
  /** Currently displayed agent ID, or null if closed */
  activeAgentId: string | null;
  /** Whether the overlay is visible */
  isOpen: boolean;
  /** Open overlay for an agent. Closes any existing overlay first. */
  openAgent: (agentId: string) => void;
  /** Close the overlay. Agent keeps running in background. */
  closeAgent: () => void;
  /** Toggle: open if different agent, close if same agent */
  toggleAgent: (agentId: string) => void;
}

const AgentOverlayContext = createContext<AgentOverlayState | null>(null);

export function AgentOverlayProvider({ children }: { children: ReactNode }) {
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const isOpeningRef = useRef(false);

  const openAgent = useCallback((agentId: string) => {
    isOpeningRef.current = true;
    window.dispatchEvent(new CustomEvent('overlay:close-all'));
    isOpeningRef.current = false;
    setActiveAgentId(agentId);
  }, []);

  const closeAgent = useCallback(() => {
    setActiveAgentId(null);
  }, []);

  const toggleAgent = useCallback((agentId: string) => {
    setActiveAgentId((current) => {
      if (current === agentId) return null;
      isOpeningRef.current = true;
      window.dispatchEvent(new CustomEvent('overlay:close-all'));
      isOpeningRef.current = false;
      return agentId;
    });
  }, []);

  const value: AgentOverlayState = {
    activeAgentId,
    isOpen: activeAgentId !== null,
    openAgent,
    closeAgent,
    toggleAgent,
  };

  // Plan 065 Phase 3: Listen for overlay:close-all (mutual exclusion)
  useEffect(() => {
    const handler = () => {
      if (isOpeningRef.current) return;
      closeAgent();
    };
    window.addEventListener('overlay:close-all', handler);
    return () => window.removeEventListener('overlay:close-all', handler);
  }, [closeAgent]);

  return <AgentOverlayContext.Provider value={value}>{children}</AgentOverlayContext.Provider>;
}

/**
 * Access the agent overlay from any component inside AgentOverlayProvider.
 * Throws if used outside provider (fail-fast for wiring errors).
 */
export function useAgentOverlay(): AgentOverlayState {
  const ctx = useContext(AgentOverlayContext);
  if (!ctx) {
    throw new Error('useAgentOverlay must be used within AgentOverlayProvider');
  }
  return ctx;
}
