/**
 * Shared ignore-pattern compilation for file watchers.
 *
 * Per Plan 085: extracted verbatim from NativeFileWatcherAdapter so the native
 * and polling adapters share *identical* ignore semantics — preventing drift
 * between the two watchers (Finding 06).
 *
 * Patterns may be:
 * - string  → substring match against the absolute path
 * - RegExp  → tested against the absolute path
 * - function → used as-is (predicate over the absolute path)
 */

/** An ignore pattern accepted by file watchers (mirrors `FileWatcherOptions.ignored`). */
export type IgnorePattern = string | RegExp | ((path: string) => boolean);

/** Compile mixed ignore patterns (string, RegExp, function) into uniform predicates. */
export function compileIgnorePatterns(
  patterns: IgnorePattern[]
): ((absolutePath: string) => boolean)[] {
  return patterns.map((pattern) => {
    if (typeof pattern === 'function') return pattern;
    if (pattern instanceof RegExp) return (p: string) => pattern.test(p);
    // String pattern: match as substring in path
    return (p: string) => p.includes(pattern);
  });
}
