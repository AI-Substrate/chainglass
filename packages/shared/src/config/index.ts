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

// Path Resolution (Phase 2)
export { getUserConfigDir, ensureUserConfig, getProjectConfigDir } from './paths/index.js';

// Loaders (Phase 2)
export {
  loadYamlConfig,
  parseEnvVars,
  deepMerge,
  expandPlaceholders,
  validateNoUnexpandedPlaceholders,
} from './loaders/index.js';
