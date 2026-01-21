/**
 * Dependency Injection Container for @chainglass/mcp-server
 *
 * Implements Critical Discovery 02: Decorator-free TSyringe pattern
 * Implements Critical Discovery 04: Child container pattern for test isolation
 *
 * Per Critical Insights Discussion (2026-01-19):
 * - Each package owns its own DI container
 * - MCP server uses PinoLoggerAdapter.createForStderr() for stdio compliance
 */

import 'reflect-metadata';
import {
  FakeConfigService,
  FakeLogger,
  type IConfigService,
  type ILogger,
  PinoLoggerAdapter,
} from '@chainglass/shared';
import { type DependencyContainer, container } from 'tsyringe';

// Token constants for type-safe resolution
export const MCP_DI_TOKENS = {
  LOGGER: 'ILogger',
  CONFIG: 'IConfigService',
} as const;

/**
 * Creates a production DI container for MCP server with stderr-configured logger.
 *
 * Per Critical Discovery 10: stdout reserved for JSON-RPC in stdio mode.
 * Uses PinoLoggerAdapter.createForStderr() to ensure all logs go to stderr.
 *
 * Per Critical Discovery 02: Config must be loaded BEFORE calling this function.
 * Per DYK-18: Logger is config-independent (no ordering concern).
 *
 * @param config Pre-loaded IConfigService instance (must have isLoaded() === true)
 * @returns Child container with production registrations
 * @throws Error if config is missing or not loaded
 */
export function createMcpProductionContainer(config?: IConfigService): DependencyContainer {
  const startTime = performance.now();

  // FIX-001: Make parameter optional for runtime safety (JavaScript consumers)
  // FIX-003/FIX-009: Combined guard with error logging and structured context
  if (!config || !config.isLoaded()) {
    const errorCode = !config ? 'CONFIG_REQUIRED' : 'CONFIG_NOT_LOADED';
    const errorMsg = !config
      ? 'IConfigService required - call config.load() before createMcpProductionContainer(config)'
      : 'Config not loaded - call config.load() before createMcpProductionContainer(config)';

    // FIX-003: Log error to stderr before throwing for debugging visibility
    const errorContext = {
      errorCode,
      service: 'mcp-production-container',
      configProvided: !!config,
      configLoaded: config?.isLoaded() ?? false,
    };
    console.error(`[createMcpProductionContainer] ${errorMsg}`, errorContext);

    throw new Error(`${errorCode}: ${errorMsg}`);
  }

  const childContainer = container.createChildContainer();

  // Register pre-loaded config as value
  childContainer.register<IConfigService>(MCP_DI_TOKENS.CONFIG, {
    useValue: config,
  });

  // FIX-005: Audit log for config registration (to stderr for stdio compliance)
  console.error('[createMcpProductionContainer] Config registered in MCP DI container', {
    configLoaded: config.isLoaded(),
  });

  // Register stderr-configured logger for stdio mode compliance
  // Per DYK-18: Logger is config-independent (PinoLoggerAdapter.createForStderr() takes no params)
  childContainer.register<ILogger>(MCP_DI_TOKENS.LOGGER, {
    useFactory: () => PinoLoggerAdapter.createForStderr(),
  });

  // FIX-010: Performance metrics for container creation
  const durationMs = performance.now() - startTime;
  console.error(`[createMcpProductionContainer] Container created in ${durationMs.toFixed(2)}ms`);

  return childContainer;
}

/**
 * Creates a test DI container for MCP server with fake implementations.
 *
 * Each call returns a new isolated child container to prevent
 * state leakage between tests.
 *
 * @returns Child container with test registrations (FakeLogger, FakeConfigService, etc.)
 */
export function createMcpTestContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  // Create a shared FakeLogger instance for this container
  const fakeLogger = new FakeLogger();

  // Create FakeConfigService with default test config
  const fakeConfig = new FakeConfigService({
    sample: { enabled: true, timeout: 30, name: 'mcp-test-fixture' },
  });

  // Register test fakes
  childContainer.register<IConfigService>(MCP_DI_TOKENS.CONFIG, {
    useValue: fakeConfig,
  });

  childContainer.register<ILogger>(MCP_DI_TOKENS.LOGGER, {
    useFactory: () => fakeLogger,
  });

  return childContainer;
}
