/**
 * Plan 053: GlobalStateSystem — Value Types
 *
 * Core types for the centralized ephemeral runtime state system.
 * Domains publish runtime values to named state paths; consumers
 * subscribe by path or pattern.
 *
 * Per Workshop 001: Colon-delimited hierarchical paths.
 * Per DYK-01: 2 and 3 segments only (5-segment nested support dropped).
 */

// ==================== Path Types ====================

/**
 * Parsed representation of a state path.
 *
 * Paths have 2 segments (singleton: `domain:property`)
 * or 3 segments (multi-instance: `domain:instanceId:property`).
 */
export interface ParsedPath {
  /** Top-level domain (e.g., 'workflow', 'worktree') */
  domain: string;
  /** Instance ID within domain, or null for singletons */
  instanceId: string | null;
  /** Property name (final segment) */
  property: string;
  /** Original full path string */
  raw: string;
}

// ==================== State Entry Types ====================

/** A stored state entry — the current value at a path. */
export interface StateEntry {
  /** Full state path (e.g., 'workflow:wf-1:status') */
  path: string;
  /** Current value */
  value: unknown;
  /** When the value was last updated (Unix ms) — used for version tracking */
  updatedAt: number;
  /** Origin metadata — undefined for legacy client publishes (Workshop 005) */
  source?: StateEntrySource;
}

/**
 * A state change notification delivered to subscribers.
 *
 * Per PL-01: Store is updated BEFORE subscribers are notified.
 */
export interface StateChange {
  /** Full state path that changed */
  path: string;
  /** Parsed domain segment */
  domain: string;
  /** Parsed instance ID, or null for singletons */
  instanceId: string | null;
  /** Parsed property segment */
  property: string;
  /** New value (undefined when removed) */
  value: unknown;
  /** Previous value (undefined if first publish) */
  previousValue: unknown | undefined;
  /** When the change was published (Unix ms) */
  timestamp: number;
  /** True when the entry is being removed */
  removed?: boolean;
  /** Origin metadata — undefined for legacy client publishes (Workshop 005) */
  source?: StateEntrySource;
}

/** Callback type for state change subscribers. */
export type StateChangeCallback = (change: StateChange) => void;

// ==================== Domain Descriptor Types ====================

/** Describes a property published by a state domain. */
export interface StatePropertyDescriptor {
  /** Property key (final segment of path) */
  key: string;
  /** Human-readable description */
  description: string;
  /** TypeScript type hint (for documentation, not runtime validation) */
  typeHint: string;
}

/**
 * Describes a state domain — its identity, whether it supports
 * multiple instances, and what properties it publishes.
 *
 * Registered at bootstrap via IStateService.registerDomain().
 */
export interface StateDomainDescriptor {
  /** Domain name (e.g., 'workflow', 'worktree') */
  domain: string;
  /** Human-readable description */
  description: string;
  /** Whether this domain supports multiple concurrent instances */
  multiInstance: boolean;
  /** Property keys this domain publishes */
  properties: StatePropertyDescriptor[];
}

// ==================== Matcher Types ====================

/** A function that tests whether a state path matches a pattern. */
export type StateMatcher = (path: string) => boolean;

// ==================== Source Metadata Types ====================

/**
 * Origin metadata for state entries. Tags whether the value was published
 * by client-side code or arrived via server-side SSE events.
 *
 * Per Workshop 005: Serves debugging (Plan 056 State DevTools) and tracing.
 * Server-originated entries carry the SSE channel and event type that produced them.
 */
export interface StateEntrySource {
  /** Whether this entry was published by client or server code */
  origin: 'client' | 'server';
  /** SSE channel that produced this entry (server-origin only) */
  channel?: string;
  /** Server event type that triggered this entry (server-origin only) */
  eventType?: string;
}
