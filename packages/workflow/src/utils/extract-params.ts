/**
 * Parameter extraction utility for Phase 4: Phase Lifecycle.
 *
 * Per DYK Insight #2: Pure dot-notation path traversal only.
 * Agents write explicit values in output JSON; extraction just reads paths.
 *
 * No computed properties (.length), expressions, or cross-references.
 */

/**
 * Extract a value from an object using a dot-notation path.
 *
 * Supports:
 * - Top-level keys: 'count' → obj.count
 * - Nested keys: 'classification.type' → obj.classification.type
 * - Array indices: 'items.0' → obj.items[0]
 * - Combined: 'items.0.name' → obj.items[0].name
 *
 * Returns undefined for:
 * - Missing keys at any level
 * - Null or undefined in path chain
 * - Out-of-bounds array access
 * - Attempting to traverse into primitives
 *
 * @param obj - The object to extract from
 * @param path - Dot-notation path (e.g., 'items.0.name')
 * @returns The extracted value, or undefined if path doesn't exist
 *
 * @example
 * ```typescript
 * extractValue({ count: 3 }, 'count') // → 3
 * extractValue({ a: { b: 'x' } }, 'a.b') // → 'x'
 * extractValue({ items: ['a'] }, 'items.0') // → 'a'
 * extractValue({}, 'missing') // → undefined
 * ```
 */
export function extractValue(obj: unknown, path: string): unknown {
  // Handle null/undefined input
  if (obj === null || obj === undefined) {
    return undefined;
  }

  // Handle empty path - return the object itself
  if (path === '') {
    return obj;
  }

  // Split path into segments
  const segments = path.split('.');

  // Walk the path
  let current: unknown = obj;
  for (const segment of segments) {
    // Cannot traverse into null/undefined
    if (current === null || current === undefined) {
      return undefined;
    }

    // Cannot traverse into primitives
    if (typeof current !== 'object') {
      return undefined;
    }

    // Access the next segment
    // Use type assertion since we've confirmed it's an object
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
