/**
 * CLI Dependency Injection Container
 *
 * Per Critical Discovery 04 and ADR-0004: Child container factory pattern.
 * Creates fresh child containers for production and test use.
 * Does NOT use singleton pattern - each call returns new container.
 */

import 'reflect-metadata';
import { execSync } from 'node:child_process';
import {
  FakeWorkUnitService,
  registerOrchestrationServices,
  registerPositionalGraphServices,
} from '@chainglass/positional-graph';
import type { IWorkUnitLoader, IWorkUnitService } from '@chainglass/positional-graph';
import {
  EventHandlerService,
  NodeEventRegistry,
  NodeEventService,
  ScriptRunner,
  createEventHandlerRegistry,
  registerCoreEventTypes,
} from '@chainglass/positional-graph';
import type { IEventHandlerService, IScriptRunner } from '@chainglass/positional-graph';
import {
  type AdapterFactory,
  AgentManagerService,
  ChainglassConfigService,
  ClaudeCodeAdapter,
  ConsoleOutputAdapter,
  CopilotCLIAdapter,
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
  ORCHESTRATION_DI_TOKENS,
  POSITIONAL_GRAPH_DI_TOKENS,
  PathResolverAdapter,
  PinoLoggerAdapter,
  SHARED_DI_TOKENS,
  SdkCopilotAdapter,
  UnixProcessManager,
  WORKFLOW_DI_TOKENS,
  WORKGRAPH_DI_TOKENS,
  WORKSPACE_DI_TOKENS,
  WindowsProcessManager,
  getProjectConfigDir,
  getUserConfigDir,
} from '@chainglass/shared';
import {
  FakeGitWorktreeManager,
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
  GitWorktreeManagerAdapter,
  GitWorktreeResolver,
  type IGitWorktreeManager,
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
  InstanceAdapter,
  PhaseAdapter,
  PhaseService,
  SampleAdapter,
  SampleService,
  SchemaValidatorAdapter,
  TemplateAdapter,
  TemplateService,
  WorkflowAdapter,
  WorkflowRegistryService,
  WorkflowService,
  WorkspaceContextResolver,
  WorkspaceRegistryAdapter,
  WorkspaceService,
  WorktreeBootstrapRunner,
  YamlParserAdapter,
} from '@chainglass/workflow';
import type { ITemplateService } from '@chainglass/workflow';
import { registerWorkgraphServices, registerWorkgraphTestServices } from '@chainglass/workgraph';
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
  /** AgentManagerService for agent lifecycle (Plan 034, replaces AGENT_SERVICE) */
  AGENT_MANAGER: 'IAgentManagerService',
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

  // Register workgraph services (per ADR-0008: Module Registration Function Pattern)
  // Use WORKFLOW_DI_TOKENS.YAML_PARSER since CLI already has YamlParserAdapter registered there
  registerWorkgraphServices(childContainer, WORKFLOW_DI_TOKENS.YAML_PARSER);

  // Register positional-graph services (per ADR-0009: Module Registration Function Pattern)
  // Per Plan 029 Phase 3 Critical Insight #1: Register IWorkUnitLoader AFTER registerPositionalGraphServices()
  // This resolves to positional-graph's WorkUnitService (not workgraph bridge)
  // Per Critical Insight #5: WorkUnitService satisfies both IWorkUnitService and IWorkUnitLoader structurally
  registerPositionalGraphServices(childContainer);
  childContainer.register<IWorkUnitLoader>(POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_LOADER, {
    useFactory: (c) => c.resolve<IWorkUnitLoader>(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE),
  });

  // Template/Instance service (Plan 048 Phase 2)
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
        c.resolve<IYamlParser>(WORKFLOW_DI_TOKENS.YAML_PARSER),
        c.resolve<TemplateAdapter>(POSITIONAL_GRAPH_DI_TOKENS.TEMPLATE_ADAPTER),
        c.resolve<InstanceAdapter>(POSITIONAL_GRAPH_DI_TOKENS.INSTANCE_ADAPTER)
      ),
  });

  // Register orchestration prerequisites (Plan 036 Phase 5)
  // ScriptRunner: real subprocess executor for code work units (Plan 037)
  childContainer.register<IScriptRunner>(ORCHESTRATION_DI_TOKENS.SCRIPT_RUNNER, {
    useFactory: () => new ScriptRunner(),
  });

  // EventHandlerService: needed by orchestration settle phase (Plan 036)
  // Note: loadState/persistState on NodeEventService are only used by raise() (agent CLI path).
  // The orchestrator uses processGraph(state) which operates on state directly.
  childContainer.register<IEventHandlerService>(ORCHESTRATION_DI_TOKENS.EVENT_HANDLER_SERVICE, {
    useFactory: () => {
      const registry = new NodeEventRegistry();
      registerCoreEventTypes(registry);
      const handlerRegistry = createEventHandlerRegistry();
      const nes = new NodeEventService(
        {
          registry,
          loadState: async () => {
            throw new Error('loadState not available in orchestration context');
          },
          persistState: async () => {
            throw new Error('persistState not available in orchestration context');
          },
        },
        handlerRegistry
      );
      return new EventHandlerService(nes);
    },
  });

  // Register orchestration services (per ADR-0009 pattern)
  registerOrchestrationServices(childContainer);

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

  // Register AgentManagerService with adapter factory (Plan 034, replaces AgentService)
  childContainer.register(CLI_DI_TOKENS.AGENT_MANAGER, {
    useFactory: (c) => {
      const logger = c.resolve<ILogger>(SHARED_DI_TOKENS.LOGGER);
      const processManager = c.resolve<IProcessManager>(CLI_DI_TOKENS.PROCESS_MANAGER);
      const copilotClient = c.resolve<CopilotClient>(CLI_DI_TOKENS.COPILOT_CLIENT);

      const adapterFactory = (agentType: string): IAgentAdapter => {
        if (agentType === 'claude-code') {
          return new ClaudeCodeAdapter(processManager, { logger });
        }
        if (agentType === 'copilot') {
          return new SdkCopilotAdapter(copilotClient, { logger });
        }
        if (agentType === 'copilot-cli') {
          const sendKeys = (target: string, text: string): void => {
            execSync(`tmux send-keys -t ${target} ${JSON.stringify(text)}`, { stdio: 'ignore' });
          };
          const sendEnter = (target: string): void => {
            execSync(`tmux send-keys -t ${target} Enter`, { stdio: 'ignore' });
          };
          return new CopilotCLIAdapter({ sendKeys, sendEnter });
        }
        throw new Error(`Unknown agent type: ${agentType}`);
      };

      return new AgentManagerService(adapterFactory);
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

  // Git worktree manager (Plan 069: mutation boundary)
  childContainer.register<IGitWorktreeManager>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_MANAGER, {
    useFactory: (c) =>
      new GitWorktreeManagerAdapter(c.resolve<IProcessManager>(SHARED_DI_TOKENS.PROCESS_MANAGER)),
  });

  // Workspace service
  childContainer.register<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE, {
    useFactory: (c) =>
      new WorkspaceService(
        c.resolve<IWorkspaceRegistryAdapter>(WORKSPACE_DI_TOKENS.WORKSPACE_REGISTRY_ADAPTER),
        c.resolve<IWorkspaceContextResolver>(WORKSPACE_DI_TOKENS.WORKSPACE_CONTEXT_RESOLVER),
        c.resolve<IGitWorktreeResolver>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER),
        c.resolve<IGitWorktreeManager>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_MANAGER),
        new WorktreeBootstrapRunner(
          c.resolve<IProcessManager>(SHARED_DI_TOKENS.PROCESS_MANAGER),
          c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM)
        )
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

  // Register workgraph test fakes (per ADR-0008: Module Registration Function Pattern)
  registerWorkgraphTestServices(childContainer);

  // Register FakeWorkUnitService for positional-graph tests (Plan 029: Phase 3)
  // Per Critical Insight #5: Wire both WORKUNIT_SERVICE and WORK_UNIT_LOADER to same fake
  const fakeWorkUnitService = new FakeWorkUnitService();
  childContainer.register<IWorkUnitService>(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE, {
    useValue: fakeWorkUnitService,
  });
  childContainer.register<IWorkUnitLoader>(POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_LOADER, {
    useValue: fakeWorkUnitService,
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

  // Fake git worktree manager (Plan 069)
  const fakeGitWorktreeManager = new FakeGitWorktreeManager();
  childContainer.register<IGitWorktreeManager>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_MANAGER, {
    useValue: fakeGitWorktreeManager,
  });

  // Note: For CLI tests, we use real services with fake adapters per DYK-P5-03
  childContainer.register<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE, {
    useFactory: (c) =>
      new WorkspaceService(
        c.resolve<IWorkspaceRegistryAdapter>(WORKSPACE_DI_TOKENS.WORKSPACE_REGISTRY_ADAPTER),
        c.resolve<IWorkspaceContextResolver>(WORKSPACE_DI_TOKENS.WORKSPACE_CONTEXT_RESOLVER),
        c.resolve<IGitWorktreeResolver>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER),
        c.resolve<IGitWorktreeManager>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_MANAGER),
        new WorktreeBootstrapRunner(
          c.resolve<IProcessManager>(SHARED_DI_TOKENS.PROCESS_MANAGER),
          c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM)
        )
      ),
  });

  childContainer.register<ISampleService>(WORKSPACE_DI_TOKENS.SAMPLE_SERVICE, {
    useFactory: (c) =>
      new SampleService(c.resolve<ISampleAdapter>(WORKSPACE_DI_TOKENS.SAMPLE_ADAPTER)),
  });

  return childContainer;
}
