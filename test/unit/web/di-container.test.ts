/**
 * DI Container Tests for @chainglass/web
 *
 * Tests the child container pattern per Critical Discovery 04:
 * - Production container registers PinoLoggerAdapter
 * - Test container registers FakeLogger
 * - Containers are isolated from each other
 * - SampleService can be resolved with injected logger (DYK-01)
 *
 * Extended for Plan 019: Agent Manager Refactor
 * - AgentManagerService registration
 */

// Must import reflect-metadata before tsyringe
import 'reflect-metadata';
import { container } from 'tsyringe';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DI_TOKENS,
  createProductionContainer,
  createTestContainer,
} from '../../../apps/web/src/lib/di-container';
// SampleService will be created in T007 - import will fail until then
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { SampleService } from '../../../apps/web/src/services/sample.service';
import {
  FakeConfigService,
  type FakeLogger,
  type IConfigService,
  type ILogger,
  LogLevel,
  PinoLoggerAdapter,
  SampleConfigType,
} from '../../../packages/shared/src';

describe('DI Container', () => {
  beforeEach(() => {
    container.clearInstances();
  });

  it('should create production container with real adapters', async () => {
    /*
    Test Doc:
    - Why: Production must use real adapters (PinoLoggerAdapter) not fakes; wrong wiring causes silent failures
    - Contract: createProductionContainer(config) resolves 'ILogger' to PinoLoggerAdapter instance
    - Usage Notes: Use createProductionContainer() in app startup; never in tests
    - Quality Contribution: Catches misconfigured production DI that would ship fakes to production
    - Worked Example: createProductionContainer(config).resolve('ILogger') returns PinoLoggerAdapter
    */
    const { ChainglassConfigService } = await import('@chainglass/shared');
    const config = new ChainglassConfigService({
      userConfigDir: null,
      projectConfigDir: null,
    });
    config.load();

    const prodContainer = createProductionContainer(config);
    const logger = prodContainer.resolve<ILogger>('ILogger');

    // Use duck typing to check instance (module copies cause instanceof to fail in monorepos)
    expect(logger).toHaveProperty('debug');
    expect(logger).toHaveProperty('info');
    expect(logger).toHaveProperty('warn');
    expect(logger).toHaveProperty('error');
    expect(logger.constructor.name).toBe('PinoLoggerAdapter');
  });

  it('should create test container with fakes', () => {
    /*
    Test Doc:
    - Why: Tests must use fakes for deterministic assertions; real adapters cause flaky/slow tests
    - Contract: createTestContainer() resolves 'ILogger' to FakeLogger instance
    - Usage Notes: Use createTestContainer() in all test setup; provides assertion helpers
    - Quality Contribution: Catches test container misconfiguration that would use real I/O in tests
    - Worked Example: createTestContainer().resolve('ILogger') returns FakeLogger with getEntries()
    */
    const testContainer = createTestContainer();
    const logger = testContainer.resolve<ILogger>('ILogger');

    // Use duck typing (FakeLogger has getEntries method)
    expect(logger).toHaveProperty('getEntries');
    expect(logger.constructor.name).toBe('FakeLogger');
  });

  it('should isolate containers from each other', () => {
    /*
    Test Doc:
    - Why: TSyringe singleton pollution caused flaky tests; child containers solve this
    - Contract: Each createTestContainer() call returns independent container with isolated state
    - Usage Notes: Always create fresh container per test; never share containers between tests
    - Quality Contribution: Eliminates test order dependencies and state leakage between tests
    - Worked Example: container1.resolve('ILogger').info('x') does not affect container2.resolve('ILogger').getEntries()
    */
    const container1 = createTestContainer();
    const container2 = createTestContainer();

    const logger1 = container1.resolve<ILogger>('ILogger') as FakeLogger;
    const logger2 = container2.resolve<ILogger>('ILogger') as FakeLogger;

    logger1.info('container 1 message');

    expect(logger1.getEntries()).toHaveLength(1);
    expect(logger2.getEntries()).toHaveLength(0);
  });

  it('should resolve SampleService with injected logger', async () => {
    /*
    Test Doc:
    - Why: SampleService requires explicit DI registration since decorators are forbidden in RSC (DYK-01)
    - Contract: createTestContainer().resolve('SampleService') returns instance with working ILogger
    - Usage Notes: SampleService is explicitly registered via factory; resolve using string token
    - Quality Contribution: Catches missing DI registration that would break service instantiation
    - Worked Example: container.resolve('SampleService').doSomething('x') logs messages via injected logger
    */
    const testContainer = createTestContainer();
    const logger = testContainer.resolve<ILogger>('ILogger') as FakeLogger;

    // Resolve using the registered string token (not the class directly)
    // This is required because we use decorator-free DI
    const { SampleService } = await import('../../../apps/web/src/services/sample.service');
    const service = testContainer.resolve<InstanceType<typeof SampleService>>('SampleService');

    await service.doSomething('test-input');

    // Verify the injected logger was used
    expect(logger.getEntries().length).toBeGreaterThan(0);
    logger.assertLoggedAtLevel(LogLevel.INFO, 'Processing');
  });

  describe('Config Registration (Phase 4)', () => {
    it('should resolve IConfigService from production container', async () => {
      /*
      Test Doc:
      - Why: Verifies AC-21 - IConfigService must be registered in production container
      - Contract: createProductionContainer(config) resolves DI_TOKENS.CONFIG to IConfigService
      - Usage Notes: Config must be pre-loaded before passing to container
      - Quality Contribution: Catches missing config registration in production DI
      - Worked Example: createProductionContainer(loadedConfig).resolve(CONFIG) returns IConfigService
      */
      // Use dynamic import to get ChainglassConfigService
      const { ChainglassConfigService } = await import('@chainglass/shared');
      const config = new ChainglassConfigService({
        userConfigDir: null,
        projectConfigDir: null,
      });
      config.load();

      const prodContainer = createProductionContainer(config);
      const resolvedConfig = prodContainer.resolve<IConfigService>(DI_TOKENS.CONFIG);

      expect(resolvedConfig).toBe(config);
      expect(resolvedConfig.isLoaded()).toBe(true);
    });

    it('should use FakeConfigService in test container', () => {
      /*
      Test Doc:
      - Why: Verifies AC-22 - Test container must use FakeConfigService for deterministic tests
      - Contract: createTestContainer() resolves DI_TOKENS.CONFIG to FakeConfigService instance
      - Usage Notes: FakeConfigService pre-populated with defaults; use set() to override
      - Quality Contribution: Catches test container misconfiguration that would use real config loading
      - Worked Example: createTestContainer().resolve(CONFIG) returns FakeConfigService
      */
      const testContainer = createTestContainer();
      const configService = testContainer.resolve<IConfigService>(DI_TOKENS.CONFIG);

      // Use duck typing (FakeConfigService has set method)
      expect(configService).toHaveProperty('set');
      expect(configService.constructor.name).toBe('FakeConfigService');
    });

    it('should pre-populate FakeConfigService with sample config in test container', () => {
      /*
      Test Doc:
      - Why: Tests need sensible defaults without manual setup every time
      - Contract: createTestContainer() provides FakeConfigService with SampleConfig pre-set
      - Usage Notes: Default values match DEFAULT_FIXTURE_SAMPLE_CONFIG from service-test.fixture
      - Quality Contribution: Reduces boilerplate; ensures consistent test config
      - Worked Example: createTestContainer().resolve(CONFIG).require(SampleConfigType) returns default config
      */
      const testContainer = createTestContainer();
      const configService = testContainer.resolve<IConfigService>(DI_TOKENS.CONFIG);

      const sampleConfig = configService.require(SampleConfigType);

      expect(sampleConfig).toBeDefined();
      expect(sampleConfig.enabled).toBe(true);
      expect(sampleConfig.timeout).toBe(30);
      expect(sampleConfig.name).toBe('test-fixture');
    });

    it('should throw if production container created without config', () => {
      /*
      Test Doc:
      - Why: Fail-fast if config not provided; prevents runtime errors from missing config
      - Contract: createProductionContainer() without config throws descriptive error
      - Usage Notes: Always call config.load() before createProductionContainer(config)
      - Quality Contribution: Catches startup bugs where config loading was forgotten
      - Worked Example: createProductionContainer() → throws "CONFIG_REQUIRED: IConfigService required"
      */
      expect(() => createProductionContainer()).toThrow('CONFIG_REQUIRED');
    });

    it('should throw if config not loaded before passing to production container', async () => {
      /*
      Test Doc:
      - Why: Guards against T011 - unloaded config passed to container would cause runtime errors
      - Contract: createProductionContainer(unloadedConfig) throws descriptive error
      - Usage Notes: Call config.load() before passing to container; isLoaded() must return true
      - Quality Contribution: Catches startup bugs where load() was not called
      - Worked Example: createProductionContainer(new ConfigService()) → throws "CONFIG_NOT_LOADED: Config not loaded"
      */
      const { ChainglassConfigService } = await import('@chainglass/shared');
      const config = new ChainglassConfigService({
        userConfigDir: null,
        projectConfigDir: null,
      });
      // Intentionally NOT calling config.load()

      expect(() => createProductionContainer(config)).toThrow('CONFIG_NOT_LOADED');
    });
  });
});
