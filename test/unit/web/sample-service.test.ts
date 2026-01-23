/**
 * SampleService Tests for @chainglass/web
 *
 * Tests the reference implementation of a service with DI.
 * SampleService demonstrates the pattern for all future services:
 * - Receives ILogger via constructor (not decorators)
 * - Uses the injected logger for operations
 * - Can be tested with FakeLogger for assertions
 */

// Must import reflect-metadata before tsyringe
import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import { SampleService } from '../../../apps/web/src/services/sample.service';
import {
  FakeConfigService,
  FakeLogger,
  type IConfigService,
  type ILogger,
  LogLevel,
  SampleConfigType,
} from '../../../packages/shared/src';

describe('SampleService', () => {
  let service: SampleService;
  let fakeLogger: FakeLogger;
  let fakeConfig: FakeConfigService;

  beforeEach(() => {
    fakeLogger = new FakeLogger();
    fakeConfig = new FakeConfigService({
      sample: { enabled: true, timeout: 30, name: 'test-fixture' },
    });
    service = new SampleService(fakeLogger, fakeConfig);
  });

  it('should process input and return result', async () => {
    /*
    Test Doc:
    - Why: Core business logic must transform input correctly; this is the primary happy path
    - Contract: doSomething(input) returns 'Processed: {input}' string
    - Usage Notes: Pass any string; async method returns Promise<string>
    - Quality Contribution: Catches transformation logic bugs; ensures service does its primary job
    - Worked Example: doSomething('test-input') returns 'Processed: test-input'
    */
    const result = await service.doSomething('test-input');

    expect(result).toBe('Processed: test-input');
  });

  it('should log processing operations', async () => {
    /*
    Test Doc:
    - Why: Operations must be observable for debugging and monitoring; silent services are hard to troubleshoot
    - Contract: doSomething() logs INFO 'Processing input' at start and 'Processing complete' at end
    - Usage Notes: Use FakeLogger.assertLoggedAtLevel() to verify; checks substring match
    - Quality Contribution: Catches missing log statements; ensures observability contract is maintained
    - Worked Example: After doSomething('x'), fakeLogger contains INFO entries for start and complete
    */
    await service.doSomething('test');

    fakeLogger.assertLoggedAtLevel(LogLevel.INFO, 'Processing input');
    fakeLogger.assertLoggedAtLevel(LogLevel.INFO, 'Processing complete');
  });

  it('should include input in log metadata', async () => {
    /*
    Test Doc:
    - Why: Structured logging with context enables filtering and correlation in production log systems
    - Contract: 'Processing input' log entry includes {input: <value>} in metadata
    - Usage Notes: Access entry.data to inspect structured metadata; data is optional object
    - Quality Contribution: Catches missing context in logs; ensures production debugging is possible
    - Worked Example: After doSomething('my-value'), log entry has data.input === 'my-value'
    */
    await service.doSomething('my-value');

    const entries = fakeLogger.getEntriesByLevel(LogLevel.INFO);
    const inputEntry = entries.find((e) => e.message.includes('Processing input'));

    expect(inputEntry?.data?.input).toBe('my-value');
  });

  describe('Config Injection (Phase 4)', () => {
    let fakeConfig: FakeConfigService;

    beforeEach(() => {
      fakeConfig = new FakeConfigService({
        sample: { enabled: true, timeout: 30, name: 'test-fixture' },
      });
    });

    it('should receive IConfigService via constructor', () => {
      /*
      Test Doc:
      - Why: Verifies AC-23 - SampleService must receive IConfigService via constructor injection
      - Contract: new SampleService(logger, config) compiles without TypeScript errors
      - Usage Notes: Config is required parameter; use FakeConfigService in tests
      - Quality Contribution: Catches DI wiring issues where config dependency is missing
      - Worked Example: new SampleService(fakeLogger, fakeConfig) creates valid instance
      */
      const service = new SampleService(fakeLogger, fakeConfig);

      expect(service).toBeInstanceOf(SampleService);
    });

    it('should use timeout from config via getTimeout()', () => {
      /*
      Test Doc:
      - Why: Verifies AC-24 - SampleService should read config values (demonstrating config consumption)
      - Contract: getTimeout() returns value from SampleConfig.timeout
      - Usage Notes: Inject FakeConfigService with pre-set timeout value
      - Quality Contribution: Catches config integration bugs where config is ignored
      - Worked Example: FakeConfig(timeout: 60) → getTimeout() === 60
      */
      fakeConfig.set(SampleConfigType, { enabled: true, timeout: 60, name: 'custom' });
      const service = new SampleService(fakeLogger, fakeConfig);

      expect(service.getTimeout()).toBe(60);
    });

    it('should use default timeout when config has default value', () => {
      /*
      Test Doc:
      - Why: Edge case - verify config defaults work correctly
      - Contract: getTimeout() returns 30 when using default config
      - Usage Notes: Default comes from Zod schema default in SampleConfigSchema
      - Quality Contribution: Catches default value handling issues
      - Worked Example: FakeConfig(timeout: 30) → getTimeout() === 30
      */
      const service = new SampleService(fakeLogger, fakeConfig);

      expect(service.getTimeout()).toBe(30);
    });

    it('should report enabled state from config via isEnabled()', () => {
      /*
      Test Doc:
      - Why: Feature flag pattern - services should be disableable via config
      - Contract: isEnabled() returns SampleConfig.enabled value
      - Usage Notes: Use for feature toggles; check before performing operations
      - Quality Contribution: Catches config-based feature flag implementation issues
      - Worked Example: FakeConfig(enabled: false) → isEnabled() === false
      */
      fakeConfig.set(SampleConfigType, { enabled: false, timeout: 30, name: 'disabled' });
      const service = new SampleService(fakeLogger, fakeConfig);

      expect(service.isEnabled()).toBe(false);
    });
  });
});
