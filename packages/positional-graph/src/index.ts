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
  formatGraphStatus,
} from './features/030-orchestration/index.js';
export type {
  OrchestrationServiceDeps,
  GraphOrchestrationOptions,
  FakeGetCallRecord,
} from './features/030-orchestration/index.js';

// Node event system exports (Plan 032, Phase 6)
export type { EventSource } from './features/032-node-event-system/index.js';
export type { IEventHandlerService } from './features/032-node-event-system/index.js';
export {
  EventHandlerService,
  NodeEventService,
  NodeEventRegistry,
  FakeNodeEventRegistry,
  registerCoreEventTypes,
  createEventHandlerRegistry,
} from './features/032-node-event-system/index.js';

// Script runner (Plan 030, Phase 4)
export type { IScriptRunner } from './features/030-orchestration/index.js';
export { FakeScriptRunner, ScriptRunner } from './features/030-orchestration/index.js';
