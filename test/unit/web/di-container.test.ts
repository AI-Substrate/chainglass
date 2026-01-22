/**
 * DI Container Tests for @chainglass/web
 *
 * Tests the child container pattern per Critical Discovery 04:
 * - Production container registers PinoLoggerAdapter
 * - Test container registers FakeLogger
 * - Containers are isolated from each other
 * - SampleService can be resolved with injected logger (DYK-01)
 */

// Must import reflect-metadata before tsyringe
import 'reflect-metadata';
import { FakeLogger, type ILogger, LogLevel, PinoLoggerAdapter } from '@chainglass/shared';
import { createProductionContainer, createTestContainer } from '@chainglass/web/lib/di-container';
// SampleService will be created in T007 - import will fail until then
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { SampleService } from '@chainglass/web/services/sample.service';
import { container } from 'tsyringe';
import { beforeEach, describe, expect, it } from 'vitest';

describe('DI Container', () => {
  beforeEach(() => {
    container.clearInstances();
  });

  it('should create production container with real adapters', () => {
    /*
    Test Doc:
    - Why: Production must use real adapters (PinoLoggerAdapter) not fakes; wrong wiring causes silent failures
    - Contract: createProductionContainer() resolves 'ILogger' to PinoLoggerAdapter instance
    - Usage Notes: Use createProductionContainer() in app startup; never in tests
    - Quality Contribution: Catches misconfigured production DI that would ship fakes to production
    - Worked Example: createProductionContainer().resolve('ILogger') returns PinoLoggerAdapter
    */
    const prodContainer = createProductionContainer();
    const logger = prodContainer.resolve<ILogger>('ILogger');

    expect(logger).toBeInstanceOf(PinoLoggerAdapter);
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

    expect(logger).toBeInstanceOf(FakeLogger);
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
    const { SampleService } = await import('@chainglass/web/services/sample.service');
    const service = testContainer.resolve<InstanceType<typeof SampleService>>('SampleService');

    await service.doSomething('test-input');

    // Verify the injected logger was used
    expect(logger.getEntries().length).toBeGreaterThan(0);
    logger.assertLoggedAtLevel(LogLevel.INFO, 'Processing');
  });
});
