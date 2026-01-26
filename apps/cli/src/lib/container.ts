/**
 * CLI Dependency Injection Container
 *
 * Per Critical Discovery 04 and ADR-0004: Child container factory pattern.
 * Creates fresh child containers for production and test use.
 * Does NOT use singleton pattern - each call returns new container.
 */

import 'reflect-metadata';
import {
  ConsoleOutputAdapter,
  FakeFileSystem,
  FakeHashGenerator,
  FakeLogger,
  FakeOutputAdapter,
  FakePathResolver,
  HashGeneratorAdapter,
  type IFileSystem,
  type IHashGenerator,
  type ILogger,
  type IOutputAdapter,
  type IPathResolver,
  JsonOutputAdapter,
  NodeFileSystemAdapter,
  PathResolverAdapter,
  PinoLoggerAdapter,
  SHARED_DI_TOKENS,
  WORKFLOW_DI_TOKENS,
} from '@chainglass/shared';
import {
  FakePhaseAdapter,
  FakePhaseService,
  FakeSchemaValidator,
  FakeWorkflowAdapter,
  FakeWorkflowRegistry,
  FakeWorkflowService,
  FakeYamlParser,
  type IPhaseAdapter,
  type IPhaseService,
  type ISchemaValidator,
  type IWorkflowAdapter,
  type IWorkflowRegistry,
  type IWorkflowService,
  type IYamlParser,
  PhaseService,
  SchemaValidatorAdapter,
  WorkflowRegistryService,
  WorkflowService,
  YamlParserAdapter,
} from '@chainglass/workflow';
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

  // Register output adapters
  childContainer.register<IOutputAdapter>(CLI_DI_TOKENS.OUTPUT_ADAPTER_JSON, {
    useFactory: () => new JsonOutputAdapter(),
  });

  childContainer.register<IOutputAdapter>(CLI_DI_TOKENS.OUTPUT_ADAPTER_CONSOLE, {
    useFactory: () => new ConsoleOutputAdapter(),
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

  return childContainer;
}
