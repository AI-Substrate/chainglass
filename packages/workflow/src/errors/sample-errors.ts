/**
 * Error codes and factory for sample operations.
 *
 * Per Plan 014: Workspaces - Phase 3: Sample Domain (Exemplar)
 * Per DYK-P3-03: E082-E089 allocated for Sample domain errors.
 *
 * Error code allocation:
 * - E030-E039: WorkflowRegistryService (checkpoint, restore, versions)
 * - E040-E049: InitService (init, directory creation)
 * - E050-E059: Run operations
 * - E060-E069: Reserved
 * - E070-E073: PhaseService (handover operations)
 * - E074-E081: Workspace operations
 * - E082-E089: Sample operations (this file)
 */

import type { SampleErrorCode } from '../interfaces/sample-adapter.interface.js';

/**
 * Error codes for sample operations (E082-E089).
 */
export const SampleErrorCodes = {
  /** Sample not found in storage */
  SAMPLE_NOT_FOUND: 'E082' as SampleErrorCode,
  /** Sample with slug already exists */
  SAMPLE_EXISTS: 'E083' as SampleErrorCode,
  /** Invalid sample data (corrupt JSON, missing fields) */
  INVALID_DATA: 'E084' as SampleErrorCode,
  /** Reserved for future use */
  RESERVED_085: 'E085' as SampleErrorCode,
  /** Reserved for future use */
  RESERVED_086: 'E086' as SampleErrorCode,
  /** Reserved for future use */
  RESERVED_087: 'E087' as SampleErrorCode,
  /** Reserved for future use */
  RESERVED_088: 'E088' as SampleErrorCode,
  /** Reserved for future use */
  RESERVED_089: 'E089' as SampleErrorCode,
} as const;

/**
 * Sample error structure with actionable guidance.
 *
 * Following WorkspaceError pattern from workspace-errors.ts.
 */
export interface SampleError {
  /** Error code (E082-E089) */
  code: SampleErrorCode;
  /** Human-readable error message */
  message: string;
  /** Suggested action for the user */
  action: string;
  /** Related path (sample file path or storage directory) */
  path: string;
}

/**
 * Error thrown when a sample is not found in storage.
 *
 * @example
 * ```typescript
 * throw new SampleNotFoundError('my-sample', '/path/to/samples');
 * ```
 */
export class SampleNotFoundError extends Error {
  readonly code = SampleErrorCodes.SAMPLE_NOT_FOUND;

  constructor(
    readonly slug: string,
    readonly storagePath: string
  ) {
    super(`Sample '${slug}' not found`);
    this.name = 'SampleNotFoundError';
    Object.setPrototypeOf(this, SampleNotFoundError.prototype);
  }

  get action(): string {
    return 'Run: cg sample list';
  }

  toSampleError(): SampleError {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      path: this.storagePath,
    };
  }
}

/**
 * Error thrown when a sample with the same slug already exists.
 *
 * @example
 * ```typescript
 * throw new SampleExistsError('my-sample', '/path/to/samples');
 * ```
 */
export class SampleExistsError extends Error {
  readonly code = SampleErrorCodes.SAMPLE_EXISTS;

  constructor(
    readonly slug: string,
    readonly storagePath: string
  ) {
    super(`Sample '${slug}' already exists`);
    this.name = 'SampleExistsError';
    Object.setPrototypeOf(this, SampleExistsError.prototype);
  }

  get action(): string {
    return `Delete existing: cg sample delete ${this.slug}`;
  }

  toSampleError(): SampleError {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      path: this.storagePath,
    };
  }
}

/**
 * Error thrown when sample data is invalid or corrupt.
 *
 * @example
 * ```typescript
 * throw new InvalidSampleDataError('/path/to/sample.json', 'Missing required field: name');
 * ```
 */
export class InvalidSampleDataError extends Error {
  readonly code = SampleErrorCodes.INVALID_DATA;
  readonly action = 'Delete the corrupt file and recreate the sample';

  constructor(
    readonly path: string,
    readonly reason: string
  ) {
    super(`Invalid sample data at '${path}': ${reason}`);
    this.name = 'InvalidSampleDataError';
    Object.setPrototypeOf(this, InvalidSampleDataError.prototype);
  }

  toSampleError(): SampleError {
    return {
      code: this.code,
      message: this.message,
      action: this.action,
      path: this.path,
    };
  }
}

/**
 * Factory functions for creating sample errors.
 *
 * Following WorkspaceErrors pattern for consistency.
 */
export const SampleErrors = {
  /**
   * Create a "sample not found" error.
   */
  notFound: (slug: string, storagePath: string): SampleError => ({
    code: SampleErrorCodes.SAMPLE_NOT_FOUND,
    message: `Sample '${slug}' not found`,
    action: 'Run: cg sample list',
    path: storagePath,
  }),

  /**
   * Create a "sample already exists" error.
   */
  exists: (slug: string, storagePath: string): SampleError => ({
    code: SampleErrorCodes.SAMPLE_EXISTS,
    message: `Sample '${slug}' already exists`,
    action: `Delete existing: cg sample delete ${slug}`,
    path: storagePath,
  }),

  /**
   * Create an "invalid sample data" error.
   */
  invalidData: (path: string, reason: string): SampleError => ({
    code: SampleErrorCodes.INVALID_DATA,
    message: `Invalid sample data at '${path}': ${reason}`,
    action: 'Delete the corrupt file and recreate the sample',
    path,
  }),
};
