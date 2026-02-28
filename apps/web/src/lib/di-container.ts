/**
 * Dependency Injection Container for @chainglass/web
 *
 * Implements Critical Discovery 02: Decorator-free TSyringe pattern for RSC compatibility
 * Implements Critical Discovery 04: Child container pattern for test isolation
 *
 * Extended for Plan 019: Agent Manager Refactor - central agent registry
 *
 * IMPORTANT: Uses explicit container.register() instead of @injectable() decorators
 * because decorators may not survive React Server Component compilation.
 */

import 'reflect-metadata';
import * as os from 'node:os';
import * as path from 'node:path';
// Plan 050: Import positional-graph registration + template services
import type { IWorkUnitLoader } from '@chainglass/positional-graph';
import { registerPositionalGraphServices } from '@chainglass/positional-graph';
import {
  type AdapterFactory,
  AgentService,
  ClaudeCodeAdapter,
  FakeAgentAdapter,
  FakeConfigService,
  FakeLogger,
  FakeProcessManager,
  FakeYamlParser,
  type IAgentAdapter,
  type IConfigService,
  type IFileSystem,
  type ILogger,
  type IPathResolver,
  type IProcessManager,
  type IYamlParser,
  NodeFileSystemAdapter,
  POSITIONAL_GRAPH_DI_TOKENS,
  PathResolverAdapter,
  PinoLoggerAdapter,
  SHARED_DI_TOKENS,
  SdkCopilotAdapter,
  UnixProcessManager,
  WORKSPACE_DI_TOKENS,
  WindowsProcessManager,
  YamlParserAdapter,
} from '@chainglass/shared';
// Plan 019: Import AgentManagerService for central agent registry
import {
  type AdapterFactory as AgentAdapterFactory,
  AgentManagerService,
  AgentStorageAdapter,
  FakeAgentManagerService,
  FakeAgentNotifierService,
  FakeAgentStorageAdapter,
  type IAgentManagerService,
  type IAgentNotifierService,
  type IAgentStorageAdapter,
} from '@chainglass/shared/features/019-agent-manager-refactor';
// Plan 027: Import CentralEventNotifier types from shared
import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events';
import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events';
// Plan 014 Phase 6: Import workspace services from @chainglass/workflow
// Plan 018 Phase 2: Import AgentEventAdapter for workspace-scoped event storage
// Plan 018 Phase 3: Import AgentSessionAdapter and AgentSessionService
import {
  AgentEventAdapter,
  AgentSessionAdapter,
  AgentSessionService,
  CentralWatcherService,
  FakeAgentEventAdapter,
  FakeAgentSessionAdapter,
  FakeCentralWatcherService,
  FakeFileWatcherFactory,
  FakeGitWorktreeResolver,
  FakeSampleAdapter,
  FakeWorkspaceContextResolver,
  FakeWorkspaceRegistryAdapter,
  GitWorktreeResolver,
  type IAgentEventAdapter,
  type IAgentSessionAdapter,
  type IAgentSessionService,
  type ICentralWatcherService,
  type IFileWatcherFactory,
  type IGitWorktreeResolver,
  type ISampleAdapter,
  type ISampleService,
  type IWorkspaceContextResolver,
  type IWorkspaceRegistryAdapter,
  type IWorkspaceService,
  NativeFileWatcherFactory,
  SampleAdapter,
  SampleService as WorkflowSampleService,
  WorkspaceContextResolver,
  WorkspaceRegistryAdapter,
  WorkspaceService,
} from '@chainglass/workflow';
import {
  type ITemplateService,
  InstanceAdapter,
  TemplateAdapter,
  TemplateService,
} from '@chainglass/workflow';
// Phase 4: Import CopilotClient from SDK for production adapter
import { CopilotClient } from '@github/copilot-sdk';
import { type DependencyContainer, container } from 'tsyringe';
// Plan 019 Phase 2: Import notifier implementations
import { AgentNotifierService } from '../features/019-agent-manager-refactor/agent-notifier.service';
import { SSEManagerBroadcaster } from '../features/019-agent-manager-refactor/sse-manager-broadcaster';
// Plan 027: CentralEventNotifierService (real implementation)
import { CentralEventNotifierService } from '../features/027-central-notify-events/central-event-notifier.service';
import { SampleService } from '../services/sample.service';
import { sseManager } from './sse-manager';

// Token constants for type-safe resolution
export const DI_TOKENS = {
  LOGGER: 'ILogger',
  CONFIG: 'IConfigService',
  SAMPLE_SERVICE: 'SampleService',
  PROCESS_MANAGER: 'IProcessManager',
  AGENT_ADAPTER: 'IAgentAdapter',
  CLAUDE_CODE_ADAPTER: 'ClaudeCodeAdapter',
  COPILOT_CLIENT: 'CopilotClient', // Singleton SDK client
  COPILOT_ADAPTER: 'CopilotAdapter',
  AGENT_SERVICE: 'AgentService',
  // Plan 018: Event storage moved to workspace-scoped AgentEventAdapter in @chainglass/workflow
  // Consumers should use WORKSPACE_DI_TOKENS.AGENT_EVENT_ADAPTER instead
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
  console.debug('[createProductionContainer] Config registered in DI container', {
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

  // Register ClaudeCodeAdapter as default AGENT_ADAPTER
  childContainer.register<IAgentAdapter>(DI_TOKENS.AGENT_ADAPTER, {
    useFactory: (c) => {
      const processManager = c.resolve<IProcessManager>(DI_TOKENS.PROCESS_MANAGER);
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      return new ClaudeCodeAdapter(processManager, { logger });
    },
  });

  // Per Phase 4: Also register named adapters for explicit selection
  childContainer.register<IAgentAdapter>(DI_TOKENS.CLAUDE_CODE_ADAPTER, {
    useFactory: (c) => {
      const processManager = c.resolve<IProcessManager>(DI_TOKENS.PROCESS_MANAGER);
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      return new ClaudeCodeAdapter(processManager, { logger });
    },
  });

  // Register CopilotClient as singleton to avoid repeated SDK client construction
  // Per PR review feedback: reuse single instance for both COPILOT_ADAPTER and adapterFactory
  childContainer.registerSingleton<CopilotClient>(DI_TOKENS.COPILOT_CLIENT, CopilotClient);

  childContainer.register<IAgentAdapter>(DI_TOKENS.COPILOT_ADAPTER, {
    useFactory: (c) => {
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      const client = c.resolve<CopilotClient>(DI_TOKENS.COPILOT_CLIENT);
      return new SdkCopilotAdapter(client, { logger });
    },
  });

  // Per Phase 5: Register AgentService with factory function for adapter selection
  childContainer.register(DI_TOKENS.AGENT_SERVICE, {
    useFactory: (c) => {
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      const cfg = c.resolve<IConfigService>(DI_TOKENS.CONFIG);
      const processManager = c.resolve<IProcessManager>(DI_TOKENS.PROCESS_MANAGER);
      const copilotClient = c.resolve<CopilotClient>(DI_TOKENS.COPILOT_CLIENT);

      // Per DYK-02: Factory function for adapter selection
      const adapterFactory: AdapterFactory = (agentType: string): IAgentAdapter => {
        if (agentType === 'claude-code') {
          return new ClaudeCodeAdapter(processManager, { logger });
        }
        if (agentType === 'copilot') {
          // Reuse singleton CopilotClient to avoid repeated SDK client construction
          return new SdkCopilotAdapter(copilotClient, { logger });
        }
        throw new Error(`Unknown agent type: ${agentType}`);
      };

      return new AgentService(adapterFactory, cfg, logger);
    },
  });

  // Plan 018 Phase 2: Register AgentEventAdapter for workspace-scoped event storage
  childContainer.register<IAgentEventAdapter>(WORKSPACE_DI_TOKENS.AGENT_EVENT_ADAPTER, {
    useFactory: (c) => {
      const fileSystem = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      return new AgentEventAdapter(fileSystem, pathResolver, logger);
    },
  });

  // Plan 018 Phase 3: Register AgentSessionAdapter for workspace-scoped session storage
  childContainer.register<IAgentSessionAdapter>(WORKSPACE_DI_TOKENS.AGENT_SESSION_ADAPTER, {
    useFactory: (c) => {
      const fileSystem = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      return new AgentSessionAdapter(fileSystem, pathResolver);
    },
  });

  // Plan 018 Phase 3: Register AgentSessionService for agent session operations
  childContainer.register<IAgentSessionService>(WORKSPACE_DI_TOKENS.AGENT_SESSION_SERVICE, {
    useFactory: (c) => {
      const adapter = c.resolve<IAgentSessionAdapter>(WORKSPACE_DI_TOKENS.AGENT_SESSION_ADAPTER);
      return new AgentSessionService(adapter);
    },
  });

  // ==================== Plan 014 Phase 6: Workspace Service Registrations ====================

  // Register shared filesystem and path resolver (needed by workspace adapters)
  childContainer.register<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM, {
    useFactory: () => new NodeFileSystemAdapter(),
  });

  childContainer.register<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER, {
    useFactory: () => new PathResolverAdapter(),
  });

  // Register YAML parser
  childContainer.register<IYamlParser>(SHARED_DI_TOKENS.YAML_PARSER, {
    useFactory: () => new YamlParserAdapter(),
  });

  // Register workspace registry adapter
  childContainer.register<IWorkspaceRegistryAdapter>(
    WORKSPACE_DI_TOKENS.WORKSPACE_REGISTRY_ADAPTER,
    {
      useFactory: (c) =>
        new WorkspaceRegistryAdapter(
          c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
          c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER)
        ),
    }
  );

  // Register git worktree resolver (uses ProcessManager)
  childContainer.register<IGitWorktreeResolver>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER, {
    useFactory: (c) =>
      new GitWorktreeResolver(c.resolve<IProcessManager>(DI_TOKENS.PROCESS_MANAGER)),
  });

  // Register workspace context resolver
  childContainer.register<IWorkspaceContextResolver>(
    WORKSPACE_DI_TOKENS.WORKSPACE_CONTEXT_RESOLVER,
    {
      useFactory: (c) =>
        new WorkspaceContextResolver(
          c.resolve<IWorkspaceRegistryAdapter>(WORKSPACE_DI_TOKENS.WORKSPACE_REGISTRY_ADAPTER),
          c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
          c.resolve<IGitWorktreeResolver>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER)
        ),
    }
  );

  // Register sample adapter
  childContainer.register<ISampleAdapter>(WORKSPACE_DI_TOKENS.SAMPLE_ADAPTER, {
    useFactory: (c) =>
      new SampleAdapter(
        c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
        c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER)
      ),
  });

  // Register workspace service
  childContainer.register<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE, {
    useFactory: (c) =>
      new WorkspaceService(
        c.resolve<IWorkspaceRegistryAdapter>(WORKSPACE_DI_TOKENS.WORKSPACE_REGISTRY_ADAPTER),
        c.resolve<IWorkspaceContextResolver>(WORKSPACE_DI_TOKENS.WORKSPACE_CONTEXT_RESOLVER),
        c.resolve<IGitWorktreeResolver>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER)
      ),
  });

  // Register sample service (using the workflow's SampleService, not the web's SampleService)
  childContainer.register<ISampleService>(WORKSPACE_DI_TOKENS.SAMPLE_SERVICE, {
    useFactory: (c) =>
      new WorkflowSampleService(c.resolve<ISampleAdapter>(WORKSPACE_DI_TOKENS.SAMPLE_ADAPTER)),
  });

  // ==================== Plan 019: Agent Manager Service ====================

  // Phase 2: Register AgentNotifierService with SSEManagerBroadcaster
  // Per DYK-07: Real implementation lives in apps/web
  // Per DYK-08: Uses SSEManagerBroadcaster adapter
  childContainer.register<IAgentNotifierService>(SHARED_DI_TOKENS.AGENT_NOTIFIER_SERVICE, {
    useFactory: () => {
      const broadcaster = new SSEManagerBroadcaster(sseManager);
      return new AgentNotifierService(broadcaster);
    },
  });

  // Phase 3: Register AgentStorageAdapter for persistent agent storage
  // Per AC-19: Storage at ~/.config/chainglass/agents/
  // Per DYK-11: Real adapter in packages/shared for contract test parity
  childContainer.register<IAgentStorageAdapter>(SHARED_DI_TOKENS.AGENT_STORAGE_ADAPTER, {
    useFactory: (c) => {
      const fileSystem = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      const basePath = path.join(os.homedir(), '.config', 'chainglass', 'agents');
      return new AgentStorageAdapter(fileSystem, pathResolver, basePath);
    },
  });

  // Register AgentManagerService as manual singleton with adapter factory, notifier, and storage
  // Per DYK-06: AgentManagerService receives notifier via DI
  // Per DYK-12: Storage is optional but provided for persistence
  // Per Phase 5 ST001: Must be singleton — multiple resolve() calls must return the same instance
  // so in-memory agent state is shared across server components and API routes.
  let agentManagerInstance: IAgentManagerService | null = null;
  childContainer.register<IAgentManagerService>(SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE, {
    useFactory: (c) => {
      if (agentManagerInstance) {
        return agentManagerInstance;
      }

      const notifier = c.resolve<IAgentNotifierService>(SHARED_DI_TOKENS.AGENT_NOTIFIER_SERVICE);
      const storage = c.resolve<IAgentStorageAdapter>(SHARED_DI_TOKENS.AGENT_STORAGE_ADAPTER);

      // Per DYK-01: Factory function for adapter selection
      // Resolve dependencies inside the factory (not outside) so they survive HMR reloads.
      const agentAdapterFactory: AgentAdapterFactory = (agentType) => {
        const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
        if (agentType === 'claude-code') {
          const processManager = c.resolve<IProcessManager>(DI_TOKENS.PROCESS_MANAGER);
          return new ClaudeCodeAdapter(processManager, { logger });
        }
        if (agentType === 'copilot') {
          const copilotClient = c.resolve<CopilotClient>(DI_TOKENS.COPILOT_CLIENT);
          return new SdkCopilotAdapter(copilotClient, { logger });
        }
        throw new Error(`Unknown agent type: ${agentType}`);
      };

      agentManagerInstance = new AgentManagerService(agentAdapterFactory, notifier, storage);
      return agentManagerInstance;
    },
  });

  // ==================== Plan 050: Positional Graph Services ====================

  registerPositionalGraphServices(childContainer);

  // Bridge WORK_UNIT_LOADER → WORKUNIT_SERVICE (PositionalGraphService needs this)
  childContainer.register<IWorkUnitLoader>(POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_LOADER, {
    useFactory: (c) => c.resolve<IWorkUnitLoader>(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE),
  });

  // Template/Instance services (Plan 050)
  childContainer.register(POSITIONAL_GRAPH_DI_TOKENS.TEMPLATE_ADAPTER, {
    useFactory: (c) =>
      new TemplateAdapter(
        c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
        c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER)
      ),
  });
  childContainer.register(POSITIONAL_GRAPH_DI_TOKENS.INSTANCE_ADAPTER, {
    useFactory: (c) =>
      new InstanceAdapter(
        c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
        c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER)
      ),
  });
  childContainer.register<ITemplateService>(POSITIONAL_GRAPH_DI_TOKENS.TEMPLATE_SERVICE, {
    useFactory: (c) =>
      new TemplateService(
        c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
        c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER),
        c.resolve<IYamlParser>(SHARED_DI_TOKENS.YAML_PARSER),
        c.resolve<TemplateAdapter>(POSITIONAL_GRAPH_DI_TOKENS.TEMPLATE_ADAPTER),
        c.resolve<InstanceAdapter>(POSITIONAL_GRAPH_DI_TOKENS.INSTANCE_ADAPTER)
      ),
  });

  // ==================== Plan 027: Central Notification System ====================

  // Register IFileWatcherFactory → NativeFileWatcherFactory (Plan 060: replaces chokidar)
  childContainer.register<IFileWatcherFactory>(WORKSPACE_DI_TOKENS.FILE_WATCHER_FACTORY, {
    useFactory: () => new NativeFileWatcherFactory(),
  });

  // Register CentralWatcherService with all 6 constructor dependencies
  // Construction only — Phase 3 activates the watcher via startCentralNotificationSystem()
  childContainer.register<ICentralWatcherService>(WORKSPACE_DI_TOKENS.CENTRAL_WATCHER_SERVICE, {
    useFactory: (c) => {
      const registry = c.resolve<IWorkspaceRegistryAdapter>(
        WORKSPACE_DI_TOKENS.WORKSPACE_REGISTRY_ADAPTER
      );
      const worktreeResolver = c.resolve<IGitWorktreeResolver>(
        WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER
      );
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const fileWatcherFactory = c.resolve<IFileWatcherFactory>(
        WORKSPACE_DI_TOKENS.FILE_WATCHER_FACTORY
      );
      const registryPath = path.join(os.homedir(), '.config', 'chainglass', 'workspaces.json');
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      return new CentralWatcherService(
        registry,
        worktreeResolver,
        fs,
        fileWatcherFactory,
        registryPath,
        logger
      );
    },
  });

  // Register CentralEventNotifierService as useValue singleton
  const centralNotifier = new CentralEventNotifierService(new SSEManagerBroadcaster(sseManager));
  childContainer.register<ICentralEventNotifier>(WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER, {
    useValue: centralNotifier,
  });

  // FIX-010: Performance metrics for container creation
  const durationMs = performance.now() - startTime;
  console.debug(`[createProductionContainer] Container created in ${durationMs.toFixed(2)}ms`);

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
  // Per Phase 5 DYK-05: Include agent config for AgentService
  const fakeConfig = new FakeConfigService({
    sample: { enabled: true, timeout: 30, name: 'test-fixture' },
    agent: { timeout: 600000 }, // 10 minutes default
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

  // Per Phase 5: Register AgentService in test container with FakeAgentAdapter
  childContainer.register(DI_TOKENS.AGENT_SERVICE, {
    useFactory: (c) => {
      const logger = c.resolve<ILogger>(DI_TOKENS.LOGGER);
      const cfg = c.resolve<IConfigService>(DI_TOKENS.CONFIG);

      // Test factory always returns FakeAgentAdapter
      const adapterFactory: AdapterFactory = () =>
        new FakeAgentAdapter({
          sessionId: 'test-session',
          output: 'Test output',
          tokens: { used: 100, total: 100, limit: 200000 },
        });

      return new AgentService(adapterFactory, cfg, logger);
    },
  });

  // Plan 018 Phase 2: Register FakeAgentEventAdapter for test isolation
  const fakeAgentEventAdapter = new FakeAgentEventAdapter();
  childContainer.register<IAgentEventAdapter>(WORKSPACE_DI_TOKENS.AGENT_EVENT_ADAPTER, {
    useValue: fakeAgentEventAdapter,
  });

  // Plan 018 Phase 3: Register FakeAgentSessionAdapter for test isolation
  const fakeAgentSessionAdapter = new FakeAgentSessionAdapter();
  childContainer.register<IAgentSessionAdapter>(WORKSPACE_DI_TOKENS.AGENT_SESSION_ADAPTER, {
    useValue: fakeAgentSessionAdapter,
  });

  // Plan 018 Phase 3: Register AgentSessionService with fake adapter
  childContainer.register<IAgentSessionService>(WORKSPACE_DI_TOKENS.AGENT_SESSION_SERVICE, {
    useFactory: (c) => {
      const adapter = c.resolve<IAgentSessionAdapter>(WORKSPACE_DI_TOKENS.AGENT_SESSION_ADAPTER);
      return new AgentSessionService(adapter);
    },
  });

  // ==================== Plan 014 Phase 6: Workspace Service Fakes ====================

  // Register fake YAML parser
  childContainer.register<IYamlParser>(SHARED_DI_TOKENS.YAML_PARSER, {
    useValue: new FakeYamlParser(),
  });

  // Register fake workspace registry adapter
  const fakeWorkspaceRegistryAdapter = new FakeWorkspaceRegistryAdapter();
  childContainer.register<IWorkspaceRegistryAdapter>(
    WORKSPACE_DI_TOKENS.WORKSPACE_REGISTRY_ADAPTER,
    {
      useValue: fakeWorkspaceRegistryAdapter,
    }
  );

  // Register fake git worktree resolver
  const fakeGitResolver = new FakeGitWorktreeResolver();
  childContainer.register<IGitWorktreeResolver>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER, {
    useValue: fakeGitResolver,
  });

  // Register fake workspace context resolver
  const fakeContextResolver = new FakeWorkspaceContextResolver();
  childContainer.register<IWorkspaceContextResolver>(
    WORKSPACE_DI_TOKENS.WORKSPACE_CONTEXT_RESOLVER,
    {
      useValue: fakeContextResolver,
    }
  );

  // Register fake sample adapter
  const fakeSampleAdapter = new FakeSampleAdapter();
  childContainer.register<ISampleAdapter>(WORKSPACE_DI_TOKENS.SAMPLE_ADAPTER, {
    useValue: fakeSampleAdapter,
  });

  // Register workspace service with fakes
  childContainer.register<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE, {
    useFactory: (c) =>
      new WorkspaceService(
        c.resolve<IWorkspaceRegistryAdapter>(WORKSPACE_DI_TOKENS.WORKSPACE_REGISTRY_ADAPTER),
        c.resolve<IWorkspaceContextResolver>(WORKSPACE_DI_TOKENS.WORKSPACE_CONTEXT_RESOLVER),
        c.resolve<IGitWorktreeResolver>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER)
      ),
  });

  // Register sample service with fake adapter
  childContainer.register<ISampleService>(WORKSPACE_DI_TOKENS.SAMPLE_SERVICE, {
    useFactory: (c) =>
      new WorkflowSampleService(c.resolve<ISampleAdapter>(WORKSPACE_DI_TOKENS.SAMPLE_ADAPTER)),
  });

  // ==================== Plan 019: Agent Manager Service (Fake) ====================

  // Phase 2: Register FakeAgentNotifierService for test isolation
  const fakeNotifier = new FakeAgentNotifierService();
  childContainer.register<IAgentNotifierService>(SHARED_DI_TOKENS.AGENT_NOTIFIER_SERVICE, {
    useValue: fakeNotifier,
  });

  // Phase 3: Register FakeAgentStorageAdapter for test isolation
  const fakeStorage = new FakeAgentStorageAdapter();
  childContainer.register<IAgentStorageAdapter>(SHARED_DI_TOKENS.AGENT_STORAGE_ADAPTER, {
    useValue: fakeStorage,
  });

  // Register FakeAgentManagerService for test isolation
  childContainer.register<IAgentManagerService>(SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE, {
    useFactory: () => {
      return new FakeAgentManagerService();
    },
  });

  // ==================== Plan 027: Central Notification System (Fakes) ====================

  // Register FakeFileWatcherFactory for test isolation
  childContainer.register<IFileWatcherFactory>(WORKSPACE_DI_TOKENS.FILE_WATCHER_FACTORY, {
    useValue: new FakeFileWatcherFactory(),
  });

  // Register FakeCentralWatcherService for test isolation
  childContainer.register<ICentralWatcherService>(WORKSPACE_DI_TOKENS.CENTRAL_WATCHER_SERVICE, {
    useValue: new FakeCentralWatcherService(),
  });

  // Register FakeCentralEventNotifier for test isolation
  childContainer.register<ICentralEventNotifier>(WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER, {
    useValue: new FakeCentralEventNotifier(),
  });

  return childContainer;
}
