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
import { BootstrapPromptService } from './services/bootstrap-prompt.js';
import { WorkGraphService } from './services/workgraph.service.js';
import { WorkNodeService } from './services/worknode.service.js';
import { WorkUnitService } from './services/workunit.service.js';

// ============================================
// Module Registration Function (ADR-0008)
// ============================================

/**
 * Register workgraph services into an existing container.
 *
 * Per ADR-0008: Module Registration Function Pattern.
 * This allows consumers (CLI, Web, MCP) to opt-in to workgraph services
 * without duplicating registration logic.
 *
 * @requires SHARED_DI_TOKENS.FILESYSTEM - IFileSystem must be registered
 * @requires SHARED_DI_TOKENS.PATH_RESOLVER - IPathResolver must be registered
 * @requires SHARED_DI_TOKENS.YAML_PARSER (or WORKFLOW_DI_TOKENS.YAML_PARSER) - IYamlParser must be registered
 *
 * @param container - The container to register services into
 * @param yamlParserToken - Token to use for resolving IYamlParser (defaults to SHARED_DI_TOKENS.YAML_PARSER)
 */
export function registerWorkgraphServices(
  targetContainer: DependencyContainer,
  yamlParserToken: string = SHARED_DI_TOKENS.YAML_PARSER
): void {
  // Register WorkUnitService
  targetContainer.register<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      const yamlParser = c.resolve<IYamlParser>(yamlParserToken);
      return new WorkUnitService(fs, pathResolver, yamlParser);
    },
  });

  // Register WorkGraphService (depends on WorkUnitService)
  targetContainer.register<IWorkGraphService>(WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      const yamlParser = c.resolve<IYamlParser>(yamlParserToken);
      const workUnitService = c.resolve<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE);
      return new WorkGraphService(fs, pathResolver, yamlParser, workUnitService);
    },
  });

  // Register WorkNodeService (depends on WorkGraphService and WorkUnitService)
  targetContainer.register<IWorkNodeService>(WORKGRAPH_DI_TOKENS.WORKNODE_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      const workGraphService = c.resolve<IWorkGraphService>(WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE);
      const workUnitService = c.resolve<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE);
      return new WorkNodeService(fs, pathResolver, workGraphService, workUnitService);
    },
  });

  // Register BootstrapPromptService (depends on WorkGraphService and WorkUnitService)
  // Per Plan 021 Phase 4 T005a: ADR-0004 compliance - services resolved from containers
  targetContainer.register<BootstrapPromptService>(WORKGRAPH_DI_TOKENS.BOOTSTRAP_PROMPT_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      const workGraphService = c.resolve<IWorkGraphService>(WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE);
      const workUnitService = c.resolve<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE);
      return new BootstrapPromptService(fs, pathResolver, workGraphService, workUnitService);
    },
  });
}

/**
 * Register workgraph test fakes into an existing container.
 *
 * Per ADR-0008: Module Registration Function Pattern.
 * For test containers that need workgraph fakes.
 *
 * @param container - The container to register fakes into
 * @param options - Optional pre-configured fakes
 */
export function registerWorkgraphTestServices(
  targetContainer: DependencyContainer,
  options: TestContainerOptions = {}
): void {
  const workUnitService = options.workUnitService ?? new FakeWorkUnitService();
  const workGraphService = options.workGraphService ?? new FakeWorkGraphService();
  const workNodeService = options.workNodeService ?? new FakeWorkNodeService();

  targetContainer.register<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE, {
    useValue: workUnitService,
  });

  targetContainer.register<IWorkGraphService>(WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE, {
    useValue: workGraphService,
  });

  targetContainer.register<IWorkNodeService>(WORKGRAPH_DI_TOKENS.WORKNODE_SERVICE, {
    useValue: workNodeService,
  });
}

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

  // Real WorkGraphService (Phase 3 + Phase 4)
  // Per DYK#2: Pass IWorkUnitService to WorkGraphService for addNodeAfter validation
  child.register<IWorkGraphService>(WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      const yamlParser = c.resolve<IYamlParser>(SHARED_DI_TOKENS.YAML_PARSER);
      const workUnitService = c.resolve<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE);
      return new WorkGraphService(fs, pathResolver, yamlParser, workUnitService);
    },
  });

  // Real WorkNodeService (Phase 5)
  // Per DYK#6: markReady() for orchestrator control
  // Per DYK#7: WorkNodeService owns state.json after creation
  child.register<IWorkNodeService>(WORKGRAPH_DI_TOKENS.WORKNODE_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      const workGraphService = c.resolve<IWorkGraphService>(WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE);
      const workUnitService = c.resolve<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE);
      return new WorkNodeService(fs, pathResolver, workGraphService, workUnitService);
    },
  });

  // Real BootstrapPromptService (Plan 021 Phase 4 T005a)
  // Per ADR-0004: Services resolved from containers, not instantiated directly
  child.register<BootstrapPromptService>(WORKGRAPH_DI_TOKENS.BOOTSTRAP_PROMPT_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const fs = c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
      const pathResolver = c.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
      const workGraphService = c.resolve<IWorkGraphService>(WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE);
      const workUnitService = c.resolve<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE);
      return new BootstrapPromptService(fs, pathResolver, workGraphService, workUnitService);
    },
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
