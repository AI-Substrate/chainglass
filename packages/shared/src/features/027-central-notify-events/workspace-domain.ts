/**
 * Plan 027: Central Domain Event Notification System
 *
 * Named workspace data domains — a first-class concept with enumerated identity.
 * Each domain maps to an SSE channel name and a filesystem watcher adapter.
 *
 * Per DYK-03: The values of this const object ARE the SSE channel names.
 * `WorkspaceDomain.Workgraphs` must exactly equal `'workgraphs'` — this is the
 * same string used in SSE broadcast channels and client subscription paths.
 * Any mismatch causes silent failure (events go to wrong channel).
 *
 * This is the canonical single source of truth for domain/channel identity.
 * Phase 3/4 will migrate existing hardcoded channel strings to import from here.
 */
export const WorkspaceDomain = {
  /** SSE channel: `'workgraphs'` — matches `/api/events/workgraphs` subscription path */
  Workgraphs: 'workgraphs',
  /** SSE channel: `'agents'` — matches `/api/events/agents` subscription path */
  Agents: 'agents',
  /** SSE channel: `'file-changes'` — matches `/api/events/file-changes` subscription path */
  FileChanges: 'file-changes',
  /** SSE channel: `'workflows'` — matches `/api/events/workflows` subscription path (Plan 050) */
  Workflows: 'workflows',
} as const;

/**
 * Union type of all workspace domain values.
 * Use this to type parameters that accept any domain.
 */
export type WorkspaceDomainType = (typeof WorkspaceDomain)[keyof typeof WorkspaceDomain];
