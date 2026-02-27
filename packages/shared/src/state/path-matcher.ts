/**
 * Plan 053: GlobalStateSystem — Path Matcher
 *
 * Creates matcher functions for state path patterns.
 * Adapted from Plan 045 `path-matcher.ts` but for colon-delimited state paths.
 * Pure function with no runtime dependencies.
 *
 * Per DYK-02: Domain wildcard must split and check segment count,
 * not just prefix-match. Colons act as hard segment boundaries.
 *
 * Pattern types:
 * - `'*'`                    → Global: matches everything
 * - `'workflow:**'`          → Domain-all: matches everything in domain
 * - `'workflow:*:status'`    → Domain wildcard: any instance, one property
 * - `'workflow:wf-1:*'`      → Instance wildcard: one instance, all properties
 * - `'workflow:wf-1:status'` → Exact: matches only that path
 */

import type { StateMatcher } from './types.js';

/**
 * Create a matcher function for a state path pattern.
 *
 * @param pattern - Pattern to match against (see module docs for syntax)
 * @returns A function that tests whether a given path matches the pattern
 */
export function createStateMatcher(pattern: string): StateMatcher {
  // Global wildcard: matches everything
  if (pattern === '*') {
    return () => true;
  }

  // Domain-all: "workflow:**" → matches anything starting with "workflow:"
  if (pattern.endsWith(':**')) {
    const domain = pattern.slice(0, -3);
    return (path) => {
      const segments = path.split(':');
      return segments[0] === domain;
    };
  }

  // Domain wildcard: "workflow:*:status" → any instance, specific property
  if (pattern.includes(':*:')) {
    const parts = pattern.split(':');
    if (parts.length === 3 && parts[1] === '*') {
      const domain = parts[0];
      const property = parts[2];
      return (path) => {
        const segments = path.split(':');
        return segments.length === 3 && segments[0] === domain && segments[2] === property;
      };
    }
  }

  // Instance wildcard: "workflow:wf-1:*" → specific instance, any property
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -2);
    const prefixSegments = prefix.split(':');
    if (prefixSegments.length === 2) {
      const domain = prefixSegments[0];
      const instanceId = prefixSegments[1];
      return (path) => {
        const segments = path.split(':');
        return segments.length === 3 && segments[0] === domain && segments[1] === instanceId;
      };
    }
  }

  // Exact match
  return (path) => path === pattern;
}
