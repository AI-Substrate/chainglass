import {
  FakeConfigService,
  FakeLogger,
  type SampleConfig,
  SampleConfigType,
} from '@chainglass/shared';
import { afterEach, test as base, beforeEach, describe, expect, vi } from 'vitest';

/**
 * Default SampleConfig values provided by the serviceTest fixture.
 * These are the values automatically available in tests using serviceTest.
 */
export const DEFAULT_FIXTURE_SAMPLE_CONFIG: SampleConfig = {
  enabled: true,
  timeout: 30,
  name: 'test-fixture',
};

/**
 * Type definitions for serviceTest fixtures.
 * Each fixture is provided fresh for each test.
 */
export interface ServiceTestFixtures {
  /** Fresh FakeLogger instance - use for verifying log calls */
  fakeLogger: FakeLogger;

  /** FakeConfigService pre-populated with defaultSampleConfig */
  fakeConfig: FakeConfigService;

  /** The default SampleConfig values - useful for assertions */
  defaultSampleConfig: SampleConfig;
}

/**
 * Extended Vitest test with pre-baked fakes for service testing.
 *
 * This fixture provides:
 * - `fakeLogger`: Fresh FakeLogger for each test
 * - `fakeConfig`: FakeConfigService pre-populated with sensible defaults
 * - `defaultSampleConfig`: The default config values for reference
 *
 * Usage:
 * ```typescript
 * import { serviceTest, describe, expect } from '@test/fixtures/service-test.fixture';
 *
 * describe('MyService', () => {
 *   // Fixtures are auto-injected - no setup needed!
 *   serviceTest('should use config', ({ fakeLogger, fakeConfig }) => {
 *     const service = new MyService(fakeLogger, fakeConfig);
 *     expect(service.getTimeout()).toBe(30); // from defaultSampleConfig
 *   });
 *
 *   // Override config when needed
 *   serviceTest('should handle custom timeout', ({ fakeLogger, fakeConfig }) => {
 *     fakeConfig.set(SampleConfigType, { enabled: true, timeout: 120, name: 'custom' });
 *     const service = new MyService(fakeLogger, fakeConfig);
 *     expect(service.getTimeout()).toBe(120);
 *   });
 *
 *   // Assert on logger calls
 *   serviceTest('should log on init', ({ fakeLogger, fakeConfig }) => {
 *     const service = new MyService(fakeLogger, fakeConfig);
 *     service.initialize();
 *     fakeLogger.assertLoggedAtLevel('info', 'initialized');
 *   });
 * });
 * ```
 */
export const serviceTest = base.extend<ServiceTestFixtures>({
  // Fresh FakeLogger for each test
  // biome-ignore lint/correctness/noEmptyPattern: Vitest fixture API requires destructuring
  fakeLogger: async ({}, use) => {
    await use(new FakeLogger());
  },

  // Default config values - available for assertions
  // biome-ignore lint/correctness/noEmptyPattern: Vitest fixture API requires destructuring
  defaultSampleConfig: async ({}, use) => {
    await use(DEFAULT_FIXTURE_SAMPLE_CONFIG);
  },

  // FakeConfigService pre-populated with defaults
  fakeConfig: async ({ defaultSampleConfig }, use) => {
    const config = new FakeConfigService({
      sample: defaultSampleConfig,
    });
    await use(config);
  },
});

// Re-export Vitest utilities for convenience
// Tests can import everything from this single file
export { describe, expect, beforeEach, afterEach, vi };
