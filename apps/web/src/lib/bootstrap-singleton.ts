/**
 * Bootstrap Singleton - Lazy DI Container for Route Handlers
 *
 * Per DYK-05 (Plan 012 subtask 001): No existing route uses DI, and bootstrap()
 * is synchronous. This helper provides a lazy singleton pattern matching SSEManager
 * to ensure:
 * - Config loaded once (not per-request)
 * - Container survives HMR in development
 * - Same pattern as SSEManager for consistency
 *
 * Usage in route handlers:
 * ```typescript
 * const { container } = getBootstrapSingleton();
 * const agentService = container.resolve<AgentService>(DI_TOKENS.AGENT_SERVICE);
 * ```
 */

import type { IConfigService } from '@chainglass/shared';
import type { DependencyContainer } from 'tsyringe';
import { type BootstrapResult, bootstrap } from './bootstrap';

/**
 * Global singleton storage using globalThis pattern.
 * Survives Next.js HMR during development.
 */
const globalForBootstrap = globalThis as typeof globalThis & {
  bootstrapSingleton?: BootstrapResult;
};

/**
 * Get or create the bootstrap singleton.
 *
 * On first call: runs bootstrap() to load config and create DI container.
 * On subsequent calls: returns cached result.
 *
 * @returns BootstrapResult with container and config
 * @throws ConfigurationError if config validation fails on first call
 */
export function getBootstrapSingleton(): BootstrapResult {
  if (!globalForBootstrap.bootstrapSingleton) {
    globalForBootstrap.bootstrapSingleton = bootstrap();
  }
  return globalForBootstrap.bootstrapSingleton;
}

/**
 * Get container from the bootstrap singleton.
 * Convenience wrapper for getBootstrapSingleton().container
 *
 * @returns DependencyContainer for service resolution
 */
export function getContainer(): DependencyContainer {
  return getBootstrapSingleton().container;
}

/**
 * Get config from the bootstrap singleton.
 * Convenience wrapper for getBootstrapSingleton().config
 *
 * @returns IConfigService for config access
 */
export function getConfig(): IConfigService {
  return getBootstrapSingleton().config;
}

/**
 * Reset the bootstrap singleton (for testing only).
 * DO NOT use in production code.
 */
export function resetBootstrapSingleton(): void {
  globalForBootstrap.bootstrapSingleton = undefined;
}
