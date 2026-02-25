/**
 * Plan 045: Live File Events
 *
 * Path matcher factory for FileChangeHub pattern subscriptions.
 * Single source of truth — imported by both real hub and fake hub.
 *
 * Pattern types:
 * - '*' → matches everything (wildcard)
 * - 'src/**' → matches all descendants recursively
 * - 'src/components/' → matches direct children only (trailing slash)
 * - 'src/App.tsx' → matches exact path
 */

export type PathMatcher = (path: string) => boolean;

export function createMatcher(pattern: string): PathMatcher {
  // Wildcard: match everything
  if (pattern === '*') {
    return () => true;
  }
  // Recursive: 'src/**' → matches src/ and all descendants
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return (path) => path.startsWith(`${prefix}/`) || path === prefix;
  }
  // Directory: 'src/components/' → direct children only
  if (pattern.endsWith('/')) {
    return (path) => {
      if (!path.startsWith(pattern)) return false;
      return !path.slice(pattern.length).includes('/');
    };
  }
  // Exact match
  return (path) => path === pattern;
}
