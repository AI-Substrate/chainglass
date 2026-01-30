/**
 * Tests for Node ID Generation.
 *
 * Per Phase 4: Full TDD approach - RED-GREEN-REFACTOR cycle.
 * Per Discovery 11: Node ID format is `<unit-slug>-<hex3>` (e.g., write-poem-b2c).
 *
 * The `start` node is reserved and cannot be used as a unit slug.
 */

import { describe, expect, it } from 'vitest';

// Will be implemented in T002
import { generateNodeId } from '@chainglass/workgraph';

// ============================================
// Node ID Format Tests
// ============================================

describe('generateNodeId', () => {
  describe('format', () => {
    it('should generate ID in format <unit-slug>-<hex3>', () => {
      /*
      Test Doc:
      - Why: Per Discovery 11 - consistent node ID format for parsing
      - Contract: generateNodeId(slug, existingIds) returns string matching /<slug>-[a-f0-9]{3}/
      - Usage Notes: Hex chars are lowercase
      - Quality Contribution: Ensures node IDs are parseable and consistent
      - Worked Example: generateNodeId('write-poem', []) → 'write-poem-a7f'
      */
      const nodeId = generateNodeId('write-poem', []);

      // Should match the pattern: <slug>-<hex3>
      expect(nodeId).toMatch(/^write-poem-[a-f0-9]{3}$/);
    });

    it('should preserve unit slug with hyphens', () => {
      /*
      Test Doc:
      - Why: Unit slugs may contain multiple hyphens (e.g., user-input-text)
      - Contract: generateNodeId preserves all hyphens in the unit slug
      - Usage Notes: Only the last 3 chars after final hyphen are the hex suffix
      - Quality Contribution: Ensures complex unit slugs work correctly
      - Worked Example: generateNodeId('user-input-text', []) → 'user-input-text-b2c'
      */
      const nodeId = generateNodeId('user-input-text', []);

      // Should match: unit slug + hyphen + 3 hex chars
      expect(nodeId).toMatch(/^user-input-text-[a-f0-9]{3}$/);
    });

    it('should generate lowercase hex characters', () => {
      /*
      Test Doc:
      - Why: Consistency - hex should always be lowercase
      - Contract: generateNodeId produces only lowercase hex digits
      - Usage Notes: A-F should not appear, only a-f
      - Quality Contribution: Ensures consistent string comparisons
      - Worked Example: No uppercase hex in output
      */
      const nodeId = generateNodeId('test-unit', []);

      // Extract the hex suffix
      const hexPart = nodeId.slice(-3);
      expect(hexPart).toMatch(/^[a-f0-9]{3}$/);
      expect(hexPart).not.toMatch(/[A-F]/);
    });
  });

  // ============================================
  // Uniqueness Tests
  // ============================================

  describe('uniqueness', () => {
    it('should generate unique IDs across multiple calls', () => {
      /*
      Test Doc:
      - Why: Node IDs must be unique within a graph
      - Contract: Multiple calls to generateNodeId return different IDs
      - Usage Notes: Pass existing IDs to avoid collisions
      - Quality Contribution: Prevents duplicate node IDs
      - Worked Example: 100 calls → 100 unique IDs
      */
      const existingIds: string[] = [];
      const generatedIds = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const nodeId = generateNodeId('test-unit', existingIds);
        expect(generatedIds.has(nodeId)).toBe(false);
        generatedIds.add(nodeId);
        existingIds.push(nodeId);
      }

      expect(generatedIds.size).toBe(100);
    });

    it('should not generate ID that exists in existingIds', () => {
      /*
      Test Doc:
      - Why: Must avoid collisions with existing node IDs
      - Contract: Generated ID is never in the existingIds array
      - Usage Notes: existingIds includes all current graph node IDs
      - Quality Contribution: Prevents graph corruption from duplicate IDs
      - Worked Example: existingIds=['test-a1b'] → never returns 'test-a1b'
      */
      const existingIds = ['test-unit-a1b', 'test-unit-b2c', 'test-unit-c3d'];

      for (let i = 0; i < 50; i++) {
        const nodeId = generateNodeId('test-unit', existingIds);
        expect(existingIds).not.toContain(nodeId);
      }
    });
  });

  // ============================================
  // Collision Handling Tests
  // ============================================

  describe('collision handling', () => {
    it('should regenerate on collision with existing ID', () => {
      /*
      Test Doc:
      - Why: Hex space is finite (4096 values), collisions must be handled
      - Contract: If random hex matches existing, regenerate until unique
      - Usage Notes: This is a probabilistic test - many iterations
      - Quality Contribution: Ensures robustness under collision pressure
      - Worked Example: Pre-fill many IDs → still generates unique
      */
      // Create a set of existing IDs covering many hex values
      const existingIds: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const hex = i.toString(16).padStart(3, '0').slice(-3);
        existingIds.push(`test-unit-${hex}`);
      }

      // Should still be able to generate unique ID (4096 - 1000 = 3096 remaining)
      const nodeId = generateNodeId('test-unit', existingIds);
      expect(nodeId).toMatch(/^test-unit-[a-f0-9]{3}$/);
      expect(existingIds).not.toContain(nodeId);
    });

    it('should throw error when hex space exhausted', () => {
      /*
      Test Doc:
      - Why: With 4096 possible hex values, exhaustion is theoretically possible
      - Contract: Throws error if no unique ID can be generated after reasonable attempts
      - Usage Notes: This is an edge case - graphs shouldn't have 4096 nodes of same unit
      - Quality Contribution: Prevents infinite loops
      - Worked Example: All 4096 hex values used → throws error
      */
      // Fill all possible hex values for a unit slug
      const existingIds: string[] = [];
      for (let i = 0; i < 4096; i++) {
        const hex = i.toString(16).padStart(3, '0');
        existingIds.push(`test-unit-${hex}`);
      }

      // Should throw when no unique ID possible
      expect(() => generateNodeId('test-unit', existingIds)).toThrow();
    });
  });

  // ============================================
  // Reserved ID Tests
  // ============================================

  describe('reserved IDs', () => {
    it('should reject "start" as unit slug', () => {
      /*
      Test Doc:
      - Why: 'start' is the reserved ID for the graph entry point
      - Contract: generateNodeId('start', []) throws error
      - Usage Notes: Per Discovery 11 - 'start' is reserved
      - Quality Contribution: Prevents confusion with start node
      - Worked Example: generateNodeId('start', []) → throws
      */
      expect(() => generateNodeId('start', [])).toThrow();
    });

    it('should work with unit slugs containing "start"', () => {
      /*
      Test Doc:
      - Why: Unit slug 'quick-start' or 'start-process' should work
      - Contract: Only exact 'start' is rejected, not substrings
      - Usage Notes: Check for exact match, not contains
      - Quality Contribution: Allows legitimate unit names
      - Worked Example: generateNodeId('quick-start', []) → valid ID
      */
      const nodeId = generateNodeId('quick-start', []);
      expect(nodeId).toMatch(/^quick-start-[a-f0-9]{3}$/);

      const nodeId2 = generateNodeId('start-process', []);
      expect(nodeId2).toMatch(/^start-process-[a-f0-9]{3}$/);
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('edge cases', () => {
    it('should handle empty existingIds array', () => {
      /*
      Test Doc:
      - Why: First node added to graph has no existing IDs
      - Contract: generateNodeId works with empty array
      - Usage Notes: Base case for new graphs
      - Quality Contribution: Ensures basic case works
      - Worked Example: generateNodeId('test', []) → valid ID
      */
      const nodeId = generateNodeId('test-unit', []);
      expect(nodeId).toMatch(/^test-unit-[a-f0-9]{3}$/);
    });

    it('should handle single-word unit slugs', () => {
      /*
      Test Doc:
      - Why: Some units may have simple names like 'summarize'
      - Contract: Works with slugs without hyphens
      - Usage Notes: Output still has hyphen before hex
      - Quality Contribution: Supports all valid unit slug formats
      - Worked Example: generateNodeId('summarize', []) → 'summarize-a1b'
      */
      const nodeId = generateNodeId('summarize', []);
      expect(nodeId).toMatch(/^summarize-[a-f0-9]{3}$/);
    });

    it('should handle IDs from different units in existingIds', () => {
      /*
      Test Doc:
      - Why: existingIds may contain IDs from various units
      - Contract: Only checks collision, doesn't filter by unit type
      - Usage Notes: All graph node IDs should be passed
      - Quality Contribution: Correct behavior with mixed ID sets
      - Worked Example: existingIds with different unit slugs → works correctly
      */
      const existingIds = [
        'write-poem-a1b',
        'review-text-b2c',
        'process-data-c3d',
        'start', // Include start node
      ];

      const nodeId = generateNodeId('new-unit', existingIds);
      expect(nodeId).toMatch(/^new-unit-[a-f0-9]{3}$/);
      expect(existingIds).not.toContain(nodeId);
    });
  });
});
