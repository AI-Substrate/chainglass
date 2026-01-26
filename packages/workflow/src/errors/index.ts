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
