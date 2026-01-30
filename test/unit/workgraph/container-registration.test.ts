/**
 * Tests for ADR-0008: Module Registration Function Pattern.
 *
 * Verifies that registerWorkgraphServices() correctly registers
 * workgraph services into an external container.
 */

import 'reflect-metadata';
import {
  FakeFileSystem,
  FakePathResolver,
  SHARED_DI_TOKENS,
  WORKFLOW_DI_TOKENS,
  WORKGRAPH_DI_TOKENS,
} from '@chainglass/shared';
import { FakeYamlParser } from '@chainglass/workflow';
import {
  type IWorkGraphService,
  type IWorkNodeService,
  type IWorkUnitService,
  registerWorkgraphServices,
  registerWorkgraphTestServices,
} from '@chainglass/workgraph';
import { type DependencyContainer, container } from 'tsyringe';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('ADR-0008: Module Registration Function Pattern', () => {
  let testContainer: DependencyContainer;

  beforeEach(() => {
    testContainer = container.createChildContainer();
  });

  afterEach(() => {
    testContainer.clearInstances();
  });

  describe('registerWorkgraphServices()', () => {
    it('should register all workgraph services into a container with prerequisites', () => {
      /*
      Test Doc:
      - Why: Verify ADR-0008 pattern works for external consumer containers
      - Contract: registerWorkgraphServices() registers WORKUNIT_SERVICE, WORKGRAPH_SERVICE, WORKNODE_SERVICE
      - Usage Notes: Consumer must register FILESYSTEM, PATH_RESOLVER, YAML_PARSER first
      - Quality Contribution: Prevents DI resolution failures in CLI/Web/MCP
      - Worked Example: CLI container calls registerWorkgraphServices() after shared deps
      */

      // Arrange: Register prerequisites (like CLI would)
      testContainer.register(SHARED_DI_TOKENS.FILESYSTEM, {
        useFactory: () => new FakeFileSystem(),
      });
      testContainer.register(SHARED_DI_TOKENS.PATH_RESOLVER, {
        useFactory: () => new FakePathResolver(),
      });
      testContainer.register(WORKFLOW_DI_TOKENS.YAML_PARSER, {
        useFactory: () => new FakeYamlParser(),
      });

      // Act: Call registration function
      registerWorkgraphServices(testContainer, WORKFLOW_DI_TOKENS.YAML_PARSER);

      // Assert: All services can be resolved
      const workUnitService = testContainer.resolve<IWorkUnitService>(
        WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE
      );
      const workGraphService = testContainer.resolve<IWorkGraphService>(
        WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE
      );
      const workNodeService = testContainer.resolve<IWorkNodeService>(
        WORKGRAPH_DI_TOKENS.WORKNODE_SERVICE
      );

      expect(workUnitService).toBeDefined();
      expect(workGraphService).toBeDefined();
      expect(workNodeService).toBeDefined();
    });
  });

  describe('registerWorkgraphTestServices()', () => {
    it('should register all workgraph fakes into a container', () => {
      /*
      Test Doc:
      - Why: Verify ADR-0008 pattern works for test containers
      - Contract: registerWorkgraphTestServices() registers fakes for all workgraph services
      - Usage Notes: No prerequisites needed - fakes are self-contained
      - Quality Contribution: Enables isolated testing without real dependencies
      - Worked Example: Test container calls registerWorkgraphTestServices()
      */

      // Act: Call test registration function
      registerWorkgraphTestServices(testContainer);

      // Assert: All fake services can be resolved
      const workUnitService = testContainer.resolve<IWorkUnitService>(
        WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE
      );
      const workGraphService = testContainer.resolve<IWorkGraphService>(
        WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE
      );
      const workNodeService = testContainer.resolve<IWorkNodeService>(
        WORKGRAPH_DI_TOKENS.WORKNODE_SERVICE
      );

      expect(workUnitService).toBeDefined();
      expect(workGraphService).toBeDefined();
      expect(workNodeService).toBeDefined();
    });
  });
});
