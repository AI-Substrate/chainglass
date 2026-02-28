/**
 * Plan 053: GlobalStateSystem — Path Matcher Tests
 *
 * Full TDD: Tests for createStateMatcher() covering all 5 pattern types
 * plus decision table from Workshop 001.
 *
 * Per DYK-02: Matchers split on ':' and check segment count (not prefix matching).
 * Per DYK-06: Domain wildcard on singleton paths silently returns no matches.
 */

import { createStateMatcher } from '@chainglass/shared/state';
import { describe, expect, it } from 'vitest';

describe('createStateMatcher', () => {
  // ═══════════════════════════════════════════════════════════
  // Exact match
  // ═══════════════════════════════════════════════════════════

  describe('exact match', () => {
    it('matches the exact path', () => {
      /**
       * Why: Exact match is the most common subscription pattern (single value).
       * Contract: createStateMatcher(path)(path) returns true; different paths return false.
       * Usage Notes: Used by useGlobalState('workflow:wf-1:status') for single-value subscriptions.
       * Quality Contribution: Anchor test — all other patterns are variations of this.
       * Worked Example: createStateMatcher('workflow:wf-1:status')('workflow:wf-1:status') → true
       */
      const matcher = createStateMatcher('workflow:wf-1:status');
      expect(matcher('workflow:wf-1:status')).toBe(true);
    });

    it('does not match a different path', () => {
      const matcher = createStateMatcher('workflow:wf-1:status');
      expect(matcher('workflow:wf-1:progress')).toBe(false);
      expect(matcher('workflow:wf-2:status')).toBe(false);
      expect(matcher('worktree:active-file')).toBe(false);
    });

    it('matches exact 2-segment path', () => {
      const matcher = createStateMatcher('worktree:active-file');
      expect(matcher('worktree:active-file')).toBe(true);
      expect(matcher('worktree:branch')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Domain wildcard: workflow:*:status
  // ═══════════════════════════════════════════════════════════

  describe('domain wildcard (workflow:*:status)', () => {
    const matcher = createStateMatcher('workflow:*:status');

    it('matches any instance with target property', () => {
      /**
       * Why: Domain wildcard enables dashboard patterns (show all workflow statuses).
       * Contract: workflow:*:status matches any 3-segment path with matching domain and property.
       * Usage Notes: Used by useGlobalStateList('workflow:*:status') for multi-instance views.
       * Quality Contribution: Per DYK-02, verifies segment-count checking (not prefix matching).
       * Worked Example: createStateMatcher('workflow:*:status')('workflow:wf-2:status') → true
       */
      expect(matcher('workflow:wf-1:status')).toBe(true);
      expect(matcher('workflow:wf-2:status')).toBe(true);
      expect(matcher('workflow:abc-123:status')).toBe(true);
    });

    it('does not match a different property', () => {
      expect(matcher('workflow:wf-1:progress')).toBe(false);
    });

    it('does not match a different domain', () => {
      expect(matcher('agent:wf-1:status')).toBe(false);
    });

    it('does not match a 2-segment path', () => {
      // DYK-06: Domain wildcard on singleton paths returns no match
      expect(matcher('workflow:status')).toBe(false);
    });

    it('checks segment count — does not match via prefix (DYK-02)', () => {
      // A malformed or extended path should not match
      expect(matcher('workflow:wf-1:sub:id:status')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Instance wildcard: workflow:wf-1:*
  // ═══════════════════════════════════════════════════════════

  describe('instance wildcard (workflow:wf-1:*)', () => {
    const matcher = createStateMatcher('workflow:wf-1:*');

    it('matches all properties of the instance', () => {
      /**
       * Why: Instance wildcard enables detail views (show everything about one workflow).
       * Contract: workflow:wf-1:* matches any 3-segment path with matching domain and instance.
       * Usage Notes: Used when a component needs all state for a single entity.
       * Quality Contribution: Per DYK-02, checks segment count to prevent prefix collision.
       * Worked Example: createStateMatcher('workflow:wf-1:*')('workflow:wf-1:progress') → true
       */
      expect(matcher('workflow:wf-1:status')).toBe(true);
      expect(matcher('workflow:wf-1:progress')).toBe(true);
      expect(matcher('workflow:wf-1:current-phase')).toBe(true);
    });

    it('does not match a different instance', () => {
      expect(matcher('workflow:wf-2:status')).toBe(false);
    });

    it('does not match a different domain', () => {
      expect(matcher('agent:wf-1:status')).toBe(false);
    });

    it('does not match a 2-segment path', () => {
      expect(matcher('workflow:wf-1')).toBe(false);
    });

    it('does not match similar-prefix instance (DYK-02)', () => {
      // wf-1-extended starts with wf-1 but is a different instance
      expect(matcher('workflow:wf-1-extended:status')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Domain-all: workflow:**
  // ═══════════════════════════════════════════════════════════

  describe('domain-all (workflow:**)', () => {
    const matcher = createStateMatcher('workflow:**');

    it('matches any path in the domain (3 segments)', () => {
      expect(matcher('workflow:wf-1:status')).toBe(true);
      expect(matcher('workflow:wf-2:progress')).toBe(true);
    });

    it('matches 2-segment paths in the domain', () => {
      // Singleton-style path where domain happens to be 'workflow'
      expect(matcher('workflow:global-count')).toBe(true);
    });

    it('does not match other domains', () => {
      expect(matcher('worktree:active-file')).toBe(false);
      expect(matcher('agent:a1:status')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Global wildcard: *
  // ═══════════════════════════════════════════════════════════

  describe('global wildcard (*)', () => {
    const matcher = createStateMatcher('*');

    it('matches everything', () => {
      expect(matcher('workflow:wf-1:status')).toBe(true);
      expect(matcher('worktree:active-file')).toBe(true);
      expect(matcher('agent:a1:intent')).toBe(true);
      expect(matcher('anything')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Decision table from Workshop 001
  // ═══════════════════════════════════════════════════════════

  describe('decision table (Workshop 001)', () => {
    const paths = {
      a: 'workflow:wf-1:status',
      b: 'workflow:wf-2:progress',
      c: 'worktree:active-file',
    };

    it('exact: workflow:wf-1:status', () => {
      const m = createStateMatcher('workflow:wf-1:status');
      expect(m(paths.a)).toBe(true);
      expect(m(paths.b)).toBe(false);
      expect(m(paths.c)).toBe(false);
    });

    it('domain wildcard: workflow:*:status', () => {
      const m = createStateMatcher('workflow:*:status');
      expect(m(paths.a)).toBe(true);
      expect(m(paths.b)).toBe(false);
      expect(m(paths.c)).toBe(false);
    });

    it('instance wildcard: workflow:wf-1:*', () => {
      const m = createStateMatcher('workflow:wf-1:*');
      expect(m(paths.a)).toBe(true);
      expect(m(paths.b)).toBe(false);
      expect(m(paths.c)).toBe(false);
    });

    it('domain-all: workflow:**', () => {
      const m = createStateMatcher('workflow:**');
      expect(m(paths.a)).toBe(true);
      expect(m(paths.b)).toBe(true);
      expect(m(paths.c)).toBe(false);
    });

    it('global: *', () => {
      const m = createStateMatcher('*');
      expect(m(paths.a)).toBe(true);
      expect(m(paths.b)).toBe(true);
      expect(m(paths.c)).toBe(true);
    });
  });
});
