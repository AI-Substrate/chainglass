/**
 * Configuration service interface for the Chainglass application.
 *
 * All implementations (FakeConfigService, ChainglassConfigService) implement
 * this interface to ensure consistent configuration access across production and tests.
 *
 * Pattern: Typed object registry - config.require(SampleConfigType) returns typed SampleConfig.
 */
export interface IConfigService {
  /**
   * Get config object if available.
   * @returns Config object or undefined if not registered
   */
  get<T>(type: ConfigType<T>): T | undefined;

  /**
   * Get config object or throw if not available.
   * @throws MissingConfigurationError if config type not registered
   */
  require<T>(type: ConfigType<T>): T;

  /**
   * Register a config object by its type.
   * Used by loaders and for testing.
   */
  set<T>(type: ConfigType<T>, config: T): void;

  /**
   * Check if configuration has been loaded.
   * For production service: true after load() completes.
   * For fake service: true if any configs are registered.
   *
   * Used by DI container factories to guard against unloaded config.
   */
  isLoaded(): boolean;
}

/**
 * Interface for typed config definitions.
 *
 * Each config type must define:
 * - configPath: The key used to look up this config in YAML/env vars
 * - parse: A function to validate and parse raw config data (typically Zod .parse)
 *
 * Example:
 * ```typescript
 * const SampleConfigType: ConfigType<SampleConfig> = {
 *   configPath: 'sample',
 *   parse: (raw) => SampleConfigSchema.parse(raw),
 * };
 * ```
 */
export interface ConfigType<T> {
  readonly configPath: string;
  parse(raw: unknown): T;
}
