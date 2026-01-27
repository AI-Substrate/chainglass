/**
 * CLI Dependency Injection Container
 *
 * Per Critical Discovery 04 and ADR-0004: Child container factory pattern.
 * Creates fresh child containers for production and test use.
 * Does NOT use singleton pattern - each call returns new container.
 */

import 'reflect-metadata';
import {
  type AdapterFactory,
  AgentService,
  ChainglassConfigService,
  ClaudeCodeAdapter,
  ConsoleOutputAdapter,
  FakeFileSystem,
  FakeHashGenerator,
  FakeLogger,
  FakeOutputAdapter,
  FakePathResolver,
  HashGeneratorAdapter,
  type IAgentAdapter,
  type IConfigService,
  type IFileSystem,
  type IHashGenerator,
  type ILogger,
  type IOutputAdapter,
  type IPathResolver,
  type IProcessManager,
  JsonOutputAdapter,
  NodeFileSystemAdapter,
  PathResolverAdapter,
  PinoLoggerAdapter,
  SHARED_DI_TOKENS,
  SdkCopilotAdapter,
  UnixProcessManager,
  WORKFLOW_DI_TOKENS,
  WORKSPACE_DI_TOKENS,
  WindowsProcessManager,
  getProjectConfigDir,
  getUserConfigDir,
} from '@chainglass/shared';
import {
  FakeGitWorktreeResolver,
  FakePhaseAdapter,
  FakePhaseService,
  FakeSampleAdapter,
  FakeSchemaValidator,
  FakeWorkflowAdapter,
  FakeWorkflowRegistry,
  FakeWorkflowService,
  FakeWorkspaceContextResolver,
  FakeWorkspaceRegistryAdapter,
  FakeYamlParser,
  GitWorktreeResolver,
  type IGitWorktreeResolver,
  type IPhaseAdapter,
  type IPhaseService,
  type ISampleAdapter,
  type ISampleService,
  type ISchemaValidator,
  type IWorkflowAdapter,
  type IWorkflowRegistry,
  type IWorkflowService,
  type IWorkspaceContextResolver,
  type IWorkspaceRegistryAdapter,
  type IWorkspaceService,
  type IYamlParser,
  PhaseAdapter,
  PhaseService,
  SampleAdapter,
  SampleService,
  SchemaValidatorAdapter,
  WorkflowAdapter,
  WorkflowRegistryService,
  WorkflowService,
  WorkspaceContextResolver,
  WorkspaceRegistryAdapter,
  WorkspaceService,
  YamlParserAdapter,
} from '@chainglass/workflow';
import { CopilotClient } from '@github/copilot-sdk';
import { type DependencyContainer, container } from 'tsyringe';

/**
 * CLI-specific DI tokens.
 */
export const CLI_DI_TOKENS = {
  /** IOutputAdapter for JSON output */
  OUTPUT_ADAPTER_JSON: 'IOutputAdapter:json',
  /** IOutputAdapter for console output */
  OUTPUT_ADAPTER_CONSOLE: 'IOutputAdapter:console',
  /** IHashGenerator interface */
  HASH_GENERATOR: 'IHashGenerator',
  /** IConfigService for agent configuration */
  CONFIG_SERVICE: 'IConfigService',
  /** IProcessManager for process spawning */
  PROCESS_MANAGER: 'IProcessManager',
  /** CopilotClient singleton */
  COPILOT_CLIENT: 'CopilotClient',
  /** AgentService for agent invocation */
  AGENT_SERVICE: 'AgentService',
} as const;

/**
 * Creates a production DI container for CLI commands.
 *
 * Registers all production adapters for CLI use:
 * - NodeFileSystemAdapter for IFileSystem
 * - PathResolverAdapter for IPathResolver
 * - YamlParserAdapter for IYamlParser
 * - SchemaValidatorAdapter for ISchemaValidator
 * - HashGeneratorAdapter for IHashGenerator
 * - WorkflowService for IWorkflowService
 * - PhaseService for IPhaseService
 * - WorkflowRegistryService for IWorkflowRegistry
 * - JsonOutputAdapter and ConsoleOutputAdapter for IOutputAdapter
 *
 * @returns Fresh child container with production registrations
 */
export function createCliProductionContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  // Register shared interface adapters
  childContainer.register<ILogger>(SHARED_DI_TOKENS.LOGGER, {
    useFactory: () => new PinoLoggerAdapter(),
  });

  childContainer.register<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM, {
    useFactory: () => new NodeFileSystemAdapter(),
  });

  childContainer.register<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER, {
    useFactory: () => new PathResolverAdapter(),
  });

  childContainer.register<IHashGenerator>(CLI_DI_TOKENS.HASH_GENERATOR, {
    useFactory: () => new HashGeneratorAdapter(),
  });

  // Register workflow interface adapters
  childContainer.register<IYamlParser>(WORKFLOW_DI_TOKENS.YAML_PARSER, {
    useFactory: () => new YamlParserAdapter(),
  });

  childContainer.register<ISchemaValidator>(WORKFLOW_DI_TOKENS.SCHEMA_VALIDATOR, {
    useFactory: () => new SchemaValidatorAdapter(),
  });

  // Register workflow registry service first (Phase 1: Manage Workflows)
  childContainer.register<IWorkflowRegistry>(WORKFLOW_DI_TOKENS.WORKFLOW_REGISTRY, {
    useFactory: (c) =>
      new WorkflowRegistryService(
        c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
        c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER),
        c.resolve<IYamlParser>(WORKFLOW_DI_TOKENS.YAML_PARSER),
        c.resolve<IHashGenerator>(CLI_DI_TOKENS.HASH_GENERATOR)
      ),
  });

  // Register workflow services (Phase 3 DYK-01: includes registry dependency)
  childContainer.register<IWorkflowService>(WORKFLOW_DI_TOKENS.WORKFLOW_SERVICE, {
    useFactory: (c) =>
      new WorkflowService(
        c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
        c.resolve<IYamlParser>(WORKFLOW_DI_TOKENS.YAML_PARSER),
        c.resolve<ISchemaValidator>(WORKFLOW_DI_TOKENS.SCHEMA_VALIDATOR),
        c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER),
        c.resolve<IWorkflowRegistry>(WORKFLOW_DI_TOKENS.WORKFLOW_REGISTRY)
      ),
  });

  childContainer.register<IPhaseService>(WORKFLOW_DI_TOKENS.PHASE_SERVICE, {
    useFactory: (c) =>
      new PhaseService(
        c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
        c.resolve<IYamlParser>(WORKFLOW_DI_TOKENS.YAML_PARSER),
        c.resolve<ISchemaValidator>(WORKFLOW_DI_TOKENS.SCHEMA_VALIDATOR)
      ),
  });

  // Register entity adapters (per Plan 010: Entity Upgrade Phase 3)
  childContainer.register<IWorkflowAdapter>(WORKFLOW_DI_TOKENS.WORKFLOW_ADAPTER, {
    useFactory: (c) =>
      new WorkflowAdapter(
        c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
        c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER),
        c.resolve<IYamlParser>(WORKFLOW_DI_TOKENS.YAML_PARSER)
      ),
  });

  childContainer.register<IPhaseAdapter>(WORKFLOW_DI_TOKENS.PHASE_ADAPTER, {
    useFactory: (c) =>
      new PhaseAdapter(
        c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
        c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER),
        c.resolve<IYamlParser>(WORKFLOW_DI_TOKENS.YAML_PARSER)
      ),
  });

  // Register output adapters
  childContainer.register<IOutputAdapter>(CLI_DI_TOKENS.OUTPUT_ADAPTER_JSON, {
    useFactory: () => new JsonOutputAdapter(),
  });

  childContainer.register<IOutputAdapter>(CLI_DI_TOKENS.OUTPUT_ADAPTER_CONSOLE, {
    useFactory: () => new ConsoleOutputAdapter(),
  });

  // Per Subtask 001 ST000: Register AgentService infrastructure
  // Pattern ported from apps/web/src/lib/di-container.ts lines 155-176

  // Register config service (lazy-loaded on first access)
  // Note: AgentService.constructor calls configService.require(AgentConfigType)
  // so config must be loaded before AgentService is created
  childContainer.register<IConfigService>(CLI_DI_TOKENS.CONFIG_SERVICE, {
    useFactory: () => {
      const configService = new ChainglassConfigService({
        userConfigDir: getUserConfigDir(),
        projectConfigDir: getProjectConfigDir(),
      });
      // Load config synchronously - AgentService needs it at construction
      // ChainglassConfigService.load() is synchronous in current implementation
      configService.load();
      return configService;
    },
  });

  // Register ProcessManager (platform-specific)
  childContainer.register<IProcessManager>(CLI_DI_TOKENS.PROCESS_MANAGER, {
    useFactory: (c) => {
      const logger = c.resolve<ILogger>(SHARED_DI_TOKENS.LOGGER);
      if (process.platform === 'win32') {
        return new WindowsProcessManager(logger);
      }
      return new UnixProcessManager(logger);
    },
  });

  // Register CopilotClient as singleton
  childContainer.registerSingleton<CopilotClient>(CLI_DI_TOKENS.COPILOT_CLIENT, CopilotClient);

  // Register AgentService with adapter factory
  childContainer.register(CLI_DI_TOKENS.AGENT_SERVICE, {
    useFactory: (c) => {
      const logger = c.resolve<ILogger>(SHARED_DI_TOKENS.LOGGER);
      const cfg = c.resolve<IConfigService>(CLI_DI_TOKENS.CONFIG_SERVICE);
      const processManager = c.resolve<IProcessManager>(CLI_DI_TOKENS.PROCESS_MANAGER);
      const copilotClient = c.resolve<CopilotClient>(CLI_DI_TOKENS.COPILOT_CLIENT);

      // Factory function for runtime adapter selection based on agent type.
      // AgentService calls this factory with the user's --type flag value.
      const adapterFactory: AdapterFactory = (agentType: string): IAgentAdapter => {
        if (agentType === 'claude-code') {
          return new ClaudeCodeAdapter(processManager, { logger });
        }
        if (agentType === 'copilot') {
          return new SdkCopilotAdapter(copilotClient, { logger });
        }
        throw new Error(`Unknown agent type: ${agentType}`);
      };

      return new AgentService(adapterFactory, cfg, logger);
    },
  });

  // Per Plan 014: Workspaces - Phase 5: Register workspace services for CLI commands
  // Workspace registry adapter
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

  // Git worktree resolver (requires IProcessManager)
  childContainer.register<IGitWorktreeResolver>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER, {
    useFactory: (c) =>
      new GitWorktreeResolver(c.resolve<IProcessManager>(CLI_DI_TOKENS.PROCESS_MANAGER)),
  });

  // Workspace context resolver (requires registry adapter, filesystem, and git resolver)
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

  // Sample adapter
  childContainer.register<ISampleAdapter>(WORKSPACE_DI_TOKENS.SAMPLE_ADAPTER, {
    useFactory: (c) =>
      new SampleAdapter(
        c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
        c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER)
      ),
  });

  // Workspace service
  childContainer.register<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE, {
    useFactory: (c) =>
      new WorkspaceService(
        c.resolve<IWorkspaceRegistryAdapter>(WORKSPACE_DI_TOKENS.WORKSPACE_REGISTRY_ADAPTER),
        c.resolve<IWorkspaceContextResolver>(WORKSPACE_DI_TOKENS.WORKSPACE_CONTEXT_RESOLVER),
        c.resolve<IGitWorktreeResolver>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER)
      ),
  });

  // Sample service
  childContainer.register<ISampleService>(WORKSPACE_DI_TOKENS.SAMPLE_SERVICE, {
    useFactory: (c) =>
      new SampleService(c.resolve<ISampleAdapter>(WORKSPACE_DI_TOKENS.SAMPLE_ADAPTER)),
  });

  return childContainer;
}

/**
 * Creates a test DI container for CLI commands with fake implementations.
 *
 * Each call returns a new isolated child container to prevent
 * state leakage between tests.
 *
 * @returns Fresh child container with test registrations (fakes)
 */
export function createCliTestContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  // Create shared fake instances for this container
  const fakeLogger = new FakeLogger();
  const fakeFileSystem = new FakeFileSystem();
  const fakePathResolver = new FakePathResolver();
  const fakeHashGenerator = new FakeHashGenerator();
  const fakeYamlParser = new FakeYamlParser();
  const fakeSchemaValidator = new FakeSchemaValidator();

  // Register shared interface fakes
  childContainer.register<ILogger>(SHARED_DI_TOKENS.LOGGER, {
    useValue: fakeLogger,
  });

  childContainer.register<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM, {
    useValue: fakeFileSystem,
  });

  childContainer.register<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER, {
    useValue: fakePathResolver,
  });

  childContainer.register<IHashGenerator>(CLI_DI_TOKENS.HASH_GENERATOR, {
    useValue: fakeHashGenerator,
  });

  // Register workflow interface fakes
  childContainer.register<IYamlParser>(WORKFLOW_DI_TOKENS.YAML_PARSER, {
    useValue: fakeYamlParser,
  });

  childContainer.register<ISchemaValidator>(WORKFLOW_DI_TOKENS.SCHEMA_VALIDATOR, {
    useValue: fakeSchemaValidator,
  });

  // Register fake services
  const fakeWorkflowService = new FakeWorkflowService();
  childContainer.register<IWorkflowService>(WORKFLOW_DI_TOKENS.WORKFLOW_SERVICE, {
    useValue: fakeWorkflowService,
  });

  const fakePhaseService = new FakePhaseService();
  childContainer.register<IPhaseService>(WORKFLOW_DI_TOKENS.PHASE_SERVICE, {
    useValue: fakePhaseService,
  });

  const fakeWorkflowRegistry = new FakeWorkflowRegistry();
  childContainer.register<IWorkflowRegistry>(WORKFLOW_DI_TOKENS.WORKFLOW_REGISTRY, {
    useValue: fakeWorkflowRegistry,
  });

  // Register output adapter fakes
  const fakeOutputAdapter = new FakeOutputAdapter();
  childContainer.register<IOutputAdapter>(CLI_DI_TOKENS.OUTPUT_ADAPTER_JSON, {
    useValue: fakeOutputAdapter,
  });
  childContainer.register<IOutputAdapter>(CLI_DI_TOKENS.OUTPUT_ADAPTER_CONSOLE, {
    useValue: fakeOutputAdapter,
  });

  // Register fake workflow adapter (per Plan 010: Entity Upgrade Phase 2)
  const fakeWorkflowAdapter = new FakeWorkflowAdapter();
  childContainer.register<IWorkflowAdapter>(WORKFLOW_DI_TOKENS.WORKFLOW_ADAPTER, {
    useValue: fakeWorkflowAdapter,
  });

  // Register fake phase adapter (per Plan 010: Entity Upgrade Phase 2)
  const fakePhaseAdapter = new FakePhaseAdapter();
  childContainer.register<IPhaseAdapter>(WORKFLOW_DI_TOKENS.PHASE_ADAPTER, {
    useValue: fakePhaseAdapter,
  });

  // Per Plan 014: Workspaces - Phase 5: Register workspace fakes for testing
  const fakeWorkspaceRegistryAdapter = new FakeWorkspaceRegistryAdapter();
  childContainer.register<IWorkspaceRegistryAdapter>(
    WORKSPACE_DI_TOKENS.WORKSPACE_REGISTRY_ADAPTER,
    {
      useValue: fakeWorkspaceRegistryAdapter,
    }
  );

  const fakeGitWorktreeResolver = new FakeGitWorktreeResolver();
  childContainer.register<IGitWorktreeResolver>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER, {
    useValue: fakeGitWorktreeResolver,
  });

  const fakeWorkspaceContextResolver = new FakeWorkspaceContextResolver();
  childContainer.register<IWorkspaceContextResolver>(
    WORKSPACE_DI_TOKENS.WORKSPACE_CONTEXT_RESOLVER,
    {
      useValue: fakeWorkspaceContextResolver,
    }
  );

  const fakeSampleAdapter = new FakeSampleAdapter();
  childContainer.register<ISampleAdapter>(WORKSPACE_DI_TOKENS.SAMPLE_ADAPTER, {
    useValue: fakeSampleAdapter,
  });

  // Note: For CLI tests, we use real services with fake adapters per DYK-P5-03
  childContainer.register<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE, {
    useFactory: (c) =>
      new WorkspaceService(
        c.resolve<IWorkspaceRegistryAdapter>(WORKSPACE_DI_TOKENS.WORKSPACE_REGISTRY_ADAPTER),
        c.resolve<IWorkspaceContextResolver>(WORKSPACE_DI_TOKENS.WORKSPACE_CONTEXT_RESOLVER),
        c.resolve<IGitWorktreeResolver>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER)
      ),
  });

  childContainer.register<ISampleService>(WORKSPACE_DI_TOKENS.SAMPLE_SERVICE, {
    useFactory: (c) =>
      new SampleService(c.resolve<ISampleAdapter>(WORKSPACE_DI_TOKENS.SAMPLE_ADAPTER)),
  });

  return childContainer;
}
