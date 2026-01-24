// Exceptions
export {
  ConfigurationError,
  LiteralSecretError,
  MissingConfigurationError,
} from './exceptions.js';

// Schemas
export {
  SampleConfigSchema,
  SampleConfigType,
  type SampleConfig,
} from './schemas/sample.schema.js';

export {
  WorkflowMetadataSchema,
  type WorkflowMetadata,
} from './schemas/workflow-metadata.schema.js';

// Path Resolution (Phase 2)
export { getUserConfigDir, ensureUserConfig, getProjectConfigDir } from './paths/index.js';

// Loaders (Phase 2 + Phase 3)
export {
  loadYamlConfig,
  parseEnvVars,
  deepMerge,
  expandPlaceholders,
  validateNoUnexpandedPlaceholders,
  loadSecretsToEnv,
  type LoadSecretsOptions,
} from './loaders/index.js';

// Security (Phase 3)
export { detectLiteralSecret, validateNoLiteralSecrets } from './security/index.js';

// Production Config Service (Phase 3)
export {
  ChainglassConfigService,
  type ChainglassConfigServiceOptions,
} from './chainglass-config.service.js';
