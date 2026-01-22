import { describe, expect, it } from 'vitest';

import { deepMerge } from '../../../packages/shared/src/config/loaders/deep-merge.js';

/**
 * Unit tests for deepMerge() - Recursive config object merging.
 *
 * Per DYK-08, this function must:
 * - Recursively merge nested objects
 * - Replace arrays entirely (not concatenate)
 * - Later source wins for conflicting keys
 * - Handle null values (null replaces target)
 * - Detect and handle circular references (WeakSet)
 * - NOT mutate original objects
 */
describe('deepMerge', () => {
  describe('basic merging', () => {
    it('should merge nested objects', () => {
      /*
      Test Doc:
      - Why: Core deep merge functionality
      - Contract: Nested properties from both target and source combined
      - Usage Notes: Non-conflicting nested props preserved
      - Quality Contribution: Catches merge algorithm bugs
      - Worked Example: { a: { b: 1 } } + { a: { c: 2 } } → { a: { b: 1, c: 2 } }
      */
      const target = { a: { b: 1 } };
      const source = { a: { c: 2 } };

      const result = deepMerge(target, source);

      expect(result).toEqual({ a: { b: 1, c: 2 } });
    });

    it('should handle source overriding target', () => {
      /*
      Test Doc:
      - Why: Config precedence - later source wins
      - Contract: Source value replaces target value for same key
      - Usage Notes: This is how env vars override file config
      - Quality Contribution: Verifies precedence logic
      - Worked Example: { timeout: 30 } + { timeout: 60 } → { timeout: 60 }
      */
      const target = { timeout: 30, name: 'original' };
      const source = { timeout: 60 };

      const result = deepMerge(target, source);

      expect(result).toEqual({ timeout: 60, name: 'original' });
    });

    it('should merge multiple levels deep', () => {
      /*
      Test Doc:
      - Why: Config can have arbitrarily deep nesting
      - Contract: Merge works at any depth
      - Usage Notes: Same algorithm applied recursively
      - Quality Contribution: Deep nesting verification
      - Worked Example: 3+ levels of nesting merged correctly
      */
      const target = {
        level1: {
          level2: {
            level3: {
              a: 1,
            },
          },
        },
      };
      const source = {
        level1: {
          level2: {
            level3: {
              b: 2,
            },
          },
        },
      };

      const result = deepMerge(target, source);

      expect(result).toEqual({
        level1: {
          level2: {
            level3: {
              a: 1,
              b: 2,
            },
          },
        },
      });
    });
  });

  describe('array handling (DYK-08)', () => {
    it('should replace arrays entirely (not merge/concatenate)', () => {
      /*
      Test Doc:
      - Why: Array merge semantics are ambiguous (DYK-08)
      - Contract: Source array completely replaces target array
      - Usage Notes: User wanting additive behavior must specify full array
      - Quality Contribution: Verifies deliberate replace behavior
      - Worked Example: { items: [1,2] } + { items: [3] } → { items: [3] }
      */
      const target = { items: [1, 2, 3] };
      const source = { items: [4, 5] };

      const result = deepMerge(target, source);

      expect(result).toEqual({ items: [4, 5] });
    });

    it('should replace nested arrays', () => {
      /*
      Test Doc:
      - Why: Arrays at any nesting level should replace
      - Contract: Nested arrays also replaced entirely
      - Usage Notes: Same semantics regardless of depth
      - Quality Contribution: Consistency verification
      - Worked Example: { a: { list: [1] } } + { a: { list: [2] } } → { a: { list: [2] } }
      */
      const target = { config: { plugins: ['a', 'b'] } };
      const source = { config: { plugins: ['c'] } };

      const result = deepMerge(target, source);

      expect(result).toEqual({ config: { plugins: ['c'] } });
    });
  });

  describe('null handling', () => {
    it('should handle null values (replaces target)', () => {
      /*
      Test Doc:
      - Why: null is a valid config value meaning "unset" or "disable"
      - Contract: null in source replaces any value in target
      - Usage Notes: Explicit null can disable features
      - Quality Contribution: Null handling correctness
      - Worked Example: { feature: { enabled: true } } + { feature: null } → { feature: null }
      */
      const target = { feature: { enabled: true, timeout: 30 } };
      const source: { feature: null | typeof target.feature } = { feature: null };

      const result = deepMerge(target, source);

      expect(result).toEqual({ feature: null });
    });

    it('should handle undefined values (preserves target)', () => {
      /*
      Test Doc:
      - Why: undefined means "not specified" - should not override
      - Contract: undefined in source does NOT replace target
      - Usage Notes: Only explicit values (including null) override
      - Quality Contribution: undefined vs null distinction
      - Worked Example: { a: 1 } + { a: undefined } → { a: 1 }
      */
      const target = { value: 'original' };
      const source = { value: undefined };

      const result = deepMerge(target, source);

      expect(result).toEqual({ value: 'original' });
    });
  });

  describe('circular reference handling', () => {
    it('should handle circular references without infinite loop', () => {
      /*
      Test Doc:
      - Why: Malicious or buggy input could have cycles
      - Contract: Circular refs detected and handled (no infinite loop)
      - Usage Notes: Uses WeakSet for cycle detection
      - Quality Contribution: Security and robustness
      - Worked Example: Object with self-reference doesn't crash
      */
      const target: Record<string, unknown> = { name: 'target' };
      target.self = target; // Circular reference

      const source = { name: 'source', value: 42 };

      // Should not throw or hang
      const result = deepMerge(target, source);

      expect(result.name).toBe('source');
      expect(result.value).toBe(42);
    });
  });

  describe('immutability', () => {
    it('should not mutate original objects', () => {
      /*
      Test Doc:
      - Why: Config objects may be reused/shared
      - Contract: deepMerge returns new object, originals unchanged
      - Usage Notes: Important for test isolation
      - Quality Contribution: Prevents subtle mutation bugs
      - Worked Example: After merge, original target unchanged
      */
      const target = { a: { b: 1 } };
      const source = { a: { c: 2 } };
      const originalTarget = JSON.parse(JSON.stringify(target));
      const originalSource = JSON.parse(JSON.stringify(source));

      deepMerge(target, source);

      expect(target).toEqual(originalTarget);
      expect(source).toEqual(originalSource);
    });

    it('should not mutate nested objects', () => {
      /*
      Test Doc:
      - Why: Deep mutation is especially sneaky
      - Contract: Nested objects also not mutated
      - Usage Notes: Full deep copy behavior
      - Quality Contribution: Complete immutability verification
      - Worked Example: Nested objects in target preserved
      */
      const nested = { value: 'original' };
      const target = { config: nested };
      const source = { config: { value: 'modified' } };

      deepMerge(target, source);

      expect(nested.value).toBe('original');
    });
  });
});
