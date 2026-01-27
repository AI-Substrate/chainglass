/**
 * WorkGraph DI Container Factories.
 *
 * Per Critical Discovery 01: Use child containers with useFactory pattern.
 * These factories create isolated containers for production and testing.
 */

import 'reflect-metadata';
import {
  type IFileSystem,
  type IPathResolver,
  type IYamlParser,
  SHARED_DI_TOKENS,
  WORKGRAPH_DI_TOKENS,
} from '@chainglass/shared';
import { type DependencyContainer, container } from 'tsyringe';

import { FakeWorkGraphService } from './fakes/fake-workgraph-service.js';
import { FakeWorkNodeService } from './fakes/fake-worknode-service.js';
import { FakeWorkUnitService } from './fakes/fake-workunit-service.js';

import type { IWorkGraphService } from './interfaces/workgraph-service.interface.js';
import type { IWorkNodeService } from './interfaces/worknode-service.interface.js';
import type { IWorkUnitService } from './interfaces/workunit-service.interface.js';
import { WorkUnitService } from './services/workunit.service.js';

// ============================================
// Production Container
// ============================================

/**
 * Create a production container for WorkGraph services.
 *
 * Per Critical Discovery 01: Returns a child container that can be
 * disposed without affecting the root container.
 *
 * Note: In Phase 1, we only have fakes. Real implementations
 * will be added in subsequent phases and registered here.
 *
 * @returns Child container with production registrations
 */
export function createWorkgraphProductionContainer(): DependencyContainer {
  const child = container.createChildContainer();

  // Register real WorkUnitService (Phase 2)
  // Dependencies must be registered in parent/shared container
  child.register<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      const yamlParser = c.resolve<IYamlParser>(SHARED_DI_TOKENS.YAML_PARSER);
      return new WorkUnitService(fs, pathResolver, yamlParser);
    },
  });

  // TODO: Register real WorkGraphService in Phase 3
  child.register<IWorkGraphService>(WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE, {
    useFactory: () => new FakeWorkGraphService(),
  });

  // TODO: Register real WorkNodeService in Phase 4
  child.register<IWorkNodeService>(WORKGRAPH_DI_TOKENS.WORKNODE_SERVICE, {
    useFactory: () => new FakeWorkNodeService(),
  });

  return child;
}

// ============================================
// Test Container
// ============================================

/**
 * Options for creating a test container.
 */
export interface TestContainerOptions {
  /** Pre-configured FakeWorkUnitService */
  workUnitService?: FakeWorkUnitService;
  /** Pre-configured FakeWorkGraphService */
  workGraphService?: FakeWorkGraphService;
  /** Pre-configured FakeWorkNodeService */
  workNodeService?: FakeWorkNodeService;
}

/**
 * Create a test container with fakes for WorkGraph services.
 *
 * Per Critical Discovery 01: Returns a child container with
 * pre-configured fakes that can be customized via options.
 *
 * @param options - Optional pre-configured fakes
 * @returns Child container with test registrations
 */
export function createWorkgraphTestContainer(
  options: TestContainerOptions = {}
): DependencyContainer {
  const child = container.createChildContainer();

  // Use provided fakes or create new ones
  const workUnitService = options.workUnitService ?? new FakeWorkUnitService();
  const workGraphService = options.workGraphService ?? new FakeWorkGraphService();
  const workNodeService = options.workNodeService ?? new FakeWorkNodeService();

  // Register fakes with useValue for direct instance access
  child.register<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE, {
    useValue: workUnitService,
  });

  child.register<IWorkGraphService>(WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE, {
    useValue: workGraphService,
  });

  child.register<IWorkNodeService>(WORKGRAPH_DI_TOKENS.WORKNODE_SERVICE, {
    useValue: workNodeService,
  });

  return child;
}

// ============================================
// Container Utilities
// ============================================

/**
 * Get the FakeWorkUnitService from a test container.
 *
 * @param container - Test container created by createWorkgraphTestContainer
 * @returns FakeWorkUnitService instance
 */
export function getFakeWorkUnitService(container: DependencyContainer): FakeWorkUnitService {
  return container.resolve<FakeWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE);
}

/**
 * Get the FakeWorkGraphService from a test container.
 *
 * @param container - Test container created by createWorkgraphTestContainer
 * @returns FakeWorkGraphService instance
 */
export function getFakeWorkGraphService(container: DependencyContainer): FakeWorkGraphService {
  return container.resolve<FakeWorkGraphService>(WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE);
}

/**
 * Get the FakeWorkNodeService from a test container.
 *
 * @param container - Test container created by createWorkgraphTestContainer
 * @returns FakeWorkNodeService instance
 */
export function getFakeWorkNodeService(container: DependencyContainer): FakeWorkNodeService {
  return container.resolve<FakeWorkNodeService>(WORKGRAPH_DI_TOKENS.WORKNODE_SERVICE);
}
