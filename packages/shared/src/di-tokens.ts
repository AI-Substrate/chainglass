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
 * DI tokens for @chainglass/workgraph interfaces.
 * Used by createWorkgraphContainer() to register adapters and fakes.
 *
 * Per Critical Discovery 01: DI tokens live in shared package for cross-package access.
 */
export const WORKGRAPH_DI_TOKENS = {
  /** IWorkUnitService interface */
  WORKUNIT_SERVICE: 'IWorkUnitService',
  /** IWorkGraphService interface */
  WORKGRAPH_SERVICE: 'IWorkGraphService',
  /** IWorkNodeService interface */
  WORKNODE_SERVICE: 'IWorkNodeService',
  /** YAML parser for unit.yaml, work-graph.yaml, node.yaml */
  YAML_PARSER: 'IWorkgraphYamlParser',
  /** JSON parser for state.json, data.json */
  JSON_PARSER: 'IWorkgraphJsonParser',
  /** Schema validator for Zod schemas */
  SCHEMA_VALIDATOR: 'IWorkgraphSchemaValidator',
} as const;
