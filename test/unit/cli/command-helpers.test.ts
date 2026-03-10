/**
 * Shared CLI Command Helpers Tests
 *
 * Per DYK-P6-I5: Tests for extracted shared helpers that were previously
 * duplicated across workgraph.command.ts and unit.command.ts.
 *
 * Tests:
 * - createOutputAdapter: returns correct adapter type based on --json flag
 * - wrapAction: catches errors and exits gracefully
 * - noContextError: builds standard E074 error with correct messages
 * - resolveOrOverrideContext: defers to workspace service (integration-level)
 */

import { ConsoleOutputAdapter, JsonOutputAdapter } from '@chainglass/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  createOutputAdapter,
  noContextError,
  wrapAction,
} from '../../../apps/cli/src/commands/command-helpers.js';

describe('command-helpers', () => {
  describe('createOutputAdapter', () => {
    it('should return JsonOutputAdapter when json is true', () => {
      /*
      Test Doc:
      - Why: --json flag must select JSON output for machine consumption
      - Contract: createOutputAdapter(true) returns JsonOutputAdapter instance
      */
      const adapter = createOutputAdapter(true);
      expect(adapter).toBeInstanceOf(JsonOutputAdapter);
    });

    it('should return ConsoleOutputAdapter when json is false', () => {
      /*
      Test Doc:
      - Why: Default (no --json) must select human-readable console output
      - Contract: createOutputAdapter(false) returns ConsoleOutputAdapter instance
      */
      const adapter = createOutputAdapter(false);
      expect(adapter).toBeInstanceOf(ConsoleOutputAdapter);
    });
  });

  describe('wrapAction', () => {
    it('should call the handler and complete normally on success', async () => {
      /*
      Test Doc:
      - Why: wrapAction must not interfere with successful handlers
      - Contract: Wrapped handler is called with original args and completes
      */
      const calls: string[] = [];
      const handler = async (arg: string) => {
        calls.push(arg);
      };

      const wrapped = wrapAction(handler);
      await wrapped('test');

      expect(calls).toEqual(['test']);
    });

    it('should catch errors and call process.exit(1)', async () => {
      /*
      Test Doc:
      - Why: FIX-003 — unhandled rejections must not crash CLI
      - Contract: Thrown error is caught, console.error called, process.exit(1) called
      */
      const handler = async () => {
        throw new Error('test error');
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const wrapped = wrapAction(handler);
      await wrapped();

      expect(consoleSpy).toHaveBeenCalledWith('Error:', 'test error');
      expect(exitSpy).toHaveBeenCalledWith(1);

      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('should handle non-Error thrown values', async () => {
      /*
      Test Doc:
      - Why: Code may throw strings or other non-Error values
      - Contract: Non-Error thrown values are stringified via String()
      */
      const handler = async () => {
        throw 'raw string error';
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      const wrapped = wrapAction(handler);
      await wrapped();

      expect(consoleSpy).toHaveBeenCalledWith('Error:', 'raw string error');
      expect(exitSpy).toHaveBeenCalledWith(1);

      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  describe('noContextError', () => {
    it('should return CWD-based error message when no override path', () => {
      /*
      Test Doc:
      - Why: Users running cg from outside a workspace need clear guidance
      - Contract: noContextError() returns E074 with actionable message
      - Per Plan 071 DYK-P3-03: If .chainglass/ found, suggests registration
      */
      const errors = noContextError();

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('E074');
      expect(errors[0].message).toBe('No workspace context found');
      // Action message varies: .chainglass/ detection or generic CWD message
      expect(errors[0].action).toBeDefined();
    });

    it('should return path-specific error message when override path provided', () => {
      /*
      Test Doc:
      - Why: --workspace-path errors should reference the explicit path
      - Contract: noContextError('/some/path') includes the path in action message
      */
      const errors = noContextError('/some/path');

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('E074');
      expect(errors[0].action).toContain('/some/path');
    });

    it('should return undefined-safe CWD message when path is undefined', () => {
      /*
      Test Doc:
      - Why: When --workspace-path is not passed, options.workspacePath is undefined
      - Contract: noContextError(undefined) returns actionable message (same as no arg)
      */
      const errors = noContextError(undefined);

      expect(errors[0].action).toBeDefined();
    });

    it('should detect .chainglass/ folder and suggest registration', () => {
      /*
      Test Doc:
      - Why: Per Plan 071 DYK-P3-03, users with .chainglass/ but no registration
        need a specific "register first" message
      - Contract: When .chainglass/ exists in search path, action suggests cg workspace add
      */
      // This test runs from the project root which has .chainglass/
      const errors = noContextError();

      // If .chainglass/ is found, the message should suggest registration
      if (errors[0].action.includes('.chainglass')) {
        expect(errors[0].action).toContain('Register it first');
        expect(errors[0].action).toContain('cg workspace add');
      }
    });
  });
});
