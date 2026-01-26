/**
 * Application Bootstrap - Config Loading and DI Container Setup
 *
 * This file documents the correct startup sequence for the Chainglass web application.
 * Per Critical Discovery 02: Config must be fully loaded BEFORE DI container creation.
 *
 * STARTUP SEQUENCE:
 * 1. Create ChainglassConfigService with config directories
 * 2. Call config.load() synchronously (blocking - throws on error)
 * 3. Verify config.isLoaded() === true (optional but recommended)
 * 4. Pass loaded config to createProductionContainer(config)
 * 5. Resolve services from container
 *
 * IMPORTANT: Do NOT use lazy config loading in DI factories.
 * The config must be fully loaded before any service resolution.
 *
 * @see /docs/plans/004-config/tasks/phase-4-di-integration/tasks.md - T014
 */

import {
  ChainglassConfigService,
  type IConfigService,
  getProjectConfigDir,
  getUserConfigDir,
} from '@chainglass/shared';
import type { DependencyContainer } from 'tsyringe';
import type { SampleService } from '../services/sample.service';
import { DI_TOKENS, createProductionContainer } from './di-container';

/**
 * Bootstrap options for customizing startup behavior.
 */
export interface BootstrapOptions {
  /** Override user config directory (default: getUserConfigDir()) */
  userConfigDir?: string | null;
  /** Override project config directory (default: getProjectConfigDir()) */
  projectConfigDir?: string | null;
}

/**
 * Bootstrap result containing the DI container and resolved services.
 */
export interface BootstrapResult {
  /** The configured DI container */
  container: DependencyContainer;
  /** The loaded config service */
  config: IConfigService;
}

/**
 * Bootstrap the application with proper config loading and DI setup.
 *
 * This is the recommended entry point for application startup.
 * Follows the correct sequence per Critical Discovery 02.
 *
 * @example
 * ```typescript
 * // Standard startup
 * const { container, config } = bootstrap();
 * const sampleService = container.resolve<SampleService>(DI_TOKENS.SAMPLE_SERVICE);
 *
 * // Custom config directories (e.g., for testing)
 * const { container } = bootstrap({
 *   userConfigDir: '/custom/user/config',
 *   projectConfigDir: '/custom/project/.chainglass',
 * });
 * ```
 *
 * @param options Optional configuration for custom directories
 * @returns BootstrapResult with container and config
 * @throws ConfigurationError if config validation fails
 * @throws LiteralSecretError if hardcoded secrets detected
 */
export function bootstrap(options: BootstrapOptions = {}): BootstrapResult {
  // ====================================
  // Step 1: Create config service
  // ====================================
  // Resolve config directories (uses defaults if not provided)
  const userConfigDir =
    options.userConfigDir !== undefined ? options.userConfigDir : getUserConfigDir();
  const projectConfigDir =
    options.projectConfigDir !== undefined ? options.projectConfigDir : getProjectConfigDir();

  const config = new ChainglassConfigService({
    userConfigDir,
    projectConfigDir,
  });

  // ====================================
  // Step 2: Load config synchronously
  // ====================================
  // This is blocking and will throw on validation errors.
  // Fail-fast behavior catches config issues at startup, not runtime.
  config.load();

  // ====================================
  // Step 3: Verify config loaded (optional but recommended)
  // ====================================
  // This is a sanity check - load() sets _loaded = true on success.
  // If we reach this point, config is definitely loaded.
  if (!config.isLoaded()) {
    throw new Error('Config load() completed but isLoaded() is false - this should not happen');
  }

  // ====================================
  // Step 4: Create DI container with loaded config
  // ====================================
  // The container factory validates that config is loaded.
  // Services can now safely resolve config via DI.
  const container = createProductionContainer(config);

  return { container, config };
}

/**
 * Example usage demonstrating the full startup sequence.
 *
 * This function shows how application entry points should be structured.
 * Copy this pattern for new entry points (CLI, MCP server, etc.).
 *
 * @example
 * ```typescript
 * // apps/web/src/index.ts
 * import { bootstrap } from './lib/bootstrap.js';
 * import { DI_TOKENS } from './lib/di-container.js';
 * import type { SampleService } from './services/sample.service.js';
 *
 * async function main() {
 *   const { container } = bootstrap();
 *   const sampleService = container.resolve<SampleService>(DI_TOKENS.SAMPLE_SERVICE);
 *
 *   // Use the service...
 *   const timeout = sampleService.getTimeout();
 *   console.log(`Configured timeout: ${timeout}s`);
 * }
 *
 * main().catch(console.error);
 * ```
 */
export function exampleStartup(): void {
  // This demonstrates the pattern but is not meant to be called directly.
  // See the @example in the docstring above for actual usage.

  try {
    // 1. Bootstrap with default directories
    const { container, config } = bootstrap();

    // 2. Resolve services from container
    const sampleService = container.resolve<SampleService>(DI_TOKENS.SAMPLE_SERVICE);

    // 3. Use services - config is now available via DI
    console.log(`Service enabled: ${sampleService.isEnabled()}`);
    console.log(`Service timeout: ${sampleService.getTimeout()}s`);
  } catch (error) {
    // Config validation errors are caught here
    console.error('Startup failed:', error);
    process.exit(1);
  }
}
