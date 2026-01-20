/**
 * Web Test Fixtures for @chainglass/web tests.
 *
 * Provides Vitest fixtures with automatic DI container and FakeLogger injection.
 * This implements DRY test infrastructure per DYK-04.
 *
 * Usage:
 * ```typescript
 * import { test, expect, describe, LogLevel } from '@test/base/web-test';
 *
 * describe('MyService', () => {
 *   test('should do something', async ({ container, logger }) => {
 *     const service = container.resolve(MyService);
 *     await service.doSomething();
 *     logger.assertLoggedAtLevel(LogLevel.INFO, 'Expected message');
 *   });
 * });
 * ```
 */

import { type FakeLogger, LogLevel } from '@chainglass/shared';
import type { DependencyContainer } from 'tsyringe';
import { test as base, beforeEach, describe, expect, it } from 'vitest';

// Re-export common test utilities for convenience
export { expect, describe, beforeEach, it, LogLevel };

/**
 * Fixtures available to web tests.
 */
export interface WebTestFixtures {
  /**
   * Isolated child DI container with test registrations (FakeLogger).
   * Each test gets a fresh container instance.
   */
  container: DependencyContainer;

  /**
   * The FakeLogger registered in the container.
   * Use for assertions: logger.assertLoggedAtLevel(), logger.getEntries(), etc.
   */
  logger: FakeLogger;
}

/**
 * Extended test function with automatic container and logger fixtures.
 *
 * Note: This fixture requires createTestContainer() from @chainglass/web/lib/di-container
 * which will be implemented in T004. Tests using this fixture will fail (RED) until then.
 */
export const test = base.extend<WebTestFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Vitest fixtures require empty destructure for no-dependency fixtures
  container: async ({}, use) => {
    // Lazy import to avoid circular dependencies during test file loading
    const { createTestContainer } = await import('@chainglass/web/lib/di-container');
    const container = createTestContainer();
    await use(container);
  },

  logger: async ({ container }, use) => {
    const logger = container.resolve<FakeLogger>('ILogger');
    await use(logger);
  },
});

/**
 * Helper function for tests that need to create the context manually
 * (e.g., in beforeEach blocks instead of using fixtures).
 *
 * @returns WebTestFixtures with container and logger
 */
export async function createWebTestContext(): Promise<WebTestFixtures> {
  const { createTestContainer } = await import('@chainglass/web/lib/di-container');
  const container = createTestContainer();
  const logger = container.resolve<FakeLogger>('ILogger');
  return { container, logger };
}
