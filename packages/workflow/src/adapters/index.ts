// Workflow adapters barrel export

// Re-export from @chainglass/shared for backward compatibility (Phase 2: moved to shared)
export { YamlParserAdapter } from '@chainglass/shared';
export { SchemaValidatorAdapter } from './schema-validator.adapter.js';
export { WorkflowAdapter } from './workflow.adapter.js';
export { PhaseAdapter } from './phase.adapter.js';

// Workspace registry adapter (Plan 014)
export { WorkspaceRegistryAdapter } from './workspace-registry.adapter.js';

// Workspace data adapter base (Plan 014 Phase 3)
export { WorkspaceDataAdapterBase } from './workspace-data-adapter-base.js';
export type {
  EnsureStructureResult,
  ReadJsonResult,
  WriteJsonResult,
} from './workspace-data-adapter-base.js';

// Sample adapter (Plan 014 Phase 3)
export { SampleAdapter } from './sample.adapter.js';

// Agent session adapter (Plan 018)
export { AgentSessionAdapter } from './agent-session.adapter.js';

// Agent event adapter (Plan 018 Phase 2)
export { AgentEventAdapter } from './agent-event.adapter.js';

// Chokidar file watcher adapter (Plan 022 Phase 4 Subtask 001)
export {
  ChokidarFileWatcherAdapter,
  ChokidarFileWatcherFactory,
} from './chokidar-file-watcher.adapter.js';
