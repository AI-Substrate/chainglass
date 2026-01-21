import { SampleConfigType } from '@chainglass/shared';
import {
  DEFAULT_FIXTURE_SAMPLE_CONFIG,
  describe,
  expect,
  serviceTest,
} from '@test/fixtures/service-test.fixture';

/**
 * Tests verifying the serviceTest fixture works correctly.
 * These tests demonstrate the fixture usage pattern.
 */
describe('serviceTest fixture', () => {
  serviceTest('should provide fakeLogger', ({ fakeLogger }) => {
    /*
    Test Doc:
    - Why: Verify fixture provides working FakeLogger
    - Contract: fakeLogger is a FakeLogger instance with all methods
    - Usage Notes: Each test gets a fresh instance
    - Quality Contribution: Ensures fixture injection works
    - Worked Example: fakeLogger.info('test') → does not throw
    */
    expect(fakeLogger).toBeDefined();
    expect(() => fakeLogger.info('test')).not.toThrow();
  });

  serviceTest('should provide fakeConfig with defaults', ({ fakeConfig }) => {
    /*
    Test Doc:
    - Why: Verify fixture provides pre-populated FakeConfigService
    - Contract: fakeConfig has SampleConfig pre-populated
    - Usage Notes: Default values come from DEFAULT_FIXTURE_SAMPLE_CONFIG
    - Quality Contribution: Ensures config fixture injection works
    - Worked Example: fakeConfig.get(SampleConfigType) → SampleConfig
    */
    expect(fakeConfig).toBeDefined();
    const config = fakeConfig.get(SampleConfigType);
    expect(config).toBeDefined();
    expect(config?.timeout).toBe(DEFAULT_FIXTURE_SAMPLE_CONFIG.timeout);
  });

  serviceTest('should provide defaultSampleConfig', ({ defaultSampleConfig }) => {
    /*
    Test Doc:
    - Why: Verify fixture provides default config values for assertions
    - Contract: defaultSampleConfig matches expected defaults
    - Usage Notes: Use for comparing against service behavior
    - Quality Contribution: Ensures default values are accessible
    - Worked Example: defaultSampleConfig.timeout === 30
    */
    expect(defaultSampleConfig).toEqual(DEFAULT_FIXTURE_SAMPLE_CONFIG);
  });

  serviceTest('should allow config override via set()', ({ fakeConfig }) => {
    /*
      Test Doc:
      - Why: Verify fixture config can be overridden per-test
      - Contract: set() updates config, get() reflects new values
      - Usage Notes: Override in test body for custom scenarios
      - Quality Contribution: Ensures flexible test setup
      - Worked Example: set(type, {timeout: 120}); get(type).timeout === 120
      */
    fakeConfig.set(SampleConfigType, {
      enabled: false,
      timeout: 120,
      name: 'overridden',
    });

    const config = fakeConfig.require(SampleConfigType);
    expect(config.timeout).toBe(120);
    expect(config.enabled).toBe(false);
  });

  serviceTest('should provide fresh instances per test', ({ fakeLogger }) => {
    /*
    Test Doc:
    - Why: Verify fixture isolation - each test gets fresh instances
    - Contract: Logging in one test doesn't affect another
    - Usage Notes: Tests are isolated by default
    - Quality Contribution: Prevents test pollution
    - Worked Example: fakeLogger.getEntries() is empty at test start
    */
    // This test runs after others but should have empty logger
    expect(fakeLogger.getEntries()).toHaveLength(0);

    // Log something
    fakeLogger.info('test message');
    expect(fakeLogger.getEntries()).toHaveLength(1);
  });
});
