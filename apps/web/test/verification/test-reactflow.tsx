'use client';

/**
 * ReactFlow Verification Component
 *
 * This component verifies that ReactFlow works correctly with React 19.
 * It is placed in test/verification/ to exclude from production builds.
 *
 * Verification checks:
 * 1. ReactFlow imports without peer dependency errors
 * 2. Basic graph with nodes and edges renders
 * 3. Zustand state management works (implicit via ReactFlow)
 *
 * Usage:
 *   Import this component in a test page to verify ReactFlow integration.
 *   DO NOT use in production code.
 */

import { Background, Controls, ReactFlow } from '@xyflow/react';

const initialNodes = [
  {
    id: 'node-1',
    type: 'default',
    position: { x: 0, y: 0 },
    data: { label: 'Start' },
  },
  {
    id: 'node-2',
    type: 'default',
    position: { x: 0, y: 100 },
    data: { label: 'Process' },
  },
  {
    id: 'node-3',
    type: 'default',
    position: { x: 0, y: 200 },
    data: { label: 'End' },
  },
];

const initialEdges = [
  { id: 'edge-1-2', source: 'node-1', target: 'node-2' },
  { id: 'edge-2-3', source: 'node-2', target: 'node-3' },
];

export function TestReactFlow() {
  return (
    <div style={{ width: '100%', height: '400px' }}>
      <h2>ReactFlow Verification</h2>
      <p>If you see a graph below with 3 nodes and 2 edges, ReactFlow is working correctly.</p>
      <div style={{ width: '100%', height: '300px', border: '1px solid #ccc' }}>
        <ReactFlow nodes={initialNodes} edges={initialEdges} fitView>
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

export default TestReactFlow;
