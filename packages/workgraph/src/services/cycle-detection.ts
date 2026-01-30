/**
 * Cycle Detection Algorithm for WorkGraphs.
 *
 * Per CD04: DFS-based cycle detection at edge insertion time.
 * Returns the cycle path for E108 error messages.
 *
 * Algorithm: Uses a three-color marking scheme:
 * - WHITE: unvisited node
 * - GRAY: node currently in the recursion stack (being processed)
 * - BLACK: node fully processed
 *
 * A cycle exists if we encounter a GRAY node during DFS traversal.
 */

import type { GraphEdge } from '../interfaces/workgraph-service.interface.js';

/**
 * Result of cycle detection.
 */
export interface CycleDetectionResult {
  /** Whether a cycle was detected */
  hasCycle: boolean;
  /** The cycle path (nodes in order), only present if hasCycle is true */
  path?: string[];
}

/**
 * Node color for DFS traversal.
 */
enum Color {
  WHITE = 0, // Unvisited
  GRAY = 1, // In recursion stack
  BLACK = 2, // Fully processed
}

/**
 * Detect if a graph contains a cycle.
 *
 * Uses DFS with three-color marking to detect back edges.
 * Returns the minimal cycle path when a cycle is found.
 *
 * @param edges - Array of graph edges
 * @returns CycleDetectionResult with hasCycle and optional path
 */
export function detectCycle(edges: GraphEdge[]): CycleDetectionResult {
  // Build adjacency list
  const adjacency = new Map<string, string[]>();

  // Collect all nodes from edges
  const nodes = new Set<string>();
  for (const edge of edges) {
    nodes.add(edge.from);
    nodes.add(edge.to);

    if (!adjacency.has(edge.from)) {
      adjacency.set(edge.from, []);
    }
    adjacency.get(edge.from)?.push(edge.to);
  }

  // Initialize colors and parent tracking
  const color = new Map<string, Color>();
  const parent = new Map<string, string | null>();

  for (const node of nodes) {
    color.set(node, Color.WHITE);
    parent.set(node, null);
  }

  // DFS to find cycle
  let cycleStart: string | null = null;
  let cycleEnd: string | null = null;

  function dfs(node: string): boolean {
    color.set(node, Color.GRAY);

    for (const neighbor of adjacency.get(node) ?? []) {
      if (color.get(neighbor) === Color.GRAY) {
        // Found a back edge - cycle detected!
        cycleStart = neighbor;
        cycleEnd = node;
        return true;
      }

      if (color.get(neighbor) === Color.WHITE) {
        parent.set(neighbor, node);
        if (dfs(neighbor)) {
          return true;
        }
      }
    }

    color.set(node, Color.BLACK);
    return false;
  }

  // Run DFS from all nodes (handles disconnected components)
  for (const node of nodes) {
    if (color.get(node) === Color.WHITE) {
      if (dfs(node)) {
        break;
      }
    }
  }

  // If no cycle found
  if (cycleStart === null || cycleEnd === null) {
    return { hasCycle: false };
  }

  // Reconstruct cycle path
  const path: string[] = [];

  // Trace back from cycleEnd to cycleStart using parent pointers
  let current: string | null = cycleEnd;
  while (current !== null && current !== cycleStart) {
    path.push(current);
    current = parent.get(current) ?? null;
  }

  // Add the cycle start
  path.push(cycleStart);
  path.reverse();

  // Add the closing node to make it clear it's a cycle
  path.push(cycleStart);

  return { hasCycle: true, path };
}

// Re-export GraphEdge for convenience in tests
export type { GraphEdge };
