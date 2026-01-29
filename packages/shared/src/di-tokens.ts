/**
 * Dependency Injection tokens for workflow services.
 *
 * Per Critical Discovery 05: Use token constants for type-safe DI resolution.
 * Each interface has a corresponding token string.
 */

/**
 * DI tokens for @chainglass/shared interfaces.
 * Used by createWorkflowContainer() to register adapters and fakes.
 */
export const SHARED_DI_TOKENS = {
  /** ILogger interface */
  LOGGER: 'ILogger',
  /** IConfigService interface */
  CONFIG: 'IConfigService',
  /** IFileSystem interface */
  FILESYSTEM: 'IFileSystem',
  /** IPathResolver interface */
  PATH_RESOLVER: 'IPathResolver',
  /** IOutputAdapter interface (per Phase 1a) */
  OUTPUT_ADAPTER: 'IOutputAdapter',
  /** IEventStorage interface (Plan 015: Phase 1) */
  EVENT_STORAGE: 'IEventStorage',
  /** IProcessManager interface (for git operations) */
  PROCESS_MANAGER: 'IProcessManager',
  /** IAgentManagerService interface (Plan 019: Agent Manager Refactor) */
  AGENT_MANAGER_SERVICE: 'IAgentManagerService',
  /** IAgentNotifierService interface (Plan 019: Phase 2) */
  AGENT_NOTIFIER_SERVICE: 'IAgentNotifierService',
  /** IAgentStorageAdapter interface (Plan 019: Phase 3) */
  AGENT_STORAGE_ADAPTER: 'IAgentStorageAdapter',
} as const;

/**
 * DI tokens for @chainglass/workflow interfaces.
 * Used by createWorkflowContainer() to register adapters and fakes.
 */
export const WORKFLOW_DI_TOKENS = {
  /** IYamlParser interface */
  YAML_PARSER: 'IYamlParser',
  /** ISchemaValidator interface */
  SCHEMA_VALIDATOR: 'ISchemaValidator',
  /** IWorkflowService interface (per Phase 2) */
  WORKFLOW_SERVICE: 'IWorkflowService',
  /** IPhaseService interface (per Phase 3) */
  PHASE_SERVICE: 'IPhaseService',
  /** IWorkflowRegistry interface (per Phase 1: Manage Workflows) */
  WORKFLOW_REGISTRY: 'IWorkflowRegistry',
  /** IHashGenerator interface (per Phase 2: Checkpoint System) */
  HASH_GENERATOR: 'IHashGenerator',
  /** IInitService interface (per Phase 4: Init Command) */
  INIT_SERVICE: 'IInitService',
  /** IWorkflowAdapter interface (per Plan 010: Entity Upgrade) */
  WORKFLOW_ADAPTER: 'IWorkflowAdapter',
  /** IPhaseAdapter interface (per Plan 010: Entity Upgrade) */
  PHASE_ADAPTER: 'IPhaseAdapter',
} as const;

/**
 * DI tokens for workspace-related interfaces.
 *
 * Per Plan 014: Workspaces - Phase 4: Service Layer + DI Integration
 * Per DYK-P4-02: Separate from WORKFLOW_DI_TOKENS as workflow will be deprecated.
 * Per ADR-0004 IMP-006: Token naming convention uses interface name as value.
 */
export const WORKSPACE_DI_TOKENS = {
  /** IWorkspaceRegistryAdapter interface */
  WORKSPACE_REGISTRY_ADAPTER: 'IWorkspaceRegistryAdapter',
  /** IWorkspaceContextResolver interface */
  WORKSPACE_CONTEXT_RESOLVER: 'IWorkspaceContextResolver',
  /** IGitWorktreeResolver interface */
  GIT_WORKTREE_RESOLVER: 'IGitWorktreeResolver',
  /** ISampleAdapter interface */
  SAMPLE_ADAPTER: 'ISampleAdapter',
  /** IWorkspaceService interface */
  WORKSPACE_SERVICE: 'IWorkspaceService',
  /** ISampleService interface */
  SAMPLE_SERVICE: 'ISampleService',
  /** IAgentSessionAdapter interface (Plan 018) */
  AGENT_SESSION_ADAPTER: 'IAgentSessionAdapter',
  /** IAgentSessionService interface (Plan 018) */
  AGENT_SESSION_SERVICE: 'IAgentSessionService',
  /** IAgentEventAdapter interface (Plan 018 Phase 2) */
  AGENT_EVENT_ADAPTER: 'IAgentEventAdapter',
} as const;
