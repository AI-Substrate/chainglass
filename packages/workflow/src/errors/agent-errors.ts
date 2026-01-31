/**
 * Error codes and factory for agent session operations.
 *
 * Per Plan 018: Agent Workspace Data Model Migration
 * Per Discovery 07: E090-E093 allocated for Agent domain errors.
 *
 * Error code allocation:
 * - E030-E039: WorkflowRegistryService (checkpoint, restore, versions)
 * - E040-E049: InitService (init, directory creation)
 * - E050-E059: Run operations
 * - E060-E069: Reserved
 * - E070-E073: PhaseService (handover operations)
 * - E074-E081: Workspace operations
 * - E082-E089: Sample operations
 * - E090-E099: Agent operations (this file, E090-E093)
 */

import type { AgentSessionErrorCode } from '../interfaces/agent-session-adapter.interface.js';

/**
 * Error codes for agent session operations (E090-E093).
 */
export const AgentSessionErrorCodes = {
  /** Agent session not found in storage */
  SESSION_NOT_FOUND: 'E090' as AgentSessionErrorCode,
  /** Agent session with ID already exists */
  SESSION_EXISTS: 'E091' as AgentSessionErrorCode,
  /** Invalid agent session data (corrupt JSON, missing fields) */
  INVALID_DATA: 'E092' as AgentSessionErrorCode,
  /** Agent event not found (reserved for Phase 2) */
  EVENT_NOT_FOUND: 'E093' as AgentSessionErrorCode,
} as const;

/**
 * Agent session error structure with actionable guidance.
 *
 * Following SampleError pattern from sample-errors.ts.
 */
export interface AgentSessionError {
  /** Error code (E090-E093) */
  code: AgentSessionErrorCode;
  /** Human-readable error message */
  message: string;
  /** Suggested action for the user */
  action: string;
  /** Related path (session file path or storage directory) */
  path: string;
}

/**
 * Error thrown when an agent session is not found in storage.
 *
 * @example
 * ```typescript
 * throw new AgentSessionNotFoundError('session-abc', '/path/to/agents');
 * ```
 */
export class AgentSessionNotFoundError extends Error {
  readonly code = AgentSessionErrorCodes.SESSION_NOT_FOUND;

  constructor(
    readonly sessionId: string,
    readonly storagePath: string
  ) {
    super(`Agent session '${sessionId}' not found`);
    this.name = 'AgentSessionNotFoundError';
    Object.setPrototypeOf(this, AgentSessionNotFoundError.prototype);
  }

  get action(): string {
    return 'Check that the session ID is correct, or create a new session';
  }

  toAgentSessionError(): AgentSessionError {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      path: this.storagePath,
    };
  }
}

/**
 * Error thrown when an agent session with the same ID already exists.
 *
 * @example
 * ```typescript
 * throw new AgentSessionExistsError('session-abc', '/path/to/agents');
 * ```
 */
export class AgentSessionExistsError extends Error {
  readonly code = AgentSessionErrorCodes.SESSION_EXISTS;

  constructor(
    readonly sessionId: string,
    readonly storagePath: string
  ) {
    super(`Agent session '${sessionId}' already exists`);
    this.name = 'AgentSessionExistsError';
    Object.setPrototypeOf(this, AgentSessionExistsError.prototype);
  }

  get action(): string {
    return 'Delete the existing session or use a different ID';
  }

  toAgentSessionError(): AgentSessionError {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      path: this.storagePath,
    };
  }
}

/**
 * Error thrown when agent session data is invalid or corrupt.
 *
 * @example
 * ```typescript
 * throw new InvalidAgentSessionDataError('/path/to/session.json', 'Missing required field: type');
 * ```
 */
export class InvalidAgentSessionDataError extends Error {
  readonly code = AgentSessionErrorCodes.INVALID_DATA;
  readonly action = 'Delete the corrupt file and recreate the session';

  constructor(
    readonly path: string,
    readonly reason: string
  ) {
    super(`Invalid agent session data at '${path}': ${reason}`);
    this.name = 'InvalidAgentSessionDataError';
    Object.setPrototypeOf(this, InvalidAgentSessionDataError.prototype);
  }

  toAgentSessionError(): AgentSessionError {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      path: this.path,
    };
  }
}

/**
 * Error thrown when an agent event is not found (reserved for Phase 2).
 *
 * @example
 * ```typescript
 * throw new AgentEventNotFoundError('evt-123', 'session-abc', '/path/to/events');
 * ```
 */
export class AgentEventNotFoundError extends Error {
  readonly code = AgentSessionErrorCodes.EVENT_NOT_FOUND;

  constructor(
    readonly eventId: string,
    readonly sessionId: string,
    readonly storagePath: string
  ) {
    super(`Agent event '${eventId}' not found in session '${sessionId}'`);
    this.name = 'AgentEventNotFoundError';
    Object.setPrototypeOf(this, AgentEventNotFoundError.prototype);
  }

  get action(): string {
    return 'Check that the event ID is correct';
  }

  toAgentSessionError(): AgentSessionError {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      path: this.storagePath,
    };
  }
}

/**
 * Factory functions for creating agent session errors.
 *
 * Following SampleErrors pattern for consistency.
 */
export const AgentSessionErrors = {
  /**
   * Create a "session not found" error.
   */
  notFound: (sessionId: string, storagePath: string): AgentSessionError => ({
    code: AgentSessionErrorCodes.SESSION_NOT_FOUND,
    message: `Agent session '${sessionId}' not found`,
    action: 'Check that the session ID is correct, or create a new session',
    path: storagePath,
  }),

  /**
   * Create a "session already exists" error.
   */
  exists: (sessionId: string, storagePath: string): AgentSessionError => ({
    code: AgentSessionErrorCodes.SESSION_EXISTS,
    message: `Agent session '${sessionId}' already exists`,
    action: 'Delete the existing session or use a different ID',
    path: storagePath,
  }),

  /**
   * Create an "invalid session data" error.
   */
  invalidData: (path: string, reason: string): AgentSessionError => ({
    code: AgentSessionErrorCodes.INVALID_DATA,
    message: `Invalid agent session data at '${path}': ${reason}`,
    action: 'Delete the corrupt file and recreate the session',
    path,
  }),

  /**
   * Create an "event not found" error.
   */
  eventNotFound: (eventId: string, sessionId: string, storagePath: string): AgentSessionError => ({
    code: AgentSessionErrorCodes.EVENT_NOT_FOUND,
    message: `Agent event '${eventId}' not found in session '${sessionId}'`,
    action: 'Check that the event ID is correct',
    path: storagePath,
  }),
};
