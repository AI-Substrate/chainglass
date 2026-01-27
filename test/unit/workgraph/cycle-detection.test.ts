/**
 * Tests for Cycle Detection Algorithm.
 *
 * Per Phase 4: Full TDD approach - RED-GREEN-REFACTOR cycle.
 * Per CD04: DFS-based cycle detection at edge insertion time.
 *
 * The algorithm must:
 * - Detect cycles in directed graphs
 * - Return the cycle path for error messages (E108)
 * - Handle various graph topologies
 */

import { describe, expect, it } from 'vitest';

// Will be implemented in T004
import { type CycleDetectionResult, type GraphEdge, detectCycle } from '@chainglass/workgraph';

// ============================================
// Test Helpers
// ============================================

/**
 * Helper to create edges from simple notation: 'A→B'.
 */
function edge(from: string, to: string): GraphEdge {
  return { from, to };
}

// ============================================
// No Cycle Tests
// ============================================

describe('detectCycle', () => {
  describe('valid DAGs (no cycle)', () => {
    it('should return false for empty graph', () => {
      /*
      Test Doc:
      - Why: Base case - empty graph has no cycles
      - Contract: detectCycle([]) returns { hasCycle: false }
      - Usage Notes: Empty edges array is valid
      - Quality Contribution: Ensures algorithm handles empty input
      - Worked Example: detectCycle([]) → { hasCycle: false }
      */
      const result = detectCycle([]);

      expect(result.hasCycle).toBe(false);
      expect(result.path).toBeUndefined();
    });

    it('should return false for single edge', () => {
      /*
      Test Doc:
      - Why: Simplest non-empty graph - single edge cannot form cycle
      - Contract: detectCycle([A→B]) returns { hasCycle: false }
      - Usage Notes: One edge = valid DAG
      - Quality Contribution: Basic positive case
      - Worked Example: [start→A] → { hasCycle: false }
      */
      const edges = [edge('start', 'A')];

      const result = detectCycle(edges);

      expect(result.hasCycle).toBe(false);
    });

    it('should return false for linear chain A→B→C', () => {
      /*
      Test Doc:
      - Why: Linear chain is valid DAG
      - Contract: detectCycle([A→B, B→C]) returns { hasCycle: false }
      - Usage Notes: No back edges in linear chain
      - Quality Contribution: Tests traversal through multiple nodes
      - Worked Example: [start→A→B→C] → { hasCycle: false }
      */
      const edges = [edge('start', 'A'), edge('A', 'B'), edge('B', 'C')];

      const result = detectCycle(edges);

      expect(result.hasCycle).toBe(false);
    });

    it('should return false for diverging graph (one node, multiple children)', () => {
      /*
      Test Doc:
      - Why: Diverging (fan-out) is valid DAG pattern
      - Contract: detectCycle([A→B, A→C]) returns { hasCycle: false }
      - Usage Notes: Multiple outgoing edges from one node
      - Quality Contribution: Tests parallel execution paths
      - Worked Example: start→[A,B,C] → { hasCycle: false }
      */
      const edges = [edge('start', 'A'), edge('start', 'B'), edge('start', 'C')];

      const result = detectCycle(edges);

      expect(result.hasCycle).toBe(false);
    });

    it('should return false for converging graph (multiple parents, one child)', () => {
      /*
      Test Doc:
      - Why: Converging (fan-in) is valid DAG pattern
      - Contract: detectCycle([A→C, B→C]) returns { hasCycle: false }
      - Usage Notes: Multiple incoming edges to one node
      - Quality Contribution: Tests join/merge patterns
      - Worked Example: [A,B]→C → { hasCycle: false }
      */
      const edges = [edge('start', 'A'), edge('start', 'B'), edge('A', 'C'), edge('B', 'C')];

      const result = detectCycle(edges);

      expect(result.hasCycle).toBe(false);
    });

    it('should return false for diamond pattern (no cycle)', () => {
      /*
      Test Doc:
      - Why: Diamond pattern (diverge then converge) is valid DAG
      - Contract: detectCycle([A→B, A→C, B→D, C→D]) returns { hasCycle: false }
      - Usage Notes: Both B and C lead to D, but no back edge
      - Quality Contribution: Tests common workflow pattern
      - Worked Example: start→[A,B]→C → { hasCycle: false }
      */
      const edges = [
        edge('start', 'A'),
        edge('start', 'B'),
        edge('A', 'C'),
        edge('B', 'C'),
        edge('C', 'D'),
      ];

      const result = detectCycle(edges);

      expect(result.hasCycle).toBe(false);
    });
  });

  // ============================================
  // Simple Cycle Tests
  // ============================================

  describe('simple cycles', () => {
    it('should detect self-loop A→A', () => {
      /*
      Test Doc:
      - Why: Self-referencing edge is simplest cycle
      - Contract: detectCycle([A→A]) returns { hasCycle: true, path: [A, A] }
      - Usage Notes: Path includes the node twice
      - Quality Contribution: Tests edge case of self-loop
      - Worked Example: [A→A] → { hasCycle: true, path: ['A', 'A'] }
      */
      const edges = [edge('A', 'A')];

      const result = detectCycle(edges);

      expect(result.hasCycle).toBe(true);
      expect(result.path).toBeDefined();
      expect(result.path?.length).toBeGreaterThanOrEqual(2);
      // Path should include A
      expect(result.path).toContain('A');
    });

    it('should detect simple cycle A→B→A', () => {
      /*
      Test Doc:
      - Why: Two-node cycle is basic cycle pattern
      - Contract: detectCycle([A→B, B→A]) returns { hasCycle: true, path: [A, B, A] }
      - Usage Notes: Path traces the cycle
      - Quality Contribution: Tests basic cycle detection
      - Worked Example: [A→B→A] → { hasCycle: true, path: ['A', 'B', 'A'] }
      */
      const edges = [edge('A', 'B'), edge('B', 'A')];

      const result = detectCycle(edges);

      expect(result.hasCycle).toBe(true);
      expect(result.path).toBeDefined();
      // Path should contain at least A and B
      expect(result.path).toContain('A');
      expect(result.path).toContain('B');
    });

    it('should detect cycle A→B→C→A', () => {
      /*
      Test Doc:
      - Why: Three-node cycle per spec test case
      - Contract: detectCycle([A→B, B→C, C→A]) returns { hasCycle: true, path includes A,B,C }
      - Usage Notes: CD04 spec example
      - Quality Contribution: Tests specified cycle pattern
      - Worked Example: [A→B→C→A] → { hasCycle: true, path: ['A', 'B', 'C', 'A'] }
      */
      const edges = [edge('A', 'B'), edge('B', 'C'), edge('C', 'A')];

      const result = detectCycle(edges);

      expect(result.hasCycle).toBe(true);
      expect(result.path).toBeDefined();
      expect(result.path).toContain('A');
      expect(result.path).toContain('B');
      expect(result.path).toContain('C');
    });
  });

  // ============================================
  // Complex Cycle Tests
  // ============================================

  describe('complex cycles', () => {
    it('should detect cycle in middle of graph A→B→C→B', () => {
      /*
      Test Doc:
      - Why: Cycle may not include graph start
      - Contract: Detects inner cycle B→C→B
      - Usage Notes: A leads to cycle but isn't part of it
      - Quality Contribution: Tests partial graph cycles
      - Worked Example: start→A→B→C→B → { hasCycle: true }
      */
      const edges = [edge('start', 'A'), edge('A', 'B'), edge('B', 'C'), edge('C', 'B')];

      const result = detectCycle(edges);

      expect(result.hasCycle).toBe(true);
      expect(result.path).toBeDefined();
      // Path should include B and C (the cycle)
      expect(result.path).toContain('B');
      expect(result.path).toContain('C');
    });

    it('should detect cycle in complex graph with valid and invalid branches', () => {
      /*
      Test Doc:
      - Why: Real graphs may have cycles in only some branches
      - Contract: Finds cycle even when other paths are valid
      - Usage Notes: Algorithm must explore all branches
      - Quality Contribution: Tests realistic graph complexity
      - Worked Example: start→[A→B, C→D→C] → { hasCycle: true } (C→D→C is cycle)
      */
      const edges = [
        edge('start', 'A'),
        edge('A', 'B'),
        edge('start', 'C'),
        edge('C', 'D'),
        edge('D', 'C'), // Cycle here
      ];

      const result = detectCycle(edges);

      expect(result.hasCycle).toBe(true);
      expect(result.path).toContain('C');
      expect(result.path).toContain('D');
    });

    it('should handle disconnected components', () => {
      /*
      Test Doc:
      - Why: Graph may have unreachable nodes
      - Contract: Detects cycle even in disconnected component
      - Usage Notes: DFS must visit all nodes, not just reachable from start
      - Quality Contribution: Tests robustness for malformed graphs
      - Worked Example: [start→A] + [B→C→B] → { hasCycle: true }
      */
      const edges = [
        edge('start', 'A'),
        // Disconnected cycle
        edge('B', 'C'),
        edge('C', 'B'),
      ];

      const result = detectCycle(edges);

      expect(result.hasCycle).toBe(true);
    });
  });

  // ============================================
  // Edge Insertion Tests
  // ============================================

  describe('edge insertion (wouldCreateCycle)', () => {
    it('should detect if adding new edge would create cycle', () => {
      /*
      Test Doc:
      - Why: Main use case - validate before adding edge
      - Contract: Can check hypothetical edge + existing edges
      - Usage Notes: Pass existing edges + proposed edge
      - Quality Contribution: Tests primary addNodeAfter validation
      - Worked Example: existing=[A→B→C], propose C→A → { hasCycle: true }
      */
      const existingEdges = [edge('start', 'A'), edge('A', 'B'), edge('B', 'C')];

      // Test: would adding C→A create a cycle? (Yes - A→B→C→A)
      const proposedEdge = edge('C', 'A');
      const allEdges = [...existingEdges, proposedEdge];

      const result = detectCycle(allEdges);

      expect(result.hasCycle).toBe(true);
    });

    it('should allow valid edge addition', () => {
      /*
      Test Doc:
      - Why: Valid edges should not be rejected
      - Contract: Returns false for valid edge addition
      - Usage Notes: Adding forward edge (no back edge)
      - Quality Contribution: Ensures valid operations work
      - Worked Example: existing=[A→B], propose B→C → { hasCycle: false }
      */
      const existingEdges = [edge('start', 'A'), edge('A', 'B')];

      // Test: would adding B→C create a cycle? (No - valid extension)
      const proposedEdge = edge('B', 'C');
      const allEdges = [...existingEdges, proposedEdge];

      const result = detectCycle(allEdges);

      expect(result.hasCycle).toBe(false);
    });
  });

  // ============================================
  // Path Quality Tests
  // ============================================

  describe('cycle path', () => {
    it('should return path that starts and ends with same node', () => {
      /*
      Test Doc:
      - Why: Path should clearly show the cycle
      - Contract: path[0] === path[path.length-1]
      - Usage Notes: Makes cycle obvious in error message
      - Quality Contribution: Better error messages for E108
      - Worked Example: path = ['A', 'B', 'C', 'A'] for A→B→C→A
      */
      const edges = [edge('A', 'B'), edge('B', 'C'), edge('C', 'A')];

      const result = detectCycle(edges);

      expect(result.hasCycle).toBe(true);
      expect(result.path).toBeDefined();
      const path = result.path ?? [];
      expect(path.length).toBeGreaterThanOrEqual(2);
      // First and last should be the same (cycle closes)
      expect(path[0]).toBe(path[path.length - 1]);
    });

    it('should return minimal cycle path (no extra nodes)', () => {
      /*
      Test Doc:
      - Why: Path should be the actual cycle, not traversal history
      - Contract: Path only includes nodes in the cycle
      - Usage Notes: A→B→C→D→B returns [B,C,D,B], not [A,B,C,D,B]
      - Quality Contribution: Clear, actionable error messages
      - Worked Example: [A,B,C,D] with cycle B→C→D→B returns path [B,C,D,B]
      */
      const edges = [
        edge('A', 'B'),
        edge('B', 'C'),
        edge('C', 'D'),
        edge('D', 'B'), // Cycle: B→C→D→B
      ];

      const result = detectCycle(edges);

      expect(result.hasCycle).toBe(true);
      expect(result.path).toBeDefined();
      const path = result.path ?? [];
      // Path should be minimal cycle, not include A
      // The cycle is B→C→D→B, so path should be ~4 elements
      expect(path.length).toBeLessThanOrEqual(4);
      expect(path).toContain('B');
      expect(path).toContain('C');
      expect(path).toContain('D');
    });
  });
});
