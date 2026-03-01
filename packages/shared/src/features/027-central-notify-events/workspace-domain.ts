/**
 * Plan 027: Central Domain Event Notification System
 *
 * Named workspace data domains — a first-class concept with enumerated identity.
 * Each domain maps to an SSE channel name and a filesystem watcher adapter.
 *
 * Per DYK-03: The values of this const object ARE the SSE channel names.
 * Any mismatch causes silent failure (events go to wrong channel).
 *
 * This is the canonical single source of truth for domain/channel identity.
 */
export const WorkspaceDomain = {
  /** @deprecated Workgraph UI removed in Plan 050 Phase 7. Kept for backward compatibility. */
  Workgraphs: 'workgraphs',
  /** SSE channel: `'agents'` — matches `/api/events/agents` subscription path */
  Agents: 'agents',
  /** SSE channel: `'file-changes'` — matches `/api/events/file-changes` subscription path */
  FileChanges: 'file-changes',
  /** SSE channel: `'workflows'` — matches `/api/events/workflows` subscription path (Plan 050) */
  Workflows: 'workflows',
  /** SSE channel: `'unit-catalog'` — matches `/api/events/unit-catalog` subscription path (Plan 058) */
  UnitCatalog: 'unit-catalog',
} as const;

/**
 * Union type of all workspace domain values.
 * Use this to type parameters that accept any domain.
 */
export type WorkspaceDomainType = (typeof WorkspaceDomain)[keyof typeof WorkspaceDomain];
