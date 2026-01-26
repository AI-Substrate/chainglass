import path from 'node:path';

import type { ConfigType, IConfigService } from '../interfaces/config.interface.js';
import { MissingConfigurationError } from './exceptions.js';
import { deepMerge } from './loaders/deep-merge.js';
import { parseEnvVars } from './loaders/env.parser.js';
import {
  expandPlaceholders,
  validateNoUnexpandedPlaceholders,
} from './loaders/expand-placeholders.js';
import { commitPendingSecrets, loadSecretsToPending } from './loaders/secrets.loader.js';
import { loadYamlConfig } from './loaders/yaml.loader.js';
import { validateNoLiteralSecrets } from './security/secret-detection.js';

// Config type registrations for auto-loading
import { AgentConfigSchema, AgentConfigType } from './schemas/agent.schema.js';
import { SampleConfigSchema, SampleConfigType } from './schemas/sample.schema.js';

/**
 * Registry of known config types for auto-loading during load().
 * Each entry maps a configPath to its schema and ConfigType.
 */
const CONFIG_REGISTRY = [
  { configPath: 'agent', schema: AgentConfigSchema, type: AgentConfigType },
  { configPath: 'sample', schema: SampleConfigSchema, type: SampleConfigType },
] as const;

/**
 * Options for ChainglassConfigService constructor.
 */
export interface ChainglassConfigServiceOptions {
  /** Path to user config directory (~/.config/chainglass/) or null to skip */
  userConfigDir: string | null;
  /** Path to project config directory (.chainglass/) or null to skip */
  projectConfigDir: string | null;
}

/**
 * Production configuration service implementing the seven-phase loading pipeline.
 *
 * WARNING (DYK-11): The load() method mutates process.env during Phases 1-3 (secret loading).
 * If validation fails in Phase 7, process.env has already been modified. Tests should
 * snapshot and restore process.env in beforeEach/afterEach.
 *
 * Seven-phase pipeline:
 * 1. Load user secrets.env
 * 2. Load project secrets.env
 * 3. (Reserved for CWD .env - not implemented in MVP)
 * 4. Load YAML configs (user → project)
 * 5. Parse CG_* env vars
 * 6. Deep merge all sources
 * 7. Validate (placeholders, secrets, Zod)
 */
export class ChainglassConfigService implements IConfigService {
  private readonly _options: ChainglassConfigServiceOptions;
  private readonly _registry: Map<string, unknown>;
  private _loaded: boolean;

  constructor(options: ChainglassConfigServiceOptions) {
    this._options = options;
    this._registry = new Map();
    this._loaded = false;
  }

  /**
   * Load configuration from all sources.
   *
   * Executes the seven-phase loading pipeline:
   * 1. Load user secrets.env (to pending, not process.env)
   * 2. Load project secrets.env (to pending, not process.env)
   * 3. (Reserved)
   * 4. Load YAML configs (user → project)
   * 5. Parse CG_* env vars
   * 6. Deep merge all sources
   * 7. Validate (placeholders, secrets, Zod)
   * 8. Commit pending secrets to process.env (only on success)
   *
   * FIX-006: Transactional loading - secrets are only committed to process.env
   * after all validation passes. If validation fails, process.env is unchanged.
   *
   * @throws ConfigurationError if placeholder expansion fails
   * @throws LiteralSecretError if hardcoded secrets detected
   * @throws ZodError if schema validation fails
   */
  load(): void {
    // Idempotent - if already loaded, do nothing
    if (this._loaded) {
      return;
    }

    const { userConfigDir, projectConfigDir } = this._options;

    // ====================================
    // Phases 1-3: Load secrets to PENDING map (FIX-006)
    // ====================================
    // Secrets are NOT yet committed to process.env.
    // They will only be committed after all validation passes.
    const { pending: pendingSecrets } = loadSecretsToPending({
      userConfigDir,
      projectConfigDir,
    });

    // ====================================
    // Phase 4: Load YAML configs
    // ====================================
    const userConfigPath = userConfigDir ? path.join(userConfigDir, 'config.yaml') : null;
    const projectConfigPath = projectConfigDir ? path.join(projectConfigDir, 'config.yaml') : null;

    const userConfig = userConfigPath ? loadYamlConfig(userConfigPath) : {};
    const projectConfig = projectConfigPath ? loadYamlConfig(projectConfigPath) : {};

    // ====================================
    // Phase 5: Parse CG_* env vars
    // ====================================
    // Note: This reads from current process.env plus pending secrets for placeholder expansion
    const envConfig = parseEnvVars();

    // ====================================
    // Phase 6: Deep merge all sources
    // ====================================
    // Precedence: user < project < env vars
    const mergedConfig = deepMerge(deepMerge(userConfig, projectConfig), envConfig);

    // ====================================
    // Phase 7: Validate
    // ====================================

    // 7a: Expand ${VAR} placeholders (uses process.env + pending secrets)
    // Create combined lookup for placeholder expansion
    const envWithPending = { ...process.env };
    for (const [key, value] of pendingSecrets.entries()) {
      envWithPending[key] = value;
    }
    const expandedConfig = expandPlaceholders(mergedConfig, envWithPending);

    // 7b: Validate no unexpanded placeholders remain
    validateNoUnexpandedPlaceholders(expandedConfig);

    // 7c: Validate no literal secrets
    validateNoLiteralSecrets(expandedConfig);

    // 7d: Parse and validate each known config section via Zod
    for (const { configPath, schema, type } of CONFIG_REGISTRY) {
      const rawSection = expandedConfig[configPath];

      // If section exists in merged config, validate it
      // If not, use empty object (Zod defaults will apply)
      const parsed = schema.parse(rawSection ?? {});
      this._registry.set(type.configPath, parsed);
    }

    // ====================================
    // Phase 8: Commit secrets to process.env (FIX-006)
    // ====================================
    // Only commit after ALL validation passes - transactional guarantee
    commitPendingSecrets(pendingSecrets);

    this._loaded = true;
  }

  /**
   * Check if configuration has been loaded.
   */
  isLoaded(): boolean {
    return this._loaded;
  }

  /**
   * Get config object if available.
   */
  get<T>(type: ConfigType<T>): T | undefined {
    return this._registry.get(type.configPath) as T | undefined;
  }

  /**
   * Get config object or throw if not available.
   */
  require<T>(type: ConfigType<T>): T {
    const config = this.get(type);
    if (config === undefined) {
      throw new MissingConfigurationError(type.configPath);
    }
    return config;
  }

  /**
   * Register a config object by its type.
   */
  set<T>(type: ConfigType<T>, config: T): void {
    if (config === null || config === undefined) {
      throw new TypeError(
        `Cannot set ${type.configPath} config to ${config}. Use a valid config object.`
      );
    }
    this._registry.set(type.configPath, config);
  }
}
