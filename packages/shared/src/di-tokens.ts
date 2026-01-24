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
} as const;
