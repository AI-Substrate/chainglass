/**
 * Activity Log Domain — Types
 *
 * Source-agnostic types for the per-worktree activity log.
 * Used by writers (terminal sidecar, agent manager, future sources)
 * and readers (API routes, overlay panel).
 *
 * Plan 065: Worktree Activity Log
 */

/** Filename for the per-worktree activity log (JSONL format) */
export const ACTIVITY_LOG_FILE = 'activity-log.jsonl';

/** Path within worktree: .chainglass/data/activity-log.jsonl */
export const ACTIVITY_LOG_DIR = '.chainglass/data';

/**
 * A single activity log entry — source-agnostic, append-only.
 *
 * Sources (tmux, agent, build, etc.) create entries and pass them
 * to appendActivityLogEntry(). The writer persists them as JSONL.
 */
export interface ActivityLogEntry {
  /**
   * Dedup key: identifies the "slot" this entry occupies.
   * Same id + same label = duplicate (skip).
   * Convention: `{source}:{identifier}`
   * @example "tmux:0.0", "agent:agent-1", "build:apps/web"
   */
  id: string;

  /**
   * Source type — identifies what system produced this entry.
   * Convention: lowercase, no spaces.
   * @example "tmux", "agent", "workflow", "build", "deploy"
   */
  source: string;

  /**
   * Human-readable label — what's happening right now.
   * Primary display text in the overlay panel.
   * @example "Implementing Phase 1", "Running tests"
   */
  label: string;

  /**
   * ISO-8601 timestamp — when this activity was observed.
   * Set by the source, not the writer.
   */
  timestamp: string;

  /**
   * Source-specific metadata — unstructured bag of key-value pairs.
   * The writer persists it as-is. The reader returns it as-is.
   * The overlay panel MAY display specific keys if it recognizes the source.
   * @example { pane: "0.0", session: "059-fix-agents" }
   */
  meta?: Record<string, unknown>;
}
