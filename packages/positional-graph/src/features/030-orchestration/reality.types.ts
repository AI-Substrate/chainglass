/**
 * PositionalGraphReality — Immutable snapshot of entire graph state.
 *
 * Types defined per Workshop #1, with DYK-I2/I3/I5 decisions applied.
 *
 * @packageDocumentation
 */

import type { InputPack } from '../../interfaces/positional-graph-service.interface.js';

// ============================================
// ExecutionStatus
// ============================================

export type ExecutionStatus =
  | 'pending'
  | 'ready'
  | 'starting'
  | 'agent-accepted'
  | 'waiting-question'
  | 'blocked-error'
  | 'restart-pending'
  | 'complete';

// ============================================
// ReadinessDetail
// ============================================

export interface ReadinessDetail {
  readonly precedingLinesComplete: boolean;
  readonly transitionOpen: boolean;
  readonly serialNeighborComplete: boolean;
  readonly inputsAvailable: boolean;
  readonly unitFound: boolean;
  readonly reason?: string;
}

// ============================================
// NodeError
// ============================================

export interface NodeError {
  readonly code: string;
  readonly message: string;
  readonly occurredAt: string;
}

// ============================================
// NodeReality
// ============================================

export interface NodeReality {
  readonly nodeId: string;
  readonly lineIndex: number;
  readonly positionInLine: number;
  readonly unitSlug: string;
  readonly unitType: 'agent' | 'code' | 'user-input';
  readonly status: ExecutionStatus;
  readonly execution: 'serial' | 'parallel';
  readonly ready: boolean;
  readonly readyDetail: ReadinessDetail;
  readonly inputPack: InputPack;
  readonly pendingQuestionId?: string;
  readonly error?: NodeError;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

// ============================================
// LineReality
// ============================================

export interface LineReality {
  readonly lineId: string;
  readonly index: number;
  readonly label?: string;
  readonly transition: 'auto' | 'manual';
  readonly transitionTriggered: boolean;
  readonly isComplete: boolean;
  readonly isEmpty: boolean;
  readonly canRun: boolean;
  readonly precedingLinesComplete: boolean;
  readonly transitionOpen: boolean;
  readonly nodeIds: readonly string[];
}

// ============================================
// QuestionReality
// ============================================

/** DYK-I2: options use { key, label } format, not plain strings. */
export interface QuestionOption {
  readonly key: string;
  readonly label: string;
}

export interface QuestionReality {
  readonly questionId: string;
  readonly nodeId: string;
  readonly questionType: 'text' | 'single' | 'multi' | 'confirm';
  readonly text: string;
  readonly options?: readonly QuestionOption[];
  readonly defaultValue?: string | boolean;
  readonly askedAt: string;
  readonly surfacedAt?: string;
  readonly isSurfaced: boolean;
  readonly answer?: unknown;
  readonly answeredAt?: string;
  readonly isAnswered: boolean;
}

// ============================================
// PositionalGraphReality
// ============================================

export interface PositionalGraphReality {
  readonly graphSlug: string;
  readonly version: string;
  readonly snapshotAt: string;
  readonly graphStatus: 'pending' | 'in_progress' | 'complete' | 'failed';

  readonly lines: readonly LineReality[];
  readonly nodes: ReadonlyMap<string, NodeReality>;
  readonly questions: readonly QuestionReality[];
  readonly podSessions: ReadonlyMap<string, string>;

  // Convenience accessors
  readonly currentLineIndex: number;
  readonly readyNodeIds: readonly string[];
  readonly runningNodeIds: readonly string[];
  readonly waitingQuestionNodeIds: readonly string[];
  readonly blockedNodeIds: readonly string[];
  readonly completedNodeIds: readonly string[];
  readonly pendingQuestions: readonly QuestionReality[];
  readonly isComplete: boolean;
  readonly isFailed: boolean;
  readonly totalNodes: number;
  readonly completedCount: number;
}
