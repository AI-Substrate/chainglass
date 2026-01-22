/**
 * Recursively deep merge two objects.
 *
 * Per DYK-08:
 * - Nested objects are merged recursively
 * - Arrays are REPLACED entirely (not merged/concatenated)
 * - Later source wins for conflicting keys
 * - null in source replaces target value
 * - undefined in source preserves target value
 * - Circular references are detected and handled (WeakSet)
 * - Original objects are NOT mutated
 *
 * @param target - Base object to merge into
 * @param source - Object with values to merge
 * @returns New merged object (originals unchanged)
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const seen = new WeakSet<object>();
  return deepMergeInternal(target, source, seen) as T;
}

/**
 * Internal recursive merge function with circular reference detection.
 */
function deepMergeInternal(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  seen: WeakSet<object>
): Record<string, unknown> {
  // Create a shallow copy of target to avoid mutation
  const result: Record<string, unknown> = { ...target };

  // Track this object to detect circular references
  if (typeof source === 'object' && source !== null) {
    if (seen.has(source)) {
      // Circular reference detected - return what we have
      return result;
    }
    seen.add(source);
  }

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];

    // undefined in source means "not specified" - preserve target
    if (sourceValue === undefined) {
      continue;
    }

    // null explicitly replaces target
    if (sourceValue === null) {
      result[key] = null;
      continue;
    }

    // Arrays are REPLACED entirely (DYK-08)
    if (Array.isArray(sourceValue)) {
      // Deep copy the array to avoid mutation
      result[key] = deepCopyArray(sourceValue);
      continue;
    }

    // Objects are merged recursively (unless target is not an object)
    if (
      typeof sourceValue === 'object' &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMergeInternal(
        targetValue as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
        seen
      );
      continue;
    }

    // Primitives and type mismatches: source wins
    if (typeof sourceValue === 'object') {
      // Source is object but target is not - deep copy source
      result[key] = deepCopyObject(sourceValue as Record<string, unknown>);
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Deep copy an array, recursively copying nested objects/arrays.
 */
function deepCopyArray(arr: unknown[]): unknown[] {
  return arr.map((item) => {
    if (Array.isArray(item)) {
      return deepCopyArray(item);
    }
    if (typeof item === 'object' && item !== null) {
      return deepCopyObject(item as Record<string, unknown>);
    }
    return item;
  });
}

/**
 * Deep copy an object, recursively copying nested objects/arrays.
 */
function deepCopyObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      result[key] = deepCopyArray(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = deepCopyObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}
