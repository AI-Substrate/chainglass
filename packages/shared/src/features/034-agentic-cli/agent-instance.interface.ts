/**
 * Plan 034: Agentic CLI — IAgentInstance Interface
 *
 * Domain-agnostic agent session wrapper. Owns identity, status, session,
 * and metadata. Passes adapter events through to registered handlers.
 * Does NOT store events, broadcast via SSE, or depend on storage/notifier.
 *
 * @see Workshop 02: Unified AgentInstance / AgentManagerService Design
 */

import type { AgentResult } from '../../interfaces/agent-types.js';
import type {
  AgentCompactOptions,
  AgentEventHandler,
  AgentInstanceStatus,
  AgentRunOptions,
  AgentType,
} from './types.js';

export interface IAgentInstance {
  // ── Identity (immutable after creation) ──────────────
  readonly id: string;
  readonly name: string;
  readonly type: AgentType;
  readonly workspace: string;

  // ── State ────────────────────────────────────────────
  /** Three-state status: 'working' | 'stopped' | 'error'. */
  readonly status: AgentInstanceStatus;

  /** Convenience getter: `true` iff `status === 'working'`. */
  readonly isRunning: boolean;

  /**
   * Session ID from the adapter. `null` before first run.
   * Updated after each `run()` or `compact()` from the adapter result.
   */
  readonly sessionId: string | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;

  // ── Property Bag (freeform, no typed keys) ───────────
  /**
   * Freeform metadata. Consumers set whatever they need — the instance
   * does not interpret, validate, or react to metadata values.
   */
  readonly metadata: Readonly<Record<string, unknown>>;

  /** Update a single metadata key. Preserves existing keys. */
  setMetadata(key: string, value: unknown): void;

  // ── Event Pass-Through ───────────────────────────────
  /**
   * Register a handler that receives all adapter events during `run()`
   * and `compact()`. Multiple handlers receive the same event objects.
   */
  addEventHandler(handler: AgentEventHandler): void;

  /** Remove a previously registered handler. No-op if not registered. */
  removeEventHandler(handler: AgentEventHandler): void;

  // ── Actions ──────────────────────────────────────────
  /**
   * Run a prompt. Transitions `stopped → working → stopped|error`.
   * Updates `sessionId` from the adapter result.
   *
   * @throws If called while `status === 'working'` (double-run guard).
   */
  run(options: AgentRunOptions): Promise<AgentResult>;

  /**
   * Compact the current session context. Transitions `stopped → working → stopped|error`.
   * Delegates to `adapter.compact(sessionId)`.
   *
   * @throws If `sessionId` is null (no session to compact).
   * @throws If called while `status === 'working'` (double-invocation guard).
   */
  compact(options?: AgentCompactOptions): Promise<AgentResult>;

  /**
   * Terminate the agent session.
   *
   * Always transitions to `stopped` regardless of adapter outcome — adapters
   * guarantee terminate never throws (returns status `'killed'`, exit 137/143).
   */
  terminate(): Promise<AgentResult>;
}
