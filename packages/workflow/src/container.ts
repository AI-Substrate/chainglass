/**
 * Dependency Injection Container for @chainglass/workflow
 *
 * Per Critical Discovery 05: Use useFactory for all registrations.
 * Per Critical Discovery 04: Child container pattern for test isolation.
 */

import 'reflect-metadata';
import { type DependencyContainer, container } from 'tsyringe';
import {
  SHARED_DI_TOKENS,
  WORKFLOW_DI_TOKENS,
  type IFileSystem,
  type IPathResolver,
  type ILogger,
  NodeFileSystemAdapter,
  PathResolverAdapter,
  FakeFileSystem,
  FakePathResolver,
  FakeLogger,
} from '@chainglass/shared';
import type { IYamlParser, ISchemaValidator } from './interfaces/index.js';
import { YamlParserAdapter } from './adapters/yaml-parser.adapter.js';
import { SchemaValidatorAdapter } from './adapters/schema-validator.adapter.js';
import { FakeYamlParser } from './fakes/fake-yaml-parser.js';
import { FakeSchemaValidator } from './fakes/fake-schema-validator.js';

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

  return childContainer;
}
