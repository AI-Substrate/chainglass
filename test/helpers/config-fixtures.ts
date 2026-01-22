import { FakeConfigService, type SampleConfig, SampleConfigType } from '@chainglass/shared';

/**
 * Default SampleConfig values for tests.
 * Use as baseline and override specific fields as needed.
 */
export const DEFAULT_SAMPLE_CONFIG: SampleConfig = {
  enabled: true,
  timeout: 30,
  name: 'test-default',
};

/**
 * Creates a pre-configured FakeConfigService with sensible defaults.
 *
 * This is the recommended way to create config service instances in tests:
 * - Provides reasonable defaults for all config fields
 * - Accepts overrides for test-specific values
 * - Returns properly typed FakeConfigService
 *
 * Usage:
 * ```typescript
 * // Use defaults
 * const config = createTestConfigService();
 *
 * // Override specific fields
 * const config = createTestConfigService({ sample: { timeout: 120 } });
 *
 * // Override multiple fields
 * const config = createTestConfigService({
 *   sample: { enabled: false, timeout: 60, name: 'custom' }
 * });
 * ```
 *
 * @param overrides Partial config to merge with defaults
 * @returns FakeConfigService pre-populated with merged config
 */
export function createTestConfigService(
  overrides: Partial<{ sample: Partial<SampleConfig> }> = {}
): FakeConfigService {
  const sampleConfig: SampleConfig = {
    ...DEFAULT_SAMPLE_CONFIG,
    ...overrides.sample,
  };

  return new FakeConfigService({ sample: sampleConfig });
}

/**
 * Creates a FakeConfigService without any pre-populated configs.
 * Use when testing behavior with missing configurations.
 *
 * Usage:
 * ```typescript
 * const emptyConfig = createEmptyConfigService();
 * expect(() => emptyConfig.require(SampleConfigType)).toThrow();
 * ```
 */
export function createEmptyConfigService(): FakeConfigService {
  return new FakeConfigService();
}

/**
 * Creates a FakeConfigService with sample config disabled.
 * Convenience helper for testing disabled state.
 */
export function createDisabledConfigService(): FakeConfigService {
  return createTestConfigService({ sample: { enabled: false } });
}
