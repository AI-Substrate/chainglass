/**
 * Plan 053: GlobalStateSystem — Path Parser Tests
 *
 * Full TDD: Tests for parsePath() covering all segment counts,
 * validation rules, and error cases.
 *
 * Per DYK-03: Tests are syntax-only — no domain registration semantics.
 * Per DYK-10: Domain names are strict kebab-case; instance IDs are permissive.
 */

import { parsePath } from '@chainglass/shared/state';
import { describe, expect, it } from 'vitest';

describe('parsePath', () => {
  // ═══════════════════════════════════════════════════════════
  // 2-segment paths (singleton domains)
  // ═══════════════════════════════════════════════════════════

  describe('2-segment singleton paths', () => {
    it('parses domain:property', () => {
      /**
       * Why: Foundational contract — singleton path shape must be stable.
       * Contract: parsePath('domain:property') returns domain/property with null instanceId.
       * Usage Notes: Singleton domains (worktree, workflow-summary) use 2-segment paths.
       * Quality Contribution: Catches parser regressions in segment interpretation.
       * Worked Example: worktree:active-file → { domain:'worktree', instanceId:null, property:'active-file' }
       */
      const result = parsePath('worktree:active-file');
      expect(result.domain).toBe('worktree');
      expect(result.instanceId).toBeNull();
      expect(result.property).toBe('active-file');
      expect(result.raw).toBe('worktree:active-file');
    });

    it('parses single-char domain and property', () => {
      const result = parsePath('a:b');
      expect(result.domain).toBe('a');
      expect(result.property).toBe('b');
    });

    it('parses kebab-case with numbers', () => {
      const result = parsePath('workflow-summary:active-count');
      expect(result.domain).toBe('workflow-summary');
      expect(result.property).toBe('active-count');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3-segment paths (multi-instance domains)
  // ═══════════════════════════════════════════════════════════

  describe('3-segment multi-instance paths', () => {
    it('parses domain:instanceId:property', () => {
      /**
       * Why: Multi-instance domains are the primary use case (workflows, agents).
       * Contract: parsePath('domain:id:property') returns all three segments parsed.
       * Usage Notes: Instance IDs are opaque — chosen by the publishing domain.
       * Quality Contribution: Validates the 3-segment happy path that most state operations use.
       * Worked Example: workflow:wf-build-pipeline:status → { domain:'workflow', instanceId:'wf-build-pipeline', property:'status' }
       */
      const result = parsePath('workflow:wf-build-pipeline:status');
      expect(result.domain).toBe('workflow');
      expect(result.instanceId).toBe('wf-build-pipeline');
      expect(result.property).toBe('status');
      expect(result.raw).toBe('workflow:wf-build-pipeline:status');
    });

    it('allows uppercase and underscore in instance IDs', () => {
      // DYK-10: Instance IDs are permissive [a-zA-Z0-9_-]+
      // while domains/properties are strict kebab [a-z][a-z0-9-]*
      const result = parsePath('workflow:WF-123_abc:status');
      expect(result.instanceId).toBe('WF-123_abc');
    });

    it('allows numeric-starting instance IDs', () => {
      const result = parsePath('agent:123-abc:status');
      expect(result.instanceId).toBe('123-abc');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // raw field preservation
  // ═══════════════════════════════════════════════════════════

  describe('raw field', () => {
    it('preserves original path string for 2 segments', () => {
      expect(parsePath('worktree:branch').raw).toBe('worktree:branch');
    });

    it('preserves original path string for 3 segments', () => {
      expect(parsePath('workflow:wf-1:status').raw).toBe('workflow:wf-1:status');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Invalid segment counts
  // ═══════════════════════════════════════════════════════════

  describe('invalid segment counts', () => {
    it('rejects 1 segment', () => {
      expect(() => parsePath('workflow')).toThrow('expected 2 segments');
    });

    it('rejects 4 segments with descriptive error', () => {
      /**
       * Why: Per DYK-01, only 2/3 segments are supported. 4 segments is the most likely mistake.
       * Contract: parsePath throws with message naming both valid forms and the actual count.
       * Usage Notes: Error message guides developer to correct path format.
       * Quality Contribution: Prevents silent acceptance of malformed paths.
       * Worked Example: workflow:wf-1:config:timeout → throws "expected 2 segments ... or 3 segments ..., got 4"
       */
      expect(() => parsePath('workflow:wf-1:config:timeout')).toThrow(
        'expected 2 segments (domain:property) or 3 segments (domain:instanceId:property), got 4'
      );
    });

    it('rejects 5 segments', () => {
      expect(() => parsePath('a:b:c:d:e')).toThrow('got 5');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Empty segments
  // ═══════════════════════════════════════════════════════════

  describe('empty segments', () => {
    it('rejects empty segment (leading colon)', () => {
      expect(() => parsePath(':property')).toThrow('contains empty segment');
    });

    it('rejects empty segment (trailing colon)', () => {
      expect(() => parsePath('domain:')).toThrow('contains empty segment');
    });

    it('rejects empty segment (middle)', () => {
      expect(() => parsePath('domain::property')).toThrow('contains empty segment');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Invalid input types
  // ═══════════════════════════════════════════════════════════

  describe('invalid input', () => {
    it('rejects empty string', () => {
      expect(() => parsePath('')).toThrow('expected non-empty string');
    });

    it('rejects non-string input', () => {
      // @ts-expect-error — testing runtime guard
      expect(() => parsePath(null)).toThrow('expected non-empty string');
      // @ts-expect-error — testing runtime guard
      expect(() => parsePath(undefined)).toThrow('expected non-empty string');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Segment format validation
  // ═══════════════════════════════════════════════════════════

  describe('domain format validation', () => {
    it('rejects uppercase domain', () => {
      /**
       * Why: Per DYK-10, domains are strict kebab-case only — prevents naming inconsistency.
       * Contract: parsePath throws when domain doesn't match [a-z][a-z0-9-]*.
       * Usage Notes: Instance IDs allow uppercase (permissive), but domains/properties don't.
       * Quality Contribution: Enforces consistent naming across all state domains.
       * Worked Example: Workflow:status → throws 'domain "Workflow" must match [a-z][a-z0-9-]*'
       */
      expect(() => parsePath('Workflow:status')).toThrow('domain "Workflow" must match');
    });

    it('rejects leading-dash domain', () => {
      expect(() => parsePath('-workflow:status')).toThrow('domain "-workflow" must match');
    });

    it('rejects underscore in domain', () => {
      // Domains are kebab-case only — underscores are NOT allowed
      expect(() => parsePath('workflow_ui:status')).toThrow('domain "workflow_ui" must match');
    });

    it('rejects numeric-starting domain', () => {
      expect(() => parsePath('123:status')).toThrow('domain "123" must match');
    });
  });

  describe('property format validation', () => {
    it('rejects uppercase property', () => {
      expect(() => parsePath('worktree:Status')).toThrow('property "Status" must match');
    });

    it('rejects underscore in property', () => {
      expect(() => parsePath('worktree:active_file')).toThrow('property "active_file" must match');
    });
  });

  describe('instance ID format validation', () => {
    it('rejects space in instance ID', () => {
      expect(() => parsePath('workflow:wf 1:status')).toThrow('instanceId "wf 1" must match');
    });

    it('rejects empty-like instance ID (caught by empty segment check)', () => {
      expect(() => parsePath('workflow::status')).toThrow('contains empty segment');
    });

    it('accepts all valid instance ID characters', () => {
      // [a-zA-Z0-9_-]+ — uppercase, lowercase, digits, underscore, dash
      const result = parsePath('workflow:aZ09_-test:status');
      expect(result.instanceId).toBe('aZ09_-test');
    });
  });
});
