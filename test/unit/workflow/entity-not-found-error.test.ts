/**
 * Tests for EntityNotFoundError class.
 *
 * Per Phase 1: Entity Interfaces & Pure Data Classes - TDD RED first.
 * Per Critical Discovery 07: EntityNotFoundError must have context fields
 * (entityType, identifier, path, parentContext).
 */

import { EntityNotFoundError } from '@chainglass/workflow';
import { describe, expect, it } from 'vitest';

describe('EntityNotFoundError', () => {
  describe('constructor', () => {
    it('should create error with all required parameters', () => {
      /*
      Test Doc:
      - Why: EntityNotFoundError needs context for debugging and error handling
      - Contract: Constructor accepts entityType, identifier, path, optional parentContext
      - Usage Notes: Thrown by adapters when entity data is missing/corrupt
      - Quality Contribution: Ensures error provides actionable debugging context
      - Worked Example: new EntityNotFoundError('Workflow', 'hello-wf', '/path/to/wf') → has all props
      */
      const error = new EntityNotFoundError(
        'Workflow',
        'hello-wf',
        '/home/user/.chainglass/workflows/hello-wf/current'
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(EntityNotFoundError);
      expect(error.entityType).toBe('Workflow');
      expect(error.identifier).toBe('hello-wf');
      expect(error.path).toBe('/home/user/.chainglass/workflows/hello-wf/current');
      expect(error.parentContext).toBeUndefined();
    });

    it('should create error with optional parentContext', () => {
      /*
      Test Doc:
      - Why: parentContext helps trace navigation failures (e.g., run exists but checkpoint deleted)
      - Contract: parentContext is optional string providing navigation context
      - Usage Notes: Useful when loading entity through navigation chain
      - Quality Contribution: Enables debugging of cascading entity failures
      - Worked Example: Parent 'v001-abc12345' helps identify which checkpoint was expected
      */
      const error = new EntityNotFoundError(
        'Checkpoint',
        'v001-abc12345',
        '/home/user/.chainglass/workflows/hello-wf/checkpoints/v001-abc12345',
        'run-2026-01-25-001'
      );

      expect(error.entityType).toBe('Checkpoint');
      expect(error.identifier).toBe('v001-abc12345');
      expect(error.path).toBe(
        '/home/user/.chainglass/workflows/hello-wf/checkpoints/v001-abc12345'
      );
      expect(error.parentContext).toBe('run-2026-01-25-001');
    });
  });

  describe('message format', () => {
    it('should format message without parentContext', () => {
      /*
      Test Doc:
      - Why: Error message must be human-readable and include all context
      - Contract: Message format: "{entityType} '{identifier}' not found at {path}"
      - Usage Notes: Message appears in logs and CLI error output
      - Quality Contribution: Ensures consistent, parseable error messages
      - Worked Example: "Workflow 'hello-wf' not found at /path/to/wf"
      */
      const error = new EntityNotFoundError(
        'Phase',
        'gather',
        '/home/user/.chainglass/runs/hello-wf/v001-abc/run-001/gather'
      );

      expect(error.message).toBe(
        "Phase 'gather' not found at /home/user/.chainglass/runs/hello-wf/v001-abc/run-001/gather"
      );
    });

    it('should format message with parentContext', () => {
      /*
      Test Doc:
      - Why: parentContext in message helps identify navigation chain failures
      - Contract: Message format: "... (parent: {parentContext})"
      - Usage Notes: Parent context appears in parentheses at end of message
      - Quality Contribution: Enables tracing through entity relationships
      - Worked Example: "... not found at /path (parent: run-001)"
      */
      const error = new EntityNotFoundError(
        'Run',
        'run-2026-01-25-001',
        '/home/user/.chainglass/runs/hello-wf/v001-abc/run-2026-01-25-001',
        'checkpoint v001-abc12345'
      );

      expect(error.message).toBe(
        "Run 'run-2026-01-25-001' not found at /home/user/.chainglass/runs/hello-wf/v001-abc/run-2026-01-25-001 (parent: checkpoint v001-abc12345)"
      );
    });
  });

  describe('error properties', () => {
    it('should have name property set to EntityNotFoundError', () => {
      /*
      Test Doc:
      - Why: Error.name is used for error type checking and serialization
      - Contract: name property is always 'EntityNotFoundError'
      - Usage Notes: Use error.name === 'EntityNotFoundError' for type narrowing
      - Quality Contribution: Enables proper error handling in catch blocks
      - Worked Example: error.name === 'EntityNotFoundError'
      */
      const error = new EntityNotFoundError('Workflow', 'test-wf', '/path');

      expect(error.name).toBe('EntityNotFoundError');
    });

    it('should preserve Error prototype chain', () => {
      /*
      Test Doc:
      - Why: Must work with standard error handling patterns (try/catch, instanceof)
      - Contract: EntityNotFoundError extends Error properly
      - Usage Notes: Can be caught with catch(e) and checked with instanceof Error
      - Quality Contribution: Ensures compatibility with error handling ecosystem
      - Worked Example: error instanceof Error === true
      */
      const error = new EntityNotFoundError('Workflow', 'test-wf', '/path');

      expect(error instanceof Error).toBe(true);
      expect(error.stack).toBeDefined();
    });
  });

  describe('entity types', () => {
    it('should accept Workflow entity type', () => {
      const error = new EntityNotFoundError('Workflow', 'hello-wf', '/path');
      expect(error.entityType).toBe('Workflow');
    });

    it('should accept Checkpoint entity type', () => {
      const error = new EntityNotFoundError('Checkpoint', 'v001-abc', '/path');
      expect(error.entityType).toBe('Checkpoint');
    });

    it('should accept Run entity type', () => {
      const error = new EntityNotFoundError('Run', 'run-001', '/path');
      expect(error.entityType).toBe('Run');
    });

    it('should accept Phase entity type', () => {
      const error = new EntityNotFoundError('Phase', 'gather', '/path');
      expect(error.entityType).toBe('Phase');
    });
  });
});
