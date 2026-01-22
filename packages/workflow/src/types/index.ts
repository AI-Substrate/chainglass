// Workflow types barrel export
// Types matching core JSON schemas

// wf.types.ts - Workflow definition types
export type {
  WfDefinition,
  PhaseDefinition,
  InputDeclaration,
  FileInput,
  ParameterInput,
  MessageInput,
  MessageOption,
  Output,
  OutputParameter,
} from './wf.types.js';

// wf-phase.types.ts - Phase state types
export type {
  WfPhaseState,
  StatusEntry,
  Facilitator,
  PhaseState,
  ActionType,
} from './wf-phase.types.js';

// message.types.ts - Message types
export type {
  Message,
  MessageType,
  MessageOption as MessageOptionType,
  MessageAnswer,
} from './message.types.js';

// wf-status.types.ts - Run status types
export type {
  WfStatus,
  WfStatusWorkflow,
  WfStatusRun,
  WfStatusPhase,
  RunStatus,
  PhaseRunStatus,
} from './wf-status.types.js';
