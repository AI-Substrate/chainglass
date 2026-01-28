// Workflow fakes barrel export

export { FakeYamlParser } from './fake-yaml-parser.js';
export { FakeSchemaValidator } from './fake-schema-validator.js';
export { FakeWorkflowService } from './fake-workflow-service.js';
export type { ComposeCall } from './fake-workflow-service.js';
export { FakePhaseService } from './fake-phase-service.js';
export type {
  PrepareCall,
  ValidateCall,
  FinalizeCall,
  AcceptCall,
  PreflightCall,
  HandoverCall,
} from './fake-phase-service.js';
export { FakeMessageService } from './fake-message-service.js';
export type { CreateCall, AnswerCall, ListCall, ReadCall } from './fake-message-service.js';
export { FakeWorkflowRegistry } from './fake-workflow-registry.js';
export type {
  ListCall as RegistryListCall,
  InfoCall as RegistryInfoCall,
  CheckpointCall as RegistryCheckpointCall,
  RestoreCall as RegistryRestoreCall,
  VersionsCall as RegistryVersionsCall,
} from './fake-workflow-registry.js';
export { FakeInitService } from './fake-init-service.js';
export type {
  InitCall,
  IsInitializedCall,
  GetInitializationStatusCall,
} from './fake-init-service.js';
export { FakeWorkflowAdapter } from './fake-workflow-adapter.js';
export type {
  LoadCurrentCall,
  LoadCheckpointCall,
  LoadRunCall,
  ListCheckpointsCall,
  ListRunsCall,
  ExistsCall,
} from './fake-workflow-adapter.js';
export { FakePhaseAdapter } from './fake-phase-adapter.js';
export type { LoadFromPathCall, ListForWorkflowCall } from './fake-phase-adapter.js';

// Workspace registry adapter fake (Plan 014)
export { FakeWorkspaceRegistryAdapter } from './fake-workspace-registry-adapter.js';
export type {
  WorkspaceLoadCall,
  WorkspaceSaveCall,
  WorkspaceListCall,
  WorkspaceRemoveCall,
  WorkspaceExistsCall,
} from './fake-workspace-registry-adapter.js';

// Workspace context resolver fake (Plan 014 Phase 2)
export { FakeWorkspaceContextResolver } from './fake-workspace-context-resolver.js';
export type {
  ResolveFromPathCall,
  GetWorkspaceInfoCall,
} from './fake-workspace-context-resolver.js';

// Sample adapter fake (Plan 014 Phase 3)
export { FakeSampleAdapter } from './fake-sample-adapter.js';
export type {
  SampleLoadCall,
  SampleSaveCall,
  SampleListCall,
  SampleRemoveCall,
  SampleExistsCall,
} from './fake-sample-adapter.js';

// Git worktree resolver fake (Plan 014 Phase 4)
export { FakeGitWorktreeResolver } from './fake-git-worktree-resolver.js';
export type {
  DetectWorktreesCall,
  GetMainRepoPathCall,
  IsMainWorktreeCall,
} from './fake-git-worktree-resolver.js';

// Agent session adapter fake (Plan 018)
export { FakeAgentSessionAdapter } from './fake-agent-session-adapter.js';
export type {
  AgentSessionLoadCall,
  AgentSessionSaveCall,
  AgentSessionListCall,
  AgentSessionRemoveCall,
  AgentSessionExistsCall,
} from './fake-agent-session-adapter.js';

// Agent event adapter fake (Plan 018 Phase 2)
export { FakeAgentEventAdapter } from './fake-agent-event-adapter.js';
export type {
  AgentEventAppendCall,
  AgentEventGetAllCall,
  AgentEventGetSinceCall,
  AgentEventArchiveCall,
  AgentEventExistsCall,
} from './fake-agent-event-adapter.js';
