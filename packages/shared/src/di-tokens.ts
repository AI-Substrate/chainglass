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
  /** IYamlParser interface (per Phase 2: moved from workflow) */
  YAML_PARSER: 'IYamlParser',
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

/**
 * DI tokens for @chainglass/workgraph interfaces.
 * Used by createWorkgraphContainer() to register adapters and fakes.
 *
 * Per Critical Discovery 01: DI tokens live in shared package for cross-package access.
 */
/**
 * DI tokens for @chainglass/positional-graph interfaces.
 *
 * Per Plan 026: Positional Graph — Phase 2.
 * Only 2 tokens: service and adapter. YAML parser resolved via SHARED_DI_TOKENS.YAML_PARSER.
 */
export const POSITIONAL_GRAPH_DI_TOKENS = {
  /** IPositionalGraphService interface */
  POSITIONAL_GRAPH_SERVICE: 'IPositionalGraphService',
  /** IPositionalGraphAdapter interface */
  POSITIONAL_GRAPH_ADAPTER: 'IPositionalGraphAdapter',
} as const;

export const WORKGRAPH_DI_TOKENS = {
  /** IWorkUnitService interface */
  WORKUNIT_SERVICE: 'IWorkUnitService',
  /** IWorkGraphService interface */
  WORKGRAPH_SERVICE: 'IWorkGraphService',
  /** IWorkNodeService interface */
  WORKNODE_SERVICE: 'IWorkNodeService',
  /** BootstrapPromptService for node exec command */
  BOOTSTRAP_PROMPT_SERVICE: 'BootstrapPromptService',
  /** YAML parser for unit.yaml, work-graph.yaml, node.yaml */
  YAML_PARSER: 'IWorkgraphYamlParser',
  /** JSON parser for state.json, data.json */
  JSON_PARSER: 'IWorkgraphJsonParser',
  /** Schema validator for Zod schemas */
  SCHEMA_VALIDATOR: 'IWorkgraphSchemaValidator',
} as const;
