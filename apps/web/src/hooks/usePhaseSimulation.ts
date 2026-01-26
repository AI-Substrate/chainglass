'use client';

/**
 * usePhaseSimulation - Timer-based phase progression simulation
 *
 * Simulates workflow execution with automatic phase transitions
 * for demo and testing purposes. Phases progress through states:
 * pending → ready → active → complete (or blocked for orchestrator phases).
 *
 * @see Plan 011: UI Mockups (T022)
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { PhaseJSON, PhaseRunStatus } from '@/data/fixtures/workflows.fixture';

export interface PhaseSimulationOptions {
  /** Time in ms for each phase to remain active before completing */
  phaseDuration?: number;
  /** Time in ms between state checks */
  tickInterval?: number;
  /** Whether to auto-start simulation */
  autoStart?: boolean;
  /** Callback when a phase status changes */
  onPhaseChange?: (phaseName: string, newStatus: PhaseRunStatus) => void;
}

export interface PhaseSimulationState {
  /** Current phase states (mutable copy) */
  phases: PhaseJSON[];
  /** Whether simulation is running */
  isRunning: boolean;
  /** Start the simulation */
  start: () => void;
  /** Pause the simulation */
  pause: () => void;
  /** Reset phases to initial state */
  reset: () => void;
  /** Answer a question to unblock a phase */
  answerQuestion: (phaseName: string, answer: string | string[] | boolean) => void;
}

const DEFAULT_PHASE_DURATION = 3000; // 3 seconds per phase
const DEFAULT_TICK_INTERVAL = 500; // Check every 500ms

/**
 * Hook for simulating phase progression in workflow runs.
 *
 * @example
 * const { phases, isRunning, start, pause, reset, answerQuestion } = usePhaseSimulation(
 *   workflow.phases,
 *   {
 *     phaseDuration: 2000,
 *     autoStart: true,
 *     onPhaseChange: (name, status) => console.log(`${name}: ${status}`)
 *   }
 * );
 */
export function usePhaseSimulation(
  initialPhases: PhaseJSON[],
  options: PhaseSimulationOptions = {}
): PhaseSimulationState {
  const {
    phaseDuration = DEFAULT_PHASE_DURATION,
    tickInterval = DEFAULT_TICK_INTERVAL,
    autoStart = false,
    onPhaseChange,
  } = options;

  // Deep copy phases to make them mutable
  const [phases, setPhases] = useState<PhaseJSON[]>(() => initialPhases.map((p) => ({ ...p })));
  const [isRunning, setIsRunning] = useState(autoStart);

  // Track phase start times for duration calculation
  const phaseStartTimes = useRef<Record<string, number>>({});

  // Update phase status helper
  const updatePhaseStatus = useCallback(
    (phaseName: string, newStatus: PhaseRunStatus) => {
      setPhases((current) =>
        current.map((phase) => {
          if (phase.name !== phaseName) return phase;

          return {
            ...phase,
            status: newStatus,
            isPending: newStatus === 'pending',
            isReady: newStatus === 'ready',
            isActive: newStatus === 'active',
            isBlocked: newStatus === 'blocked',
            isAccepted: newStatus === 'accepted',
            isComplete: newStatus === 'complete',
            isFailed: newStatus === 'failed',
            isDone: newStatus === 'complete' || newStatus === 'failed',
          };
        })
      );

      onPhaseChange?.(phaseName, newStatus);
    },
    [onPhaseChange]
  );

  // Simulation tick - progress phases
  useEffect(() => {
    if (!isRunning) return;

    const intervalId = setInterval(() => {
      setPhases((current) => {
        const now = Date.now();
        const newPhases = [...current];
        let changed = false;

        for (let i = 0; i < newPhases.length; i++) {
          const phase = newPhases[i];

          // Pending → Ready (if previous phase is complete or first phase)
          if (phase.status === 'pending') {
            const prevPhase = i > 0 ? newPhases[i - 1] : null;
            if (!prevPhase || prevPhase.status === 'complete' || prevPhase.status === 'accepted') {
              newPhases[i] = { ...phase, status: 'ready', isReady: true, isPending: false };
              onPhaseChange?.(phase.name, 'ready');
              changed = true;
            }
          }

          // Ready → Active (immediate transition)
          if (phase.status === 'ready') {
            phaseStartTimes.current[phase.name] = now;
            newPhases[i] = { ...phase, status: 'active', isActive: true, isReady: false };
            onPhaseChange?.(phase.name, 'active');
            changed = true;
          }

          // Active → Complete or Blocked (after duration)
          if (phase.status === 'active') {
            const startTime = phaseStartTimes.current[phase.name] ?? now;
            if (now - startTime >= phaseDuration) {
              // Orchestrator phases with questions become blocked
              if (phase.facilitator === 'orchestrator' && phase.question) {
                newPhases[i] = { ...phase, status: 'blocked', isBlocked: true, isActive: false };
                onPhaseChange?.(phase.name, 'blocked');
              } else {
                newPhases[i] = {
                  ...phase,
                  status: 'complete',
                  isComplete: true,
                  isActive: false,
                  isDone: true,
                };
                onPhaseChange?.(phase.name, 'complete');
              }
              changed = true;
            }
          }
        }

        return changed ? newPhases : current;
      });
    }, tickInterval);

    return () => clearInterval(intervalId);
  }, [isRunning, phaseDuration, tickInterval, onPhaseChange]);

  // Control functions
  const start = useCallback(() => setIsRunning(true), []);
  const pause = useCallback(() => setIsRunning(false), []);

  const reset = useCallback(() => {
    setIsRunning(false);
    phaseStartTimes.current = {};
    setPhases(initialPhases.map((p) => ({ ...p })));
  }, [initialPhases]);

  const answerQuestion = useCallback(
    (phaseName: string, _answer: string | string[] | boolean) => {
      // Find the blocked phase and transition to accepted
      setPhases((current) =>
        current.map((phase) => {
          if (phase.name !== phaseName || phase.status !== 'blocked') return phase;

          // Transition to accepted, then will auto-complete
          setTimeout(() => updatePhaseStatus(phaseName, 'complete'), 500);

          return {
            ...phase,
            status: 'accepted' as PhaseRunStatus,
            isAccepted: true,
            isBlocked: false,
          };
        })
      );

      onPhaseChange?.(phaseName, 'accepted');
    },
    [onPhaseChange, updatePhaseStatus]
  );

  return {
    phases,
    isRunning,
    start,
    pause,
    reset,
    answerQuestion,
  };
}
