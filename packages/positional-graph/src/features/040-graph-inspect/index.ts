/**
 * Plan 040: Graph Inspect CLI — Barrel exports.
 * @packageDocumentation
 */

export type {
  InspectResult,
  InspectNodeResult,
  InspectNodeInput,
  InspectNodeQuestion,
  InspectNodeError,
} from './inspect.types.js';

export { isFileOutput } from './inspect.types.js';

export { buildInspectResult } from './inspect.js';
