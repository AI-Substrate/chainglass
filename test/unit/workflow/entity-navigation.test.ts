/**
 * Entity graph navigation integration tests.
 *
 * Per Phase 3: Production Adapters.
 * Per plan 3.14: Tests Workflow → phases and Phase → parent Workflow navigation.
 *
 * Verifies that adapters can be used together to navigate the entity graph.
 */

import { FakeFileSystem, FakePathResolver } from '@chainglass/shared';
import {
  FakeYamlParser,
  Phase,
  PhaseAdapter,
  Workflow,
  WorkflowAdapter,
} from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ==================== Test Fixtures ====================

const WORKFLOWS_DIR = '.chainglass/workflows';
const SLUG = 'nav-test-wf';
const WORKFLOW_DIR = `${WORKFLOWS_DIR}/${SLUG}/current`;

// ==================== Test Suite ====================

describe('Entity Graph Navigation', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let yamlParser: FakeYamlParser;
  let workflowAdapter: WorkflowAdapter;
  let phaseAdapter: PhaseAdapter;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    yamlParser = new FakeYamlParser();
    workflowAdapter = new WorkflowAdapter(fs, pathResolver, yamlParser);
    phaseAdapter = new PhaseAdapter(fs, pathResolver, yamlParser);

    // Set up a workflow with multiple phases
    fs.setFile(
      `${WORKFLOW_DIR}/wf.yaml`,
      'name: nav-test-wf\nversion: "1.0.0"\ndescription: "Navigation test workflow"'
    );
    fs.setFile(
      `${WORKFLOWS_DIR}/${SLUG}/workflow.json`,
      JSON.stringify({ slug: SLUG, name: 'Navigation Test Workflow' })
    );

    // Set up phases
    fs.setFile(
      `${WORKFLOW_DIR}/gather/wf-phase.yaml`,
      'description: Gather data\norder: 1\noutputs: []'
    );
    fs.setFile(
      `${WORKFLOW_DIR}/process/wf-phase.yaml`,
      'description: Process data\norder: 2\noutputs: []'
    );
    fs.setFile(
      `${WORKFLOW_DIR}/report/wf-phase.yaml`,
      'description: Generate report\norder: 3\noutputs: []'
    );
  });

  describe('Workflow → Phases navigation', () => {
    it('should load workflow and then list its phases', async () => {
      /*
      Test Doc:
      - Why: Core navigation pattern for UI and CLI
      - Contract: Load workflow, use PhaseAdapter.listForWorkflow(workflow)
      - Usage Notes: Phases are loaded separately, not embedded in Workflow
      - Quality Contribution: Verifies adapter interoperability
      - Worked Example: loadCurrent() → listForWorkflow() → Phase[]
      */
      const workflow = await workflowAdapter.loadCurrent(SLUG);
      const phases = await phaseAdapter.listForWorkflow(workflow);

      expect(workflow).toBeInstanceOf(Workflow);
      expect(phases).toHaveLength(3);
      expect(phases[0].name).toBe('gather');
      expect(phases[1].name).toBe('process');
      expect(phases[2].name).toBe('report');
    });

    it('should return phases sorted by order', async () => {
      /*
      Test Doc:
      - Why: Phase order is critical for execution
      - Contract: listForWorkflow returns phases sorted by order
      - Quality Contribution: Verifies sort order is correct
      - Worked Example: phases[0].order < phases[1].order < phases[2].order
      */
      const workflow = await workflowAdapter.loadCurrent(SLUG);
      const phases = await phaseAdapter.listForWorkflow(workflow);

      expect(phases[0].order).toBe(1);
      expect(phases[1].order).toBe(2);
      expect(phases[2].order).toBe(3);
    });

    it('should allow sequential phase loading for detail views', async () => {
      /*
      Test Doc:
      - Why: UI might need to load phases individually with full detail
      - Contract: Can load individual phases via loadFromPath
      - Usage Notes: Use for detail views, not for listings
      - Quality Contribution: Verifies individual phase loading
      - Worked Example: loadFromPath(workflow.workflowDir + '/gather')
      */
      const workflow = await workflowAdapter.loadCurrent(SLUG);
      const gatherPhase = await phaseAdapter.loadFromPath(
        pathResolver.join(workflow.workflowDir, 'gather')
      );

      expect(gatherPhase).toBeInstanceOf(Phase);
      expect(gatherPhase.name).toBe('gather');
      expect(gatherPhase.description).toBe('Gather data');
    });
  });

  describe('Phase → Workflow navigation', () => {
    it('should have runDir pointing to parent workflow directory', async () => {
      /*
      Test Doc:
      - Why: Navigation from Phase back to parent Workflow
      - Contract: Phase.runDir === Workflow.workflowDir
      - Usage Notes: runDir is the parent workflow/run directory
      - Quality Contribution: Verifies bidirectional navigation
      - Worked Example: phase.runDir allows loading parent workflow
      */
      const workflow = await workflowAdapter.loadCurrent(SLUG);
      const phases = await phaseAdapter.listForWorkflow(workflow);

      // All phases should point back to the workflow directory
      for (const phase of phases) {
        expect(phase.runDir).toBe(workflow.workflowDir);
      }
    });

    it('should enable round-trip navigation', async () => {
      /*
      Test Doc:
      - Why: Should be able to navigate Workflow → Phase → Workflow
      - Contract: Can load phases, then use runDir to reference parent
      - Quality Contribution: Verifies complete navigation chain
      - Worked Example: workflow → phases → phase.runDir === workflow.workflowDir
      */
      // Load workflow
      const workflow = await workflowAdapter.loadCurrent(SLUG);

      // Navigate to phases
      const phases = await phaseAdapter.listForWorkflow(workflow);

      // Verify we can reference the parent
      const firstPhase = phases[0];
      expect(firstPhase.runDir).toBe(workflow.workflowDir);

      // The runDir can be used to identify/reload the parent workflow
      // (In practice, the workflow would be cached or re-loaded as needed)
      expect(workflow.workflowDir).toBe(firstPhase.runDir);
    });
  });

  describe('Multi-phase workflow patterns', () => {
    it('should support loading all phases then filtering client-side', async () => {
      /*
      Test Doc:
      - Why: UI might filter phases by status, facilitator, etc.
      - Contract: listForWorkflow returns all phases for filtering
      - Quality Contribution: Verifies filtering pattern works
      - Worked Example: phases.filter(p => p.status === 'pending')
      */
      const workflow = await workflowAdapter.loadCurrent(SLUG);
      const phases = await phaseAdapter.listForWorkflow(workflow);

      // All phases are 'pending' in template
      const pendingPhases = phases.filter((p) => p.status === 'pending');
      expect(pendingPhases).toHaveLength(3);

      // Filter by order range
      const earlyPhases = phases.filter((p) => p.order <= 2);
      expect(earlyPhases).toHaveLength(2);
    });

    it('should support finding specific phase by name', async () => {
      /*
      Test Doc:
      - Why: UI might need to jump to a specific phase
      - Contract: Can find phase by name in the list
      - Quality Contribution: Verifies name-based lookup
      - Worked Example: phases.find(p => p.name === 'process')
      */
      const workflow = await workflowAdapter.loadCurrent(SLUG);
      const phases = await phaseAdapter.listForWorkflow(workflow);

      const processPhase = phases.find((p) => p.name === 'process');
      expect(processPhase).toBeDefined();
      expect(processPhase?.order).toBe(2);
      expect(processPhase?.description).toBe('Process data');
    });
  });
});
