/**
 * Dependency Injection Container for @chainglass/workflow
 *
 * Per Critical Discovery 05: Use useFactory for all registrations.
 * Per Critical Discovery 04: Child container pattern for test isolation.
 */

import 'reflect-metadata';
import {
  FakeFileSystem,
  FakeLogger,
  FakePathResolver,
  type IFileSystem,
  type ILogger,
  type IPathResolver,
  NodeFileSystemAdapter,
  PathResolverAdapter,
  SHARED_DI_TOKENS,
  WORKFLOW_DI_TOKENS,
} from '@chainglass/shared';
import { type DependencyContainer, container } from 'tsyringe';
import { SchemaValidatorAdapter } from './adapters/schema-validator.adapter.js';
import { YamlParserAdapter } from './adapters/yaml-parser.adapter.js';
import { FakePhaseService } from './fakes/fake-phase-service.js';
import { FakeSchemaValidator } from './fakes/fake-schema-validator.js';
import { FakeWorkflowService } from './fakes/fake-workflow-service.js';
import { FakeYamlParser } from './fakes/fake-yaml-parser.js';
import type {
  IPhaseService,
  ISchemaValidator,
  IWorkflowService,
  IYamlParser,
} from './interfaces/index.js';
import { PhaseService } from './services/phase.service.js';
import { WorkflowService } from './services/workflow.service.js';

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

  // Register workflow service (depends on other interfaces)
  childContainer.register<IWorkflowService>(WORKFLOW_DI_TOKENS.WORKFLOW_SERVICE, {
    useFactory: (c) =>
      new WorkflowService(
        c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
        c.resolve<IYamlParser>(WORKFLOW_DI_TOKENS.YAML_PARSER),
        c.resolve<ISchemaValidator>(WORKFLOW_DI_TOKENS.SCHEMA_VALIDATOR),
        c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER)
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

  return childContainer;
}
