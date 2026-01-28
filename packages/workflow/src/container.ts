/**
 * Dependency Injection Container for @chainglass/workflow
 *
 * Per Critical Discovery 05: Use useFactory for all registrations.
 * Per Critical Discovery 04: Child container pattern for test isolation.
 */

import 'reflect-metadata';
import {
  FakeFileSystem,
  FakeHashGenerator,
  FakeLogger,
  FakePathResolver,
  FakeProcessManager,
  HashGeneratorAdapter,
  type IFileSystem,
  type IHashGenerator,
  type ILogger,
  type IPathResolver,
  type IProcessManager,
  NodeFileSystemAdapter,
  PathResolverAdapter,
  ProcessManagerAdapter,
  SHARED_DI_TOKENS,
  WORKFLOW_DI_TOKENS,
  WORKSPACE_DI_TOKENS,
} from '@chainglass/shared';
import { type DependencyContainer, container } from 'tsyringe';
import { AgentSessionAdapter } from './adapters/agent-session.adapter.js';
import { PhaseAdapter } from './adapters/phase.adapter.js';
import { SampleAdapter } from './adapters/sample.adapter.js';
import { SchemaValidatorAdapter } from './adapters/schema-validator.adapter.js';
import { WorkflowAdapter } from './adapters/workflow.adapter.js';
import { WorkspaceRegistryAdapter } from './adapters/workspace-registry.adapter.js';
import { YamlParserAdapter } from './adapters/yaml-parser.adapter.js';
import { FakeAgentSessionAdapter } from './fakes/fake-agent-session-adapter.js';
import { FakeGitWorktreeResolver } from './fakes/fake-git-worktree-resolver.js';
import { FakePhaseAdapter } from './fakes/fake-phase-adapter.js';
import { FakePhaseService } from './fakes/fake-phase-service.js';
import { FakeSampleAdapter } from './fakes/fake-sample-adapter.js';
import { FakeSchemaValidator } from './fakes/fake-schema-validator.js';
import { FakeWorkflowAdapter } from './fakes/fake-workflow-adapter.js';
import { FakeWorkflowRegistry } from './fakes/fake-workflow-registry.js';
import { FakeWorkflowService } from './fakes/fake-workflow-service.js';
import { FakeWorkspaceContextResolver } from './fakes/fake-workspace-context-resolver.js';
import { FakeWorkspaceRegistryAdapter } from './fakes/fake-workspace-registry-adapter.js';
import { FakeYamlParser } from './fakes/fake-yaml-parser.js';
import type { IAgentSessionAdapter } from './interfaces/agent-session-adapter.interface.js';
import type { IAgentSessionService } from './interfaces/agent-session-service.interface.js';
import type { IGitWorktreeResolver } from './interfaces/git-worktree-resolver.interface.js';
import type {
  IPhaseAdapter,
  IPhaseService,
  ISampleAdapter,
  ISchemaValidator,
  IWorkflowAdapter,
  IWorkflowRegistry,
  IWorkflowService,
  IWorkspaceContextResolver,
  IWorkspaceRegistryAdapter,
  IYamlParser,
} from './interfaces/index.js';
import type { ISampleService } from './interfaces/sample-service.interface.js';
import type { IWorkspaceService } from './interfaces/workspace-service.interface.js';
import { GitWorktreeResolver } from './resolvers/git-worktree.resolver.js';
import { WorkspaceContextResolver } from './resolvers/workspace-context.resolver.js';
import { AgentSessionService } from './services/agent-session.service.js';
import { PhaseService } from './services/phase.service.js';
import { SampleService } from './services/sample.service.js';
import { WorkflowRegistryService } from './services/workflow-registry.service.js';
import { WorkflowService } from './services/workflow.service.js';
import { WorkspaceService } from './services/workspace.service.js';

/**
 * Creates a production DI container for workflow services.
 *
 * Registers all production adapters:
 * - NodeFileSystemAdapter for IFileSystem
 * - PathResolverAdapter for IPathResolver
 * - YamlParserAdapter for IYamlParser
 * - SchemaValidatorAdapter for ISchemaValidator
 *
 * @returns Child container with production registrations
 */
export function createWorkflowProductionContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  // Register shared interfaces
  childContainer.register<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM, {
    useFactory: () => new NodeFileSystemAdapter(),
  });

  childContainer.register<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER, {
    useFactory: () => new PathResolverAdapter(),
  });

  // Register workflow interfaces
  childContainer.register<IYamlParser>(WORKFLOW_DI_TOKENS.YAML_PARSER, {
    useFactory: () => new YamlParserAdapter(),
  });

  childContainer.register<ISchemaValidator>(WORKFLOW_DI_TOKENS.SCHEMA_VALIDATOR, {
    useFactory: () => new SchemaValidatorAdapter(),
  });

  // Register hash generator for checkpoint content hashing (Phase 2)
  childContainer.register<IHashGenerator>(WORKFLOW_DI_TOKENS.HASH_GENERATOR, {
    useFactory: () => new HashGeneratorAdapter(),
  });

  // Register workflow registry service first (Phase 1: Manage Workflows)
  childContainer.register<IWorkflowRegistry>(WORKFLOW_DI_TOKENS.WORKFLOW_REGISTRY, {
    useFactory: (c) =>
      new WorkflowRegistryService(
        c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
        c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER),
        c.resolve<IYamlParser>(WORKFLOW_DI_TOKENS.YAML_PARSER),
        c.resolve<IHashGenerator>(WORKFLOW_DI_TOKENS.HASH_GENERATOR)
      ),
  });

  // Register workflow service (depends on other interfaces including registry - Phase 3 DYK-01)
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

  // Register phase service (per Phase 3)
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

  // ==================== Workspace Service Registrations (Plan 014 Phase 4) ====================

  // Register process manager for git operations
  childContainer.register<IProcessManager>(SHARED_DI_TOKENS.PROCESS_MANAGER, {
    useFactory: () => new ProcessManagerAdapter(),
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

  // Register git worktree resolver
  childContainer.register<IGitWorktreeResolver>(WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER, {
    useFactory: (c) =>
      new GitWorktreeResolver(c.resolve<IProcessManager>(SHARED_DI_TOKENS.PROCESS_MANAGER)),
  });

  // Register workspace context resolver
  childContainer.register<IWorkspaceContextResolver>(
    WORKSPACE_DI_TOKENS.WORKSPACE_CONTEXT_RESOLVER,
    {
      useFactory: (c) =>
        new WorkspaceContextResolver(
          c.resolve<IWorkspaceRegistryAdapter>(WORKSPACE_DI_TOKENS.WORKSPACE_REGISTRY_ADAPTER),
          c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM)
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

  // Register sample service
  childContainer.register<ISampleService>(WORKSPACE_DI_TOKENS.SAMPLE_SERVICE, {
    useFactory: (c) =>
      new SampleService(c.resolve<ISampleAdapter>(WORKSPACE_DI_TOKENS.SAMPLE_ADAPTER)),
  });

  // ==================== Agent Session Service Registrations (Plan 018) ====================

  // Register agent session adapter
  childContainer.register<IAgentSessionAdapter>(WORKSPACE_DI_TOKENS.AGENT_SESSION_ADAPTER, {
    useFactory: (c) =>
      new AgentSessionAdapter(
        c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
        c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER)
      ),
  });

  // Register agent session service
  childContainer.register<IAgentSessionService>(WORKSPACE_DI_TOKENS.AGENT_SESSION_SERVICE, {
    useFactory: (c) =>
      new AgentSessionService(
        c.resolve<IAgentSessionAdapter>(WORKSPACE_DI_TOKENS.AGENT_SESSION_ADAPTER)
      ),
  });

  return childContainer;
}

/**
 * Creates a test DI container for workflow services with fake implementations.
 *
 * Each call returns a new isolated child container to prevent
 * state leakage between tests.
 *
 * @returns Child container with test registrations (fakes)
 */
export function createWorkflowTestContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();

  // Create shared fake instances for this container
  const fakeLogger = new FakeLogger();
  const fakeFileSystem = new FakeFileSystem();
  const fakePathResolver = new FakePathResolver();
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

  // Register workflow interface fakes
  childContainer.register<IYamlParser>(WORKFLOW_DI_TOKENS.YAML_PARSER, {
    useValue: fakeYamlParser,
  });

  childContainer.register<ISchemaValidator>(WORKFLOW_DI_TOKENS.SCHEMA_VALIDATOR, {
    useValue: fakeSchemaValidator,
  });

  // Register fake workflow service
  const fakeWorkflowService = new FakeWorkflowService();
  childContainer.register<IWorkflowService>(WORKFLOW_DI_TOKENS.WORKFLOW_SERVICE, {
    useValue: fakeWorkflowService,
  });

  // Register fake phase service (per Phase 3)
  const fakePhaseService = new FakePhaseService();
  childContainer.register<IPhaseService>(WORKFLOW_DI_TOKENS.PHASE_SERVICE, {
    useValue: fakePhaseService,
  });

  // Register fake workflow registry (per Phase 1: Manage Workflows)
  const fakeWorkflowRegistry = new FakeWorkflowRegistry();
  childContainer.register<IWorkflowRegistry>(WORKFLOW_DI_TOKENS.WORKFLOW_REGISTRY, {
    useValue: fakeWorkflowRegistry,
  });

  // Register fake workflow adapter (per Plan 010: Entity Upgrade Phase 2)
  // Note: Unit tests typically instantiate FakeWorkflowAdapter directly for fine-grained control.
  // Container registration is for integration tests and CLI testing where DI is used.
  const fakeWorkflowAdapter = new FakeWorkflowAdapter();
  childContainer.register<IWorkflowAdapter>(WORKFLOW_DI_TOKENS.WORKFLOW_ADAPTER, {
    useValue: fakeWorkflowAdapter,
  });

  // Register fake phase adapter (per Plan 010: Entity Upgrade Phase 2)
  const fakePhaseAdapter = new FakePhaseAdapter();
  childContainer.register<IPhaseAdapter>(WORKFLOW_DI_TOKENS.PHASE_ADAPTER, {
    useValue: fakePhaseAdapter,
  });

  // ==================== Workspace Service Fakes (Plan 014 Phase 4) ====================

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
      new SampleService(c.resolve<ISampleAdapter>(WORKSPACE_DI_TOKENS.SAMPLE_ADAPTER)),
  });

  // ==================== Agent Session Service Fakes (Plan 018) ====================

  // Register fake agent session adapter
  const fakeAgentSessionAdapter = new FakeAgentSessionAdapter();
  childContainer.register<IAgentSessionAdapter>(WORKSPACE_DI_TOKENS.AGENT_SESSION_ADAPTER, {
    useValue: fakeAgentSessionAdapter,
  });

  // Register agent session service with fake adapter
  childContainer.register<IAgentSessionService>(WORKSPACE_DI_TOKENS.AGENT_SESSION_SERVICE, {
    useFactory: (c) =>
      new AgentSessionService(
        c.resolve<IAgentSessionAdapter>(WORKSPACE_DI_TOKENS.AGENT_SESSION_ADAPTER)
      ),
  });

  return childContainer;
}
