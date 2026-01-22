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
import { FakeLogger, type ILogger, PinoLoggerAdapter } from '@chainglass/shared';
import { type DependencyContainer, container } from 'tsyringe';

// Token constants for type-safe resolution
export const MCP_DI_TOKENS = {
  LOGGER: 'ILogger',
} as const;

/**
 * Creates a production DI container for MCP server with stderr-configured logger.
 *
 * Per Critical Discovery 10: stdout reserved for JSON-RPC in stdio mode.
 * Uses PinoLoggerAdapter.createForStderr() to ensure all logs go to stderr.
 *
 * @returns Child container with production registrations
 */
export function createMcpProductionContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  // Register stderr-configured logger for stdio mode compliance
  childContainer.register<ILogger>(MCP_DI_TOKENS.LOGGER, {
    useFactory: () => PinoLoggerAdapter.createForStderr(),
  });

  return childContainer;
}

/**
 * Creates a test DI container for MCP server with fake implementations.
 *
 * Each call returns a new isolated child container to prevent
 * state leakage between tests.
 *
 * @returns Child container with test registrations (FakeLogger, etc.)
 */
export function createMcpTestContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  // Create a shared FakeLogger instance for this container
  const fakeLogger = new FakeLogger();

  // Register test fakes
  childContainer.register<ILogger>(MCP_DI_TOKENS.LOGGER, {
    useFactory: () => fakeLogger,
  });

  return childContainer;
}
