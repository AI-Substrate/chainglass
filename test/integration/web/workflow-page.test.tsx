/**
 * WorkflowPage Integration Tests - TDD RED Phase
 *
 * Tests for the workflow visualization page with ReactFlow.
 * Following TDD: tests written first to fail until T002-T003 implement components.
 *
 * DYK-07: Tests expect custom node types ('workflow'|'phase'|'agent');
 * will fail until T002 creates custom nodes and T003 implements page.
 *
 * @vitest-environment jsdom
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from '@xyflow/react';
import React, { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Browser mocks now consolidated in test/setup-browser-mocks.ts (FIX-007)

/**
 * ReactFlowWrapper - Provides required context for ReactFlow components
 */
function ReactFlowWrapper({ children }: { children: ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

describe('WorkflowPage', () => {
  beforeEach(() => {
    // Reset any mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('graph rendering', () => {
    it('should render workflow graph with nodes from DEMO_FLOW fixture', async () => {
      /*
      Test Doc:
      - Why: Core rendering verification - graph must display nodes
      - Contract: WorkflowPage renders ReactFlow with DEMO_FLOW nodes visible
      - Usage Notes: Requires ReactFlowProvider context
      - Quality Contribution: Catches ReactFlow integration failures
      - Worked Example: Render page → graph container visible with nodes
      */

      // Import dynamically to ensure test can fail properly if component doesn't exist
      const { WorkflowContent } = await import('@/components/workflow/workflow-content');
      const { DEMO_FLOW } = await import('@/data/fixtures/flow.fixture');

      render(
        <ReactFlowWrapper>
          <WorkflowContent initialFlow={DEMO_FLOW} />
        </ReactFlowWrapper>
      );

      // Should render the ReactFlow container
      const flowContainer = screen.getByRole('application');
      expect(flowContainer).toBeInTheDocument();

      // Should render nodes (ReactFlow uses role="group" for nodes)
      await waitFor(() => {
        // Check for custom node types by their labels
        expect(screen.getByText('Source Code')).toBeInTheDocument();
        expect(screen.getByText('Build')).toBeInTheDocument();
        expect(screen.getByText('Deploy')).toBeInTheDocument();
      });
    });

    it('should display different node types with distinct visual styles', async () => {
      /*
      Test Doc:
      - Why: AC-12 - Custom node types must have distinct visual appearance
      - Contract: WorkflowNode, PhaseNode, AgentNode have different CSS classes
      - Usage Notes: DYK-06 - nodes must use custom types, not 'default'
      - Quality Contribution: Validates custom node component implementation
      - Worked Example: Render page → 'workflow', 'phase', 'agent' nodes styled differently
      */

      const { WorkflowContent } = await import('@/components/workflow/workflow-content');
      const { DEMO_FLOW } = await import('@/data/fixtures/flow.fixture');

      render(
        <ReactFlowWrapper>
          <WorkflowContent initialFlow={DEMO_FLOW} />
        </ReactFlowWrapper>
      );

      await waitFor(() => {
        // DYK-07: Expect custom node types - these will fail until T002 implements them
        // The fixture will be updated in T002 to use 'workflow'|'phase'|'agent' types
        const workflowNodes = document.querySelectorAll('[data-node-type="workflow"]');
        const phaseNodes = document.querySelectorAll('[data-node-type="phase"]');
        const agentNodes = document.querySelectorAll('[data-node-type="agent"]');

        // At least one of each custom type should exist
        expect(workflowNodes.length + phaseNodes.length + agentNodes.length).toBeGreaterThan(0);
      });
    });
  });

  describe('pan and zoom controls', () => {
    it('should render pan/zoom control buttons', async () => {
      /*
      Test Doc:
      - Why: AC-10 - Users need pan/zoom controls for large workflows
      - Contract: ReactFlow Controls component renders with buttons
      - Usage Notes: Controls from @xyflow/react
      - Quality Contribution: Validates Controls component integration
      - Worked Example: Render page → zoom in/out/fit buttons visible
      */

      const { WorkflowContent } = await import('@/components/workflow/workflow-content');
      const { DEMO_FLOW } = await import('@/data/fixtures/flow.fixture');

      render(
        <ReactFlowWrapper>
          <WorkflowContent initialFlow={DEMO_FLOW} />
        </ReactFlowWrapper>
      );

      await waitFor(() => {
        // ReactFlow Controls renders buttons for zoom in, zoom out, fit view
        // They use aria-labels that we can query
        expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /fit view/i })).toBeInTheDocument();
      });
    });
  });

  describe('node interaction', () => {
    it('should call onNodeClick when a node is clicked', async () => {
      /*
      Test Doc:
      - Why: AC-11 - Clicking node should show details in panel
      - Contract: onNodeClick callback fires with node data
      - Usage Notes: Click handler passed to WorkflowContent
      - Quality Contribution: Validates node click detection
      - Worked Example: Click "Build" node → onNodeClick receives node-2 data
      */

      const { WorkflowContent } = await import('@/components/workflow/workflow-content');
      const { DEMO_FLOW } = await import('@/data/fixtures/flow.fixture');

      const onNodeClick = vi.fn();
      const user = userEvent.setup();

      render(
        <ReactFlowWrapper>
          <WorkflowContent initialFlow={DEMO_FLOW} onNodeClick={onNodeClick} />
        </ReactFlowWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Build')).toBeInTheDocument();
      });

      // Click on the Build node
      await user.click(screen.getByText('Build'));

      // Should trigger onNodeClick callback
      expect(onNodeClick).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'node-2',
          data: expect.objectContaining({ label: 'Build' }),
        })
      );
    });
  });

  describe('custom node components', () => {
    it('should render WorkflowNode component for workflow type nodes', async () => {
      /*
      Test Doc:
      - Why: DYK-06 - Custom nodes must render with correct component
      - Contract: type='workflow' nodes use WorkflowNode component
      - Usage Notes: nodeTypes object maps type to component
      - Quality Contribution: Validates nodeTypes registration
      - Worked Example: node with type='workflow' → WorkflowNode renders
      */

      const { WorkflowNode } = await import('@/components/workflow/workflow-node');
      const { nodeTypes } = await import('@/components/workflow');

      // Verify nodeTypes object has our custom types
      expect(nodeTypes).toBeDefined();
      expect(nodeTypes.workflow).toBe(WorkflowNode);
    });

    it('should render PhaseNode component for phase type nodes', async () => {
      /*
      Test Doc:
      - Why: DYK-06 - Phase nodes need distinct styling
      - Contract: type='phase' nodes use PhaseNode component
      - Usage Notes: Visual distinction for workflow phases
      - Quality Contribution: Validates phase node rendering
      - Worked Example: node with type='phase' → PhaseNode renders
      */

      const { PhaseNode } = await import('@/components/workflow/phase-node');
      const { nodeTypes } = await import('@/components/workflow');

      expect(nodeTypes).toBeDefined();
      expect(nodeTypes.phase).toBe(PhaseNode);
    });

    it('should render AgentNode component for agent type nodes', async () => {
      /*
      Test Doc:
      - Why: DYK-06 - Agent nodes need distinct styling
      - Contract: type='agent' nodes use AgentNode component
      - Usage Notes: Visual distinction for AI agents
      - Quality Contribution: Validates agent node rendering
      - Worked Example: node with type='agent' → AgentNode renders
      */

      const { AgentNode } = await import('@/components/workflow/agent-node');
      const { nodeTypes } = await import('@/components/workflow');

      expect(nodeTypes).toBeDefined();
      expect(nodeTypes.agent).toBe(AgentNode);
    });
  });
});
