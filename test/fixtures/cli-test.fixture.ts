import {
  FakeConfigService,
  FakeLogger,
  type SampleConfig,
  SampleConfigType,
} from '@chainglass/shared';
import { afterEach, test as base, beforeEach, describe, expect, vi } from 'vitest';

/**
 * Default SampleConfig values provided by the cliTest fixture.
 * Uses 'cli-test-fixture' as name to distinguish from web/mcp tests.
 */
export const DEFAULT_CLI_SAMPLE_CONFIG: SampleConfig = {
  enabled: true,
  timeout: 30,
  name: 'cli-test-fixture',
};

/**
 * Type definitions for cliTest fixtures.
 * Each fixture is provided fresh for each test.
 */
export interface CliTestFixtures {
  /** Fresh FakeLogger instance - use for verifying log calls */
  fakeLogger: FakeLogger;

  /** FakeConfigService pre-populated with CLI-specific defaults */
  fakeConfig: FakeConfigService;

  /** The default SampleConfig values - useful for assertions */
  defaultSampleConfig: SampleConfig;
}

/**
 * Extended Vitest test with pre-baked fakes for CLI service testing.
 *
 * Per DYK-19: Context-specific fixtures created for future-proofing.
 * Currently wraps serviceTest with CLI-specific default config name.
 *
 * This fixture provides:
 * - `fakeLogger`: Fresh FakeLogger for each test
 * - `fakeConfig`: FakeConfigService pre-populated with CLI defaults
 * - `defaultSampleConfig`: The default config values for reference
 *
 * Usage:
 * ```typescript
 * import { cliTest, describe, expect } from '@test/fixtures/cli-test.fixture';
 *
 * describe('MyCliCommand', () => {
 *   cliTest('should use config', ({ fakeLogger, fakeConfig }) => {
 *     const cmd = new MyCliCommand(fakeLogger, fakeConfig);
 *     expect(cmd.getConfigName()).toBe('cli-test-fixture');
 *   });
 * });
 * ```
 */
export const cliTest = base.extend<CliTestFixtures>({
  // Fresh FakeLogger for each test
  // biome-ignore lint/correctness/noEmptyPattern: Vitest fixture API requires destructuring
  fakeLogger: async ({}, use) => {
    await use(new FakeLogger());
  },

  // CLI-specific default config values
  // biome-ignore lint/correctness/noEmptyPattern: Vitest fixture API requires destructuring
  defaultSampleConfig: async ({}, use) => {
    await use(DEFAULT_CLI_SAMPLE_CONFIG);
  },

  // FakeConfigService pre-populated with CLI defaults
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
