/**
 * Error codes and classes for `cg runs` CLI commands.
 *
 * Per DYK-05: E050-E059 range reserved for run errors.
 * E040-E049 is already used by InitService.
 *
 * Error code allocation:
 * - E030-E039: WorkflowRegistryService (checkpoint, restore, versions)
 * - E040-E049: InitService (init, directory creation)
 * - E050-E059: Run operations (this file)
 *
 * These errors are used by Phase 4 `cg runs list/get` commands
 * and by IWorkflowAdapter methods (loadRun, listRuns).
 */

/**
 * Error codes for run operations (E050-E059).
 */
export const RunErrorCodes = {
  /** Run directory not found (specified run doesn't exist) */
  RUN_NOT_FOUND: 'E050',
  /** Runs directory doesn't exist (no runs for this workflow/checkpoint) */
  RUNS_DIR_NOT_FOUND: 'E051',
  /** Invalid run status value in wf-status.json */
  INVALID_RUN_STATUS: 'E052',
  /** Run data is corrupt (missing/invalid wf-status.json, malformed data) */
  RUN_CORRUPT: 'E053',
} as const;

/**
 * Error thrown when a specific run directory is not found.
 *
 * @example
 * ```typescript
 * throw new RunNotFoundError('run-2026-01-25-001', '/path/to/runs/run-2026-01-25-001');
 * ```
 */
export class RunNotFoundError extends Error {
  readonly code = RunErrorCodes.RUN_NOT_FOUND;

  constructor(
    readonly runId: string,
    readonly path: string
  ) {
    super(`Run '${runId}' not found at ${path}`);
    this.name = 'RunNotFoundError';
    Object.setPrototypeOf(this, RunNotFoundError.prototype);
  }
}

/**
 * Error thrown when the runs directory doesn't exist.
 *
 * @example
 * ```typescript
 * throw new RunsDirNotFoundError('hello-wf', '/path/to/runs');
 * ```
 */
export class RunsDirNotFoundError extends Error {
  readonly code = RunErrorCodes.RUNS_DIR_NOT_FOUND;

  constructor(
    readonly workflowSlug: string,
    readonly path: string
  ) {
    super(`No runs directory found for workflow '${workflowSlug}' at ${path}`);
    this.name = 'RunsDirNotFoundError';
    Object.setPrototypeOf(this, RunsDirNotFoundError.prototype);
  }
}

/**
 * Error thrown when a run has an invalid status value.
 *
 * @example
 * ```typescript
 * throw new InvalidRunStatusError('run-001', 'invalid-status', ['pending', 'active', 'complete', 'failed']);
 * ```
 */
export class InvalidRunStatusError extends Error {
  readonly code = RunErrorCodes.INVALID_RUN_STATUS;

  constructor(
    readonly runId: string,
    readonly actualStatus: string,
    readonly validStatuses: readonly string[]
  ) {
    super(
      `Run '${runId}' has invalid status '${actualStatus}'. Valid statuses: ${validStatuses.join(', ')}`
    );
    this.name = 'InvalidRunStatusError';
    Object.setPrototypeOf(this, InvalidRunStatusError.prototype);
  }
}

/**
 * Error thrown when run data is corrupt or malformed.
 *
 * @example
 * ```typescript
 * throw new RunCorruptError('run-001', '/path/to/run', 'Missing wf-status.json');
 * ```
 */
export class RunCorruptError extends Error {
  readonly code = RunErrorCodes.RUN_CORRUPT;

  constructor(
    readonly runId: string,
    readonly path: string,
    readonly reason: string
  ) {
    super(`Run '${runId}' at ${path} is corrupt: ${reason}`);
    this.name = 'RunCorruptError';
    Object.setPrototypeOf(this, RunCorruptError.prototype);
  }
}
