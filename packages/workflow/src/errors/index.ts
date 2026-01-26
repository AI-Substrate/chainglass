// Error classes barrel export

export { EntityNotFoundError } from './entity-not-found.error.js';
export type { EntityType } from './entity-not-found.error.js';

// Run error codes and classes (E050-E059 per DYK-05)
export { RunErrorCodes } from './run-errors.js';
export {
  RunNotFoundError,
  RunsDirNotFoundError,
  InvalidRunStatusError,
  RunCorruptError,
} from './run-errors.js';
