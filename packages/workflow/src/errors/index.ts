// Error classes barrel export

export { EntityNotFoundError } from './entity-not-found.error.js';
export type { EntityType } from './entity-not-found.error.js';

// Run error codes and classes (E050-E059 per DYK-05)
export { RunErrorCodes, CheckpointErrorCodes } from './run-errors.js';
export {
  RunNotFoundError,
  RunsDirNotFoundError,
  InvalidRunStatusError,
  RunCorruptError,
  CheckpointCorruptError,
} from './run-errors.js';

// Workspace error codes and classes (E074-E081 per Plan 014)
export { WorkspaceErrorCodes, WorkspaceErrors } from './workspace-errors.js';
export type { WorkspaceError } from './workspace-errors.js';
export {
  WorkspaceNotFoundError,
  WorkspaceExistsError,
  InvalidPathError,
  PathNotFoundError,
  RegistryCorruptError,
  GitOperationError,
  ConfigNotWritableError,
} from './workspace-errors.js';

// Sample error codes and classes (E082-E089 per Plan 014 Phase 3)
export { SampleErrorCodes, SampleErrors } from './sample-errors.js';
export type { SampleError } from './sample-errors.js';
export {
  SampleNotFoundError,
  SampleExistsError,
  InvalidSampleDataError,
} from './sample-errors.js';
