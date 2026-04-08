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
  InspectNodeEvent,
  InspectNodeEventStamp,
  InspectOrchestratorSettings,
  InspectFileMetadata,
} from './inspect.types.js';

export { isFileOutput } from './inspect.types.js';

export { buildInspectResult } from './inspect.js';

export type {
  WorkflowExecutionLog,
  TimelineEntry,
  NodeLog,
  Diagnostic,
} from './execution-log.types.js';

export { buildExecutionLog } from './execution-log.js';

export {
  formatInspect,
  formatInspectNode,
  formatInspectOutputs,
  formatInspectCompact,
} from './inspect.format.js';
