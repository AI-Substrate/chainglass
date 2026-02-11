/**
 * Non-schema TypeScript types for OrchestrationRequest.
 *
 * Only types that cannot be derived from Zod schemas live here (DYK-I6).
 * Schema-derived types (StartNodeRequest, etc.) are in orchestration-request.schema.ts.
 *
 * @packageDocumentation
 */

import type {
  OrchestrationRequest,
  QuestionPendingRequest,
  ResumeNodeRequest,
  StartNodeRequest,
} from './orchestration-request.schema.js';
import type { ExecutionStatus } from './reality.types.js';

// ============================================
// NodeLevelRequest — utility union
// ============================================

/**
 * Requests that target a specific node (all carry nodeId).
 * Excludes NoActionRequest which is graph-level.
 */
export type NodeLevelRequest = StartNodeRequest | ResumeNodeRequest | QuestionPendingRequest;

// ============================================
// OrchestrationError
// ============================================

/**
 * Error details returned by ODS when an action fails.
 * Per Workshop #2 lines 408-412.
 */
export interface OrchestrationError {
  readonly code: string;
  readonly message: string;
  readonly nodeId?: string;
}

// ============================================
// OrchestrationExecuteResult
// ============================================

/**
 * Result of executing an OrchestrationRequest via ODS.
 * Per Workshop #2 lines 391-413.
 *
 * Named "ExecuteResult" (not "Result") to avoid collision with
 * Phase 7's OrchestrationRunResult (the full loop outcome).
 */
export interface OrchestrationExecuteResult {
  readonly ok: boolean;
  readonly error?: OrchestrationError;
  readonly request: OrchestrationRequest;
  readonly sessionId?: string;
  readonly newStatus?: ExecutionStatus;
}
