/**
 * AgentSession entity - workspace-scoped agent session storage.
 *
 * Per Plan 018: Agent Workspace Data Model Migration
 * Per Plan 014 Sample Exemplar: Follows same entity pattern
 *
 * Per DYK-P3-01: Constructor injection pattern - WorkspaceContext is path data only.
 * Per DYK-P3-02: Adapter owns updatedAt - entity.create() sets both timestamps,
 *                adapter overwrites updatedAt on every save.
 * Per DYK-03: toJSON() uses camelCase keys, undefined→null, Date→ISO string.
 *
 * Entity pattern (same as Sample/Workspace):
 * - Private constructor enforces invariants
 * - Static factory method create() for new sessions
 * - Optional timestamps for loading existing sessions
 *
 * Storage location: `<worktree>/.chainglass/data/agents/<id>.json`
 */

import type { AgentSessionStatus, AgentType } from '@chainglass/shared';

/**
 * Input for creating an AgentSession.
 *
 * When creating a new session:
 * - id, type, status are required
 * - timestamps default to current time
 *
 * When loading an existing session:
 * - Adapter provides all fields including timestamps
 */
export interface AgentSessionInput {
  /** Unique session identifier (e.g., "1738123456789-abc123") */
  readonly id: string;

  /** Agent type for this session */
  readonly type: AgentType;

  /** Current session status */
  readonly status: AgentSessionStatus;

  /**
   * Optional creation timestamp for loading existing sessions.
   * If not provided, defaults to current time.
   */
  readonly createdAt?: Date;

  /**
   * Optional update timestamp for loading existing sessions.
   * If not provided, defaults to createdAt.
   * Per DYK-P3-02: Adapter overwrites this on every save.
   */
  readonly updatedAt?: Date;
}

/**
 * Serialized AgentSession for JSON output.
 *
 * Per DYK-03:
 * - camelCase property names
 * - Date → ISO-8601 string
 */
export interface AgentSessionJSON {
  /** Unique session identifier */
  id: string;

  /** Agent type for this session */
  type: AgentType;

  /** Current session status */
  status: AgentSessionStatus;

  /** When the session was created (ISO-8601 string) */
  createdAt: string;

  /** When the session was last updated (ISO-8601 string) */
  updatedAt: string;
}

/**
 * AgentSession entity - workspace-scoped agent session.
 *
 * An AgentSession is stored in per-worktree storage at:
 * `<worktree>/.chainglass/data/agents/<id>.json`
 *
 * It tracks:
 * - id: Unique identifier (used as filename)
 * - type: Agent type ('claude' or 'copilot')
 * - status: Lifecycle status ('active', 'completed', 'terminated')
 * - createdAt: When the session was created
 * - updatedAt: When the session was last modified
 *
 * Use the create() factory method to create instances (constructor is private).
 */
export class AgentSession {
  /** Unique session identifier */
  readonly id: string;

  /** Agent type for this session */
  readonly type: AgentType;

  /** Current session status */
  readonly status: AgentSessionStatus;

  /** When the session was created */
  readonly createdAt: Date;

  /** When the session was last updated */
  readonly updatedAt: Date;

  /**
   * Private constructor - use create() factory method instead.
   */
  private constructor(
    id: string,
    type: AgentType,
    status: AgentSessionStatus,
    createdAt: Date,
    updatedAt: Date
  ) {
    this.id = id;
    this.type = type;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  /**
   * Create an AgentSession entity.
   *
   * When creating a new session:
   * - Provide id, type, status
   * - timestamps default to current time
   *
   * When loading from storage:
   * - Adapter provides all fields including timestamps
   *
   * @param input - Session data
   * @returns AgentSession entity
   */
  static create(input: AgentSessionInput): AgentSession {
    // Use provided createdAt or default to now
    const createdAt = input.createdAt ?? new Date();

    // Use provided updatedAt or default to createdAt
    const updatedAt = input.updatedAt ?? createdAt;

    return new AgentSession(input.id, input.type, input.status, createdAt, updatedAt);
  }

  /**
   * Serialize to JSON for API/web consumption and storage.
   *
   * Per DYK-03:
   * - camelCase property names
   * - Date → ISO-8601 string
   */
  toJSON(): AgentSessionJSON {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
