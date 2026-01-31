// Workflow services barrel export

export { WorkflowService, ComposeErrorCodes } from './workflow.service.js';
export { PhaseService, PhaseErrorCodes } from './phase.service.js';
export { MessageService } from './message.service.js';
export {
  WorkflowRegistryService,
  WorkflowRegistryErrorCodes,
} from './workflow-registry.service.js';
export { InitService } from './init.service.js';

// Extended result types for PhaseService with Phase entity (Phase 6)
export type {
  AcceptResultWithEntity,
  FinalizeResultWithEntity,
  HandoverResultWithEntity,
  PreflightResultWithEntity,
  PrepareResultWithEntity,
  ValidateResultWithEntity,
} from './phase-service.types.js';

// Extended result types for WorkflowService with Workflow entity (Phase 6)
export type { ComposeResultWithEntity } from './workflow-service.types.js';

// Workspace services (Plan 014 Phase 4)
export { WorkspaceService } from './workspace.service.js';
export { SampleService } from './sample.service.js';

// Agent session service (Plan 018)
export { AgentSessionService } from './agent-session.service.js';

// Workspace change notifier service (Plan 022 Phase 4 Subtask 001)
export { WorkspaceChangeNotifierService } from './workspace-change-notifier.service.js';
