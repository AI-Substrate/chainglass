// @chainglass/positional-graph — barrel export

export * from './schemas/index.js';
export * from './services/index.js';
export * from './errors/index.js';
export * from './adapter/index.js';
export * from './interfaces/index.js';
export { registerPositionalGraphServices, registerOrchestrationServices } from './container.js';

// Feature exports
export * from './features/029-agentic-work-units/index.js';

// Orchestration exports (Plan 030, Phase 7)
export type {
  OrchestrationStopReason,
  OrchestrationAction,
  OrchestrationRunResult,
  IGraphOrchestration,
  IOrchestrationService,
  FakeGraphConfig,
  DriveOptions,
  DriveEvent,
  DriveEventType,
  DriveResult,
  DriveExitReason,
} from './features/030-orchestration/index.js';
export {
  OrchestrationService,
  GraphOrchestration,
  FakeOrchestrationService,
  FakeGraphOrchestration,
} from './features/030-orchestration/index.js';
export type {
  OrchestrationServiceDeps,
  GraphOrchestrationOptions,
  FakeGetCallRecord,
} from './features/030-orchestration/index.js';

// Node event system exports (Plan 032, Phase 6)
export type { EventSource } from './features/032-node-event-system/index.js';
