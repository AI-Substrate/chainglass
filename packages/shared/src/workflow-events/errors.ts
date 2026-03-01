/**
 * WorkflowEventError — Preserves structured error information from the event pipeline.
 *
 * Plan 061 Phase 3 (DYK-P3-02): WorkflowEventsService throws this instead of plain Error
 * so CLI and other consumers can extract structured { code, message, action } errors
 * for JSON output formatting.
 */

import type { ResultError } from '../interfaces/results/base.types.js';

export class WorkflowEventError extends Error {
  readonly errors: readonly ResultError[];

  constructor(message: string, errors: ResultError[]) {
    super(message);
    this.name = 'WorkflowEventError';
    this.errors = errors;
  }
}
