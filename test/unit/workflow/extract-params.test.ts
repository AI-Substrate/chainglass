import { extractValue } from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';

/**
 * Tests for extractValue() utility function.
 *
 * Per Phase 4: Phase Lifecycle - TDD approach, tests first.
 * Per DYK Insight #2: Pure dot-notation path traversal only.
 *
 * The extractValue() function extracts values from objects using
 * simple dot-notation paths (e.g., 'items.0', 'classification.type').
 */
describe('extractValue()', () => {
  describe('top-level values', () => {
    it('should extract top-level string value', () => {
      /*
      Test Doc:
      - Why: Most common case is extracting simple values
      - Contract: extractValue(obj, 'key') returns obj.key
      - Usage Notes: Path is just the key name for top-level
      - Quality Contribution: Basic path traversal works
      - Worked Example: extractValue({ count: 3 }, 'count') → 3
      */
      const obj = { count: 3 };
      expect(extractValue(obj, 'count')).toBe(3);
    });

    it('should extract top-level number value', () => {
      /*
      Test Doc:
      - Why: Parameters often include counts and totals
      - Contract: Returns number type unchanged
      - Usage Notes: Type is preserved
      - Quality Contribution: Number handling works
      - Worked Example: extractValue({ total: 42 }, 'total') → 42
      */
      const obj = { total: 42 };
      expect(extractValue(obj, 'total')).toBe(42);
    });

    it('should extract top-level boolean value', () => {
      /*
      Test Doc:
      - Why: Parameters may include flags
      - Contract: Returns boolean type unchanged
      - Usage Notes: Type is preserved
      - Quality Contribution: Boolean handling works
      - Worked Example: extractValue({ active: true }, 'active') → true
      */
      const obj = { active: true };
      expect(extractValue(obj, 'active')).toBe(true);
    });

    it('should extract top-level null value', () => {
      /*
      Test Doc:
      - Why: Explicit null values should be extractable
      - Contract: Returns null unchanged
      - Usage Notes: null is a valid value, distinct from undefined
      - Quality Contribution: Null handling works
      - Worked Example: extractValue({ value: null }, 'value') → null
      */
      const obj = { value: null };
      expect(extractValue(obj, 'value')).toBeNull();
    });
  });

  describe('nested path extraction', () => {
    it('should extract nested value with single dot', () => {
      /*
      Test Doc:
      - Why: Parameters often come from nested structures
      - Contract: extractValue(obj, 'a.b') returns obj.a.b
      - Usage Notes: Dot separates path segments
      - Quality Contribution: Basic nesting works
      - Worked Example: extractValue({ classification: { type: 'x' } }, 'classification.type') → 'x'
      */
      const obj = { classification: { type: 'processing' } };
      expect(extractValue(obj, 'classification.type')).toBe('processing');
    });

    it('should extract deeply nested value', () => {
      /*
      Test Doc:
      - Why: Arbitrary nesting depth should work
      - Contract: extractValue(obj, 'a.b.c') returns obj.a.b.c
      - Usage Notes: Supports unlimited depth
      - Quality Contribution: Deep nesting works
      - Worked Example: extractValue({ a: { b: { c: 'deep' } } }, 'a.b.c') → 'deep'
      */
      const obj = { a: { b: { c: 'deep' } } };
      expect(extractValue(obj, 'a.b.c')).toBe('deep');
    });

    it('should extract very deeply nested value', () => {
      /*
      Test Doc:
      - Why: Edge case for very deep nesting
      - Contract: Works for arbitrary depth
      - Usage Notes: No depth limit
      - Quality Contribution: Edge case coverage
      - Worked Example: extractValue({ a: { b: { c: { d: { e: 'value' } } } } }, 'a.b.c.d.e') → 'value'
      */
      const obj = { a: { b: { c: { d: { e: 'value' } } } } };
      expect(extractValue(obj, 'a.b.c.d.e')).toBe('value');
    });
  });

  describe('array index extraction', () => {
    it('should extract array element by index', () => {
      /*
      Test Doc:
      - Why: Arrays are common in output data
      - Contract: extractValue(obj, 'items.0') returns obj.items[0]
      - Usage Notes: Numeric path segment treated as array index
      - Quality Contribution: Array access works
      - Worked Example: extractValue({ items: ['a', 'b'] }, 'items.0') → 'a'
      */
      const obj = { items: ['a', 'b', 'c'] };
      expect(extractValue(obj, 'items.0')).toBe('a');
      expect(extractValue(obj, 'items.1')).toBe('b');
      expect(extractValue(obj, 'items.2')).toBe('c');
    });

    it('should extract nested value from array element', () => {
      /*
      Test Doc:
      - Why: Array elements may be objects
      - Contract: extractValue(obj, 'items.0.name') returns obj.items[0].name
      - Usage Notes: Array index followed by object key
      - Quality Contribution: Complex paths work
      - Worked Example: extractValue({ items: [{ name: 'first' }] }, 'items.0.name') → 'first'
      */
      const obj = { items: [{ name: 'first' }, { name: 'second' }] };
      expect(extractValue(obj, 'items.0.name')).toBe('first');
      expect(extractValue(obj, 'items.1.name')).toBe('second');
    });
  });

  describe('missing path handling', () => {
    it('should return undefined for missing top-level key', () => {
      /*
      Test Doc:
      - Why: Missing keys should not throw
      - Contract: Returns undefined for non-existent paths
      - Usage Notes: Caller should handle undefined (convert to null for storage)
      - Quality Contribution: Graceful missing key handling
      - Worked Example: extractValue({}, 'foo') → undefined
      */
      const obj = {};
      expect(extractValue(obj, 'foo')).toBeUndefined();
    });

    it('should return undefined for missing nested key', () => {
      /*
      Test Doc:
      - Why: Nested path may partially exist
      - Contract: Returns undefined if any path segment missing
      - Usage Notes: Does not throw on partial paths
      - Quality Contribution: Graceful partial path handling
      - Worked Example: extractValue({ a: {} }, 'a.b.c') → undefined
      */
      const obj = { a: {} };
      expect(extractValue(obj, 'a.b')).toBeUndefined();
      expect(extractValue(obj, 'a.b.c')).toBeUndefined();
    });

    it('should return undefined when traversing through null', () => {
      /*
      Test Doc:
      - Why: null should not be traversed
      - Contract: Returns undefined if null in path
      - Usage Notes: Cannot access properties of null
      - Quality Contribution: Safe null handling
      - Worked Example: extractValue({ x: null }, 'x.y') → undefined
      */
      const obj = { x: null };
      expect(extractValue(obj, 'x.y')).toBeUndefined();
    });

    it('should return undefined when traversing through undefined', () => {
      /*
      Test Doc:
      - Why: undefined should not be traversed
      - Contract: Returns undefined if undefined in path
      - Usage Notes: Cannot access properties of undefined
      - Quality Contribution: Safe undefined handling
      - Worked Example: extractValue({ x: undefined }, 'x.y') → undefined
      */
      const obj = { x: undefined };
      expect(extractValue(obj, 'x.y')).toBeUndefined();
    });

    it('should return undefined for out-of-bounds array index', () => {
      /*
      Test Doc:
      - Why: Array access should not throw
      - Contract: Returns undefined for invalid index
      - Usage Notes: Out of bounds is not an error
      - Quality Contribution: Safe array access
      - Worked Example: extractValue({ items: ['a'] }, 'items.5') → undefined
      */
      const obj = { items: ['a', 'b'] };
      expect(extractValue(obj, 'items.5')).toBeUndefined();
    });
  });

  describe('primitive value handling', () => {
    it('should return undefined when traversing into primitive', () => {
      /*
      Test Doc:
      - Why: Cannot access properties of primitives
      - Contract: Returns undefined if trying to traverse string/number
      - Usage Notes: Primitives have no properties in this context
      - Quality Contribution: Safe primitive handling
      - Worked Example: extractValue({ name: 'test' }, 'name.length') → undefined
      */
      const obj = { name: 'test' };
      expect(extractValue(obj, 'name.length')).toBeUndefined();
    });
  });

  describe('empty and edge cases', () => {
    it('should handle empty path by returning the object', () => {
      /*
      Test Doc:
      - Why: Edge case - empty path
      - Contract: Empty path returns the input object
      - Usage Notes: Unusual but should be handled
      - Quality Contribution: Edge case coverage
      - Worked Example: extractValue({ a: 1 }, '') → { a: 1 }
      */
      const obj = { a: 1 };
      expect(extractValue(obj, '')).toEqual({ a: 1 });
    });

    it('should handle null input object', () => {
      /*
      Test Doc:
      - Why: Edge case - null input
      - Contract: Returns undefined for null input
      - Usage Notes: Graceful null handling
      - Quality Contribution: Edge case coverage
      - Worked Example: extractValue(null, 'a') → undefined
      */
      expect(extractValue(null, 'a')).toBeUndefined();
    });

    it('should handle undefined input object', () => {
      /*
      Test Doc:
      - Why: Edge case - undefined input
      - Contract: Returns undefined for undefined input
      - Usage Notes: Graceful undefined handling
      - Quality Contribution: Edge case coverage
      - Worked Example: extractValue(undefined, 'a') → undefined
      */
      expect(extractValue(undefined, 'a')).toBeUndefined();
    });
  });
});
