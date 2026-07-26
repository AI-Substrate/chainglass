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
 *
 * RULE FOR REMOVING A DOMAIN: when a domain goes dead, DELETE the member — do not
 * mark it `@deprecated` and leave it. A deprecated member still typechecks, so it
 * stays emittable and the next reader cannot tell a live domain from a dead one.
 * Deleting turns every stale call site into a compile error, which is the point.
 * Applied to `Agents` (agent teardown) and to `Workgraphs`, whose UI was removed in
 * Plan 050 Phase 7 and which was kept `@deprecated` here until that inconsistency
 * was resolved in favour of deletion. There are no deprecated domains by design.
 *
 * Note there is no `Workgraphs` domain, but `packages/workgraph`, the `cg workgraph`
 * CLI command group and `<worktree>/.chainglass/data/work-graphs/` are all LIVE and
 * unrelated to this file. Only the SSE domain was removed.
 */
export const WorkspaceDomain = {
  /** SSE channel: `'file-changes'` — matches `/api/events/file-changes` subscription path */
  FileChanges: 'file-changes',
  /** SSE channel: `'workflows'` — matches `/api/events/workflows` subscription path (Plan 050) */
  Workflows: 'workflows',
  /**
   * SSE channel: `'work-unit-state'` — matches `/api/events/work-unit-state`
   * subscription path (Plan 059)
   */
  WorkUnitState: 'work-unit-state',
  /** SSE channel: `'unit-catalog'` — matches `/api/events/unit-catalog` subscription path (Plan 058) */
  UnitCatalog: 'unit-catalog',
  /** SSE channel: `'event-popper'` — matches `/api/events/event-popper` subscription path (Plan 067) */
  EventPopper: 'event-popper',
  /**
   * SSE channel: `'workflow-execution'` — matches `/api/events/workflow-execution`
   * subscription path (Plan 074)
   */
  WorkflowExecution: 'workflow-execution',
  /**
   * SSE channel: `'remote-view'` — push-only domain (no filesystem watcher); the
   * remote-view adapter + daemon manager emit `attached`/`detached`/`daemon-state`
   * imperatively (Plan 088 Phase 5, T006). Domain value IS the channel id —
   * `useChannelEvents('remote-view', …)` subscribes it (no mapping table).
   */
  RemoteView: 'remote-view',
} as const;

/**
 * Union type of all workspace domain values.
 * Use this to type parameters that accept any domain.
 */
export type WorkspaceDomainType = (typeof WorkspaceDomain)[keyof typeof WorkspaceDomain];
