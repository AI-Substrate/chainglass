import {
  FakeConfigService,
  FakeLogger,
  type SampleConfig,
  SampleConfigType,
} from '@chainglass/shared';
import { afterEach, test as base, beforeEach, describe, expect, vi } from 'vitest';

/**
 * Default SampleConfig values provided by the mcpTest fixture.
 * Uses 'mcp-test-fixture' as name to distinguish from web tests.
 */
export const DEFAULT_MCP_SAMPLE_CONFIG: SampleConfig = {
  enabled: true,
  timeout: 30,
  name: 'mcp-test-fixture',
};

/**
 * Type definitions for mcpTest fixtures.
 * Each fixture is provided fresh for each test.
 */
export interface McpTestFixtures {
  /** Fresh FakeLogger instance - use for verifying log calls */
  fakeLogger: FakeLogger;

  /** FakeConfigService pre-populated with MCP-specific defaults */
  fakeConfig: FakeConfigService;

  /** The default SampleConfig values - useful for assertions */
  defaultSampleConfig: SampleConfig;
}

/**
 * Extended Vitest test with pre-baked fakes for MCP service testing.
 *
 * Per DYK-19: Context-specific fixtures created for future-proofing.
 * Currently wraps serviceTest with MCP-specific default config name.
 *
 * This fixture provides:
 * - `fakeLogger`: Fresh FakeLogger for each test
 * - `fakeConfig`: FakeConfigService pre-populated with MCP defaults
 * - `defaultSampleConfig`: The default config values for reference
 *
 * Usage:
 * ```typescript
 * import { mcpTest, describe, expect } from '@test/fixtures/mcp-test.fixture';
 *
 * describe('MyMcpTool', () => {
 *   mcpTest('should use config', ({ fakeLogger, fakeConfig }) => {
 *     const tool = new MyMcpTool(fakeLogger, fakeConfig);
 *     expect(tool.getConfigName()).toBe('mcp-test-fixture');
 *   });
 * });
 * ```
 */
export const mcpTest = base.extend<McpTestFixtures>({
  // Fresh FakeLogger for each test
  // biome-ignore lint/correctness/noEmptyPattern: Vitest fixture API requires destructuring
  fakeLogger: async ({}, use) => {
    await use(new FakeLogger());
  },

  // MCP-specific default config values
  // biome-ignore lint/correctness/noEmptyPattern: Vitest fixture API requires destructuring
  defaultSampleConfig: async ({}, use) => {
    await use(DEFAULT_MCP_SAMPLE_CONFIG);
  },

  // FakeConfigService pre-populated with MCP defaults
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
