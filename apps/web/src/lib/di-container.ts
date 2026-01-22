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
import {
  ClaudeCodeAdapter,
  FakeAgentAdapter,
  FakeConfigService,
  FakeLogger,
  FakeProcessManager,
  type IAgentAdapter,
  type IConfigService,
  type ILogger,
  type IProcessManager,
  PinoLoggerAdapter,
  UnixProcessManager,
  WindowsProcessManager,
} from '@chainglass/shared';
import { type DependencyContainer, container } from 'tsyringe';
import { SampleService } from '../services/sample.service.js';

// Token constants for type-safe resolution
export const DI_TOKENS = {
  LOGGER: 'ILogger',
  CONFIG: 'IConfigService',
  SAMPLE_SERVICE: 'SampleService',
  PROCESS_MANAGER: 'IProcessManager',
  AGENT_ADAPTER: 'IAgentAdapter',
} as const;

/**
 * Creates a production DI container with real adapter implementations.
 *
 * Use in application startup code (not in tests).
 *
 * Per Critical Discovery 02: Config must be loaded BEFORE calling this function.
 * See bootstrap.ts for correct startup sequence.
 *
 * @param config Pre-loaded IConfigService instance (must have isLoaded() === true)
 * @returns Child container with production registrations
 * @throws Error if config is missing or not loaded
 */
export function createProductionContainer(config?: IConfigService): DependencyContainer {
  const startTime = performance.now();

  // FIX-001: Make parameter optional for runtime safety (JavaScript consumers)
  // FIX-002/FIX-009: Combined guard with error logging and structured context
  if (!config || !config.isLoaded()) {
    const errorCode = !config ? 'CONFIG_REQUIRED' : 'CONFIG_NOT_LOADED';
    const errorMsg = !config
      ? 'IConfigService required - call config.load() before createProductionContainer(config)'
      : 'Config not loaded - call config.load() before createProductionContainer(config)';

    // FIX-002: Log error before throwing for debugging visibility
    const errorContext = {
      errorCode,
      service: 'production-container',
      configProvided: !!config,
      configLoaded: config?.isLoaded() ?? false,
    };
    console.error(`[createProductionContainer] ${errorMsg}`, errorContext);

    throw new Error(`${errorCode}: ${errorMsg}`);
  }

  const childContainer = container.createChildContainer();

  // Register pre-loaded config as value (not factory)
  // This is the key insight from Critical Discovery 02
  childContainer.register<IConfigService>(DI_TOKENS.CONFIG, {
    useValue: config,
  });

  // FIX-005: Audit log for config registration
  console.log('[createProductionContainer] Config registered in DI container', {
    configLoaded: config.isLoaded(),
  });

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
      const cfg = c.resolve<IConfigService>(DI_TOKENS.CONFIG);
      return new SampleService(logger, cfg);
    },
  });

  // Per DYK-08: Register ClaudeCodeAdapter in app container for Phase 2
  // Phase 3: Platform-appropriate ProcessManager implementation
  // Uses UnixProcessManager on Linux/macOS, WindowsProcessManager on Windows
  childContainer.register<IProcessManager>(DI_TOKENS.PROCESS_MANAGER, {
    useFactory: (c) => {
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      if (process.platform === 'win32') {
        return new WindowsProcessManager(logger);
      }
      return new UnixProcessManager(logger);
    },
  });

  childContainer.register<IAgentAdapter>(DI_TOKENS.AGENT_ADAPTER, {
    useFactory: (c) => {
      const processManager = c.resolve<IProcessManager>(DI_TOKENS.PROCESS_MANAGER);
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      return new ClaudeCodeAdapter(processManager, { logger });
    },
  });

  // FIX-010: Performance metrics for container creation
  const durationMs = performance.now() - startTime;
  console.log(`[createProductionContainer] Container created in ${durationMs.toFixed(2)}ms`);

  return childContainer;
}

/**
 * Creates a test DI container with fake implementations.
 *
 * Each call returns a new isolated child container to prevent
 * state leakage between tests.
 *
 * @returns Child container with test registrations (FakeLogger, FakeConfigService, etc.)
 */
export function createTestContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  // Create a shared FakeLogger instance for this container
  // This allows isolation tests to verify separate log entries
  const fakeLogger = new FakeLogger();

  // Create FakeConfigService with default test config
  // Matches DEFAULT_FIXTURE_SAMPLE_CONFIG from service-test.fixture.ts
  const fakeConfig = new FakeConfigService({
    sample: { enabled: true, timeout: 30, name: 'test-fixture' },
  });

  // Register test fakes
  childContainer.register<IConfigService>(DI_TOKENS.CONFIG, {
    useValue: fakeConfig,
  });

  // Register test fakes using factory pattern
  // (useClass requires decorators which don't work in RSC)
  childContainer.register<ILogger>(DI_TOKENS.LOGGER, {
    useFactory: () => fakeLogger,
  });

  // Register SampleService with factory for explicit DI (DYK-01)
  childContainer.register(DI_TOKENS.SAMPLE_SERVICE, {
    useFactory: (c) => {
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      const config = c.resolve<IConfigService>(DI_TOKENS.CONFIG);
      return new SampleService(logger, config);
    },
  });

  // Per DYK-08: Register FakeAgentAdapter in test container
  childContainer.register<IProcessManager>(DI_TOKENS.PROCESS_MANAGER, {
    useFactory: () => new FakeProcessManager(),
  });

  childContainer.register<IAgentAdapter>(DI_TOKENS.AGENT_ADAPTER, {
    useFactory: () =>
      new FakeAgentAdapter({
        sessionId: 'test-session',
        output: 'Test output',
        tokens: { used: 100, total: 100, limit: 200000 },
      }),
  });

  return childContainer;
}
