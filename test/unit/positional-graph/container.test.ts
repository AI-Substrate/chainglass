/**
 * DI Container Resolution Tests for positional-graph
 *
 * Verifies that IWorkUnitService and IWorkUnitLoader resolve correctly
 * from the DI container after registration.
 *
 * Per Plan 029: Agentic Work Units — Phase 3, Task T009.
 */

import 'reflect-metadata';
import {
  type IWorkUnitService,
  WorkUnitAdapter,
  WorkUnitService,
  registerPositionalGraphServices,
} from '@chainglass/positional-graph';
import type { IWorkUnitLoader } from '@chainglass/positional-graph';
import {
  FakeFileSystem,
  FakePathResolver,
  POSITIONAL_GRAPH_DI_TOKENS,
  SHARED_DI_TOKENS,
} from '@chainglass/shared';
import { FakeYamlParser } from '@chainglass/workflow';
import { type DependencyContainer, container } from 'tsyringe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('positional-graph DI container', () => {
  let childContainer: DependencyContainer;

  beforeEach(() => {
    // Create fresh child container for test isolation
    childContainer = container.createChildContainer();

    // Register prerequisite shared tokens
    childContainer.register(SHARED_DI_TOKENS.FILESYSTEM, {
      useValue: new FakeFileSystem(),
    });
    childContainer.register(SHARED_DI_TOKENS.PATH_RESOLVER, {
      useValue: new FakePathResolver(),
    });
    childContainer.register(SHARED_DI_TOKENS.YAML_PARSER, {
      useValue: new FakeYamlParser(),
    });

    // Register the IWorkUnitLoader bridge before calling registerPositionalGraphServices
    // (in production, this is done by CLI container, here we simulate it)
    // Note: We need to register AFTER registerPositionalGraphServices is called
    // Per Critical Insight #1: order matters
  });

  afterEach(() => {
    childContainer.dispose();
  });

  describe('WorkUnitAdapter resolution', () => {
    beforeEach(() => {
      // Register positional-graph services first
      registerPositionalGraphServices(childContainer);
      // Then wire the bridge
      childContainer.register(POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_LOADER, {
        useFactory: (c) => c.resolve(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE),
      });
    });

    it('should resolve WorkUnitAdapter from WORKUNIT_ADAPTER token', () => {
      /*
      Test Doc:
      - Why: Verify DI registration for WorkUnitAdapter
      - Contract: WORKUNIT_ADAPTER token resolves to WorkUnitAdapter instance
      - Usage Notes: Adapter requires IFileSystem and IPathResolver
      - Quality Contribution: Catches missing/incorrect DI registration
      - Worked Example: container.resolve(WORKUNIT_ADAPTER) → WorkUnitAdapter instance
      */
      const adapter = childContainer.resolve<WorkUnitAdapter>(
        POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_ADAPTER
      );

      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(WorkUnitAdapter);
    });
  });

  describe('WorkUnitService resolution', () => {
    beforeEach(() => {
      // Register positional-graph services first
      registerPositionalGraphServices(childContainer);
      // Then wire the bridge
      childContainer.register(POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_LOADER, {
        useFactory: (c) => c.resolve(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE),
      });
    });

    it('should resolve IWorkUnitService from WORKUNIT_SERVICE token', () => {
      /*
      Test Doc:
      - Why: Verify DI registration for IWorkUnitService
      - Contract: WORKUNIT_SERVICE token resolves to WorkUnitService instance
      - Usage Notes: Service requires WorkUnitAdapter, IFileSystem, IYamlParser
      - Quality Contribution: Catches missing/incorrect DI registration
      - Worked Example: container.resolve(WORKUNIT_SERVICE) → WorkUnitService instance
      */
      const service = childContainer.resolve<IWorkUnitService>(
        POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE
      );

      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(WorkUnitService);
    });

    it('should resolve IWorkUnitLoader from WORK_UNIT_LOADER token (bridge)', () => {
      /*
      Test Doc:
      - Why: Verify IWorkUnitLoader bridge is wired to WorkUnitService
      - Contract: WORK_UNIT_LOADER token resolves to same WorkUnitService instance
      - Usage Notes: Per Critical Insight #5 - both tokens resolve to same implementation
      - Quality Contribution: Verifies backward compatibility bridge works
      - Worked Example: container.resolve(WORK_UNIT_LOADER) → WorkUnitService instance
      */
      const loader = childContainer.resolve<IWorkUnitLoader>(
        POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_LOADER
      );

      expect(loader).toBeDefined();
      expect(loader).toBeInstanceOf(WorkUnitService);
    });

    it('should return distinct instances for each resolution (transient)', () => {
      /*
      Test Doc:
      - Why: Verify default transient lifetime (not singleton)
      - Contract: Each resolve() call returns a new instance
      - Usage Notes: Per ADR-0004: use transient by default unless explicitly singleton
      - Quality Contribution: Catches accidental singleton registration
      - Worked Example: resolve() twice → two different instances
      */
      const service1 = childContainer.resolve<IWorkUnitService>(
        POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE
      );
      const service2 = childContainer.resolve<IWorkUnitService>(
        POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE
      );

      expect(service1).not.toBe(service2);
    });
  });

  describe('container isolation', () => {
    it('should provide isolated instances in child containers', () => {
      /*
      Test Doc:
      - Why: Verify child container isolation for tests
      - Contract: Different child containers have independent instances
      - Usage Notes: Important for test isolation
      - Quality Contribution: Catches shared state between tests
      - Worked Example: Two child containers → independent service instances
      */
      // First child container
      registerPositionalGraphServices(childContainer);
      childContainer.register(POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_LOADER, {
        useFactory: (c) => c.resolve(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE),
      });
      const service1 = childContainer.resolve<IWorkUnitService>(
        POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE
      );

      // Second child container
      const childContainer2 = container.createChildContainer();
      childContainer2.register(SHARED_DI_TOKENS.FILESYSTEM, {
        useValue: new FakeFileSystem(),
      });
      childContainer2.register(SHARED_DI_TOKENS.PATH_RESOLVER, {
        useValue: new FakePathResolver(),
      });
      childContainer2.register(SHARED_DI_TOKENS.YAML_PARSER, {
        useValue: new FakeYamlParser(),
      });
      registerPositionalGraphServices(childContainer2);
      childContainer2.register(POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_LOADER, {
        useFactory: (c) => c.resolve(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE),
      });
      const service2 = childContainer2.resolve<IWorkUnitService>(
        POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE
      );

      expect(service1).not.toBe(service2);

      childContainer2.dispose();
    });
  });

  describe('service interface contracts', () => {
    beforeEach(() => {
      registerPositionalGraphServices(childContainer);
      childContainer.register(POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_LOADER, {
        useFactory: (c) => c.resolve(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE),
      });
    });

    it('IWorkUnitService has list method', () => {
      /*
      Test Doc:
      - Why: Verify resolved service has expected interface
      - Contract: IWorkUnitService.list() method exists
      - Usage Notes: list() returns Promise<ListUnitsResult>
      - Quality Contribution: Catches interface mismatches
      - Worked Example: service.list → function
      */
      const service = childContainer.resolve<IWorkUnitService>(
        POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE
      );

      expect(typeof service.list).toBe('function');
    });

    it('IWorkUnitService has load method', () => {
      /*
      Test Doc:
      - Why: Verify resolved service has expected interface
      - Contract: IWorkUnitService.load() method exists
      - Usage Notes: load(ctx, slug) returns Promise<LoadUnitResult>
      - Quality Contribution: Catches interface mismatches
      - Worked Example: service.load → function
      */
      const service = childContainer.resolve<IWorkUnitService>(
        POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE
      );

      expect(typeof service.load).toBe('function');
    });

    it('IWorkUnitService has validate method', () => {
      /*
      Test Doc:
      - Why: Verify resolved service has expected interface
      - Contract: IWorkUnitService.validate() method exists
      - Usage Notes: validate(ctx, slug) returns Promise<ValidateUnitResult>
      - Quality Contribution: Catches interface mismatches
      - Worked Example: service.validate → function
      */
      const service = childContainer.resolve<IWorkUnitService>(
        POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE
      );

      expect(typeof service.validate).toBe('function');
    });

    it('IWorkUnitLoader (bridge) has load method for backward compatibility', () => {
      /*
      Test Doc:
      - Why: Verify bridge satisfies IWorkUnitLoader interface
      - Contract: IWorkUnitLoader.load() method exists
      - Usage Notes: Bridge enables collateInputs() to work unchanged
      - Quality Contribution: Catches breaking changes to narrow interface
      - Worked Example: loader.load → function
      */
      const loader = childContainer.resolve<IWorkUnitLoader>(
        POSITIONAL_GRAPH_DI_TOKENS.WORK_UNIT_LOADER
      );

      expect(typeof loader.load).toBe('function');
    });
  });
});
