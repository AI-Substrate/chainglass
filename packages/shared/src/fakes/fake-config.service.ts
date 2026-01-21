import { MissingConfigurationError } from '../config/exceptions.js';
import type { ConfigType, IConfigService } from '../interfaces/config.interface.js';

/**
 * FakeConfigService is a test double for IConfigService that accepts
 * pre-populated configurations via constructor and provides assertion helpers for testing.
 *
 * Design: Per DYK-01, this fake trusts the type system and does NOT validate
 * configs via ConfigType.parse(). Validation is ChainglassConfigService's job (Phase 3).
 *
 * Usage:
 * ```typescript
 * // Create with pre-populated configs
 * const fakeConfig = new FakeConfigService({
 *   sample: { enabled: true, timeout: 60, name: 'test' },
 * });
 *
 * // Use in tests
 * const service = new SampleService(logger, fakeConfig);
 * expect(service.getTimeout()).toBe(60);
 * ```
 */
export class FakeConfigService implements IConfigService {
  private readonly registry: Map<string, unknown>;

  /**
   * Create a FakeConfigService with optional pre-populated configs.
   * @param configs Record mapping configPath to config object
   */
  constructor(configs: Record<string, unknown> = {}) {
    this.registry = new Map();

    // Pre-populate registry from constructor argument
    for (const [configPath, config] of Object.entries(configs)) {
      this.registry.set(configPath, config);
    }
  }

  /**
   * Get config object if available.
   * @returns Config object or undefined if not registered
   */
  get<T>(type: ConfigType<T>): T | undefined {
    const config = this.registry.get(type.configPath);
    return config as T | undefined;
  }

  /**
   * Get config object or throw if not available.
   * @throws MissingConfigurationError if config type not registered
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
   * @throws TypeError if config is null or undefined
   */
  set<T>(type: ConfigType<T>, config: T): void {
    if (config === null || config === undefined) {
      throw new TypeError(
        `Cannot set ${type.configPath} config to ${config}. Use a valid config object.`
      );
    }
    // Per DYK-01: Trust types, do NOT call type.parse() in the fake
    this.registry.set(type.configPath, config);
  }

  // Test helper methods

  /**
   * Get all registered configs as a Map.
   * Useful for test assertions verifying which configs have been set.
   */
  getSetConfigs(): Map<string, unknown> {
    return new Map(this.registry);
  }

  /**
   * Quick existence check for a config type.
   * @returns true if config is registered, false otherwise
   */
  has<T>(type: ConfigType<T>): boolean {
    return this.registry.has(type.configPath);
  }

  /**
   * Assert that a config type is set.
   * @throws Error with descriptive message if config not set
   */
  assertConfigSet<T>(type: ConfigType<T>, message?: string): void {
    if (!this.has(type)) {
      const contextMessage = message ? ` (${message})` : '';
      throw new Error(
        `Expected config '${type.configPath}' to be set${contextMessage}. Use FakeConfigService constructor or set() to provide it.`
      );
    }
  }
}
