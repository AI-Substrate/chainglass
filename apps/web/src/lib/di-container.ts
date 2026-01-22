/**
 * Dependency Injection Container for @chainglass/web
 *
 * Implements Critical Discovery 02: Decorator-free TSyringe pattern for RSC compatibility
 * Implements Critical Discovery 04: Child container pattern for test isolation
 *
 * IMPORTANT: Uses explicit container.register() instead of @injectable() decorators
 * because decorators may not survive React Server Component compilation.
 */

import 'reflect-metadata';
import { FakeLogger, type ILogger, PinoLoggerAdapter } from '@chainglass/shared';
import { type DependencyContainer, container } from 'tsyringe';
import { SampleService } from '../services/sample.service.js';

// Token constants for type-safe resolution
export const DI_TOKENS = {
  LOGGER: 'ILogger',
  SAMPLE_SERVICE: 'SampleService',
} as const;

/**
 * Creates a production DI container with real adapter implementations.
 *
 * Use in application startup code (not in tests).
 *
 * @returns Child container with production registrations
 */
export function createProductionContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  // Register production adapters using factory pattern
  // (useClass requires decorators which don't work in RSC)
  childContainer.register<ILogger>(DI_TOKENS.LOGGER, {
    useFactory: () => new PinoLoggerAdapter(),
  });

  // Register SampleService with factory for explicit DI (DYK-01)
  // This is required because we can't use @injectable() decorators in RSC
  childContainer.register(DI_TOKENS.SAMPLE_SERVICE, {
    useFactory: (c) => {
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      return new SampleService(logger);
    },
  });

  return childContainer;
}

/**
 * Creates a test DI container with fake implementations.
 *
 * Each call returns a new isolated child container to prevent
 * state leakage between tests.
 *
 * @returns Child container with test registrations (FakeLogger, etc.)
 */
export function createTestContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  // Create a shared FakeLogger instance for this container
  // This allows isolation tests to verify separate log entries
  const fakeLogger = new FakeLogger();

  // Register test fakes using factory pattern
  // (useClass requires decorators which don't work in RSC)
  childContainer.register<ILogger>(DI_TOKENS.LOGGER, {
    useFactory: () => fakeLogger,
  });

  // Register SampleService with factory for explicit DI (DYK-01)
  childContainer.register(DI_TOKENS.SAMPLE_SERVICE, {
    useFactory: (c) => {
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      return new SampleService(logger);
    },
  });

  return childContainer;
}
