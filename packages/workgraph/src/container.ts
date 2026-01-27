/**
 * WorkGraph DI Container Factories.
 *
 * Per Critical Discovery 01: Use child containers with useFactory pattern.
 * These factories create isolated containers for production and testing.
 */

import 'reflect-metadata';
import { WORKGRAPH_DI_TOKENS } from '@chainglass/shared';
import { type DependencyContainer, container } from 'tsyringe';

import { FakeWorkGraphService } from './fakes/fake-workgraph-service.js';
import { FakeWorkNodeService } from './fakes/fake-worknode-service.js';
import { FakeWorkUnitService } from './fakes/fake-workunit-service.js';

import type { IWorkGraphService } from './interfaces/workgraph-service.interface.js';
import type { IWorkNodeService } from './interfaces/worknode-service.interface.js';
import type { IWorkUnitService } from './interfaces/workunit-service.interface.js';

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

  // TODO: Register real implementations in Phase 2+
  // For now, use fakes as placeholders to verify container wiring

  child.register<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE, {
    useFactory: () => new FakeWorkUnitService(),
  });

  child.register<IWorkGraphService>(WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE, {
    useFactory: () => new FakeWorkGraphService(),
  });

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
