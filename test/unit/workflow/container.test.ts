/**
 * Tests for DI container adapter registration.
 *
 * Per Phase 2 T007: Verify FakeWorkflowAdapter and FakePhaseAdapter
 * resolve correctly from test containers.
 *
 * Per DYK Session Insight 2: Document dual usage pattern:
 * - Unit tests: Instantiate fakes directly for fine-grained control
 * - Integration tests: Resolve from container for full DI stack
 */

import { WORKFLOW_DI_TOKENS } from '@chainglass/shared';
import {
  FakePhaseAdapter,
  FakeWorkflowAdapter,
  type IPhaseAdapter,
  type IWorkflowAdapter,
  createWorkflowTestContainer,
} from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';

describe('Workflow Test Container', () => {
  describe('adapter resolution', () => {
    it('should resolve FakeWorkflowAdapter from WORKFLOW_ADAPTER token', () => {
      /*
      Test Doc:
      - Why: Integration tests need adapters resolved from DI container
      - Contract: WORKFLOW_ADAPTER token resolves to FakeWorkflowAdapter instance
      - Usage Notes: For unit tests, prefer direct instantiation for fine-grained control
      - Quality Contribution: Verifies DI registration is correct
      - Worked Example: container.resolve(WORKFLOW_ADAPTER) → FakeWorkflowAdapter instance
      */
      const container = createWorkflowTestContainer();

      const adapter = container.resolve<IWorkflowAdapter>(WORKFLOW_DI_TOKENS.WORKFLOW_ADAPTER);

      expect(adapter).toBeInstanceOf(FakeWorkflowAdapter);
    });

    it('should resolve FakePhaseAdapter from PHASE_ADAPTER token', () => {
      /*
      Test Doc:
      - Why: Integration tests need adapters resolved from DI container
      - Contract: PHASE_ADAPTER token resolves to FakePhaseAdapter instance
      - Usage Notes: For unit tests, prefer direct instantiation for fine-grained control
      - Quality Contribution: Verifies DI registration is correct
      - Worked Example: container.resolve(PHASE_ADAPTER) → FakePhaseAdapter instance
      */
      const container = createWorkflowTestContainer();

      const adapter = container.resolve<IPhaseAdapter>(WORKFLOW_DI_TOKENS.PHASE_ADAPTER);

      expect(adapter).toBeInstanceOf(FakePhaseAdapter);
    });

    it('should return same instance within same container', () => {
      /*
      Test Doc:
      - Why: useValue registration means same instance is returned
      - Contract: Multiple resolves return same fake instance
      - Usage Notes: Allows configuring fake once, calling resolve multiple times
      - Quality Contribution: Verifies useValue semantics
      - Worked Example: resolve twice → same object reference
      */
      const container = createWorkflowTestContainer();

      const adapter1 = container.resolve<IWorkflowAdapter>(WORKFLOW_DI_TOKENS.WORKFLOW_ADAPTER);
      const adapter2 = container.resolve<IWorkflowAdapter>(WORKFLOW_DI_TOKENS.WORKFLOW_ADAPTER);

      expect(adapter1).toBe(adapter2);
    });

    it('should return different instances from different containers', () => {
      /*
      Test Doc:
      - Why: Each test should get isolated container to prevent leakage
      - Contract: Separate containers have separate fake instances
      - Usage Notes: Create fresh container in each test for isolation
      - Quality Contribution: Verifies child container isolation
      - Worked Example: Two containers → different adapter instances
      */
      const container1 = createWorkflowTestContainer();
      const container2 = createWorkflowTestContainer();

      const adapter1 = container1.resolve<IWorkflowAdapter>(WORKFLOW_DI_TOKENS.WORKFLOW_ADAPTER);
      const adapter2 = container2.resolve<IWorkflowAdapter>(WORKFLOW_DI_TOKENS.WORKFLOW_ADAPTER);

      expect(adapter1).not.toBe(adapter2);
    });
  });

  describe('adapter usage patterns', () => {
    it('should allow configuring resolved fake before use', async () => {
      /*
      Test Doc:
      - Why: Need to configure fake responses in integration tests
      - Contract: Can cast resolved adapter to fake and configure it
      - Usage Notes: Cast to FakeWorkflowAdapter to access configuration properties
      - Quality Contribution: Demonstrates integration test pattern
      - Worked Example: Resolve, cast to fake, set result, call method
      */
      const container = createWorkflowTestContainer();

      const adapter = container.resolve<IWorkflowAdapter>(
        WORKFLOW_DI_TOKENS.WORKFLOW_ADAPTER
      ) as FakeWorkflowAdapter;

      adapter.existsResult = true;

      const exists = await adapter.exists('test-wf');

      expect(exists).toBe(true);
    });
  });
});
