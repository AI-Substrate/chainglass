/**
 * Session ID Validator Tests
 *
 * TDD tests for session ID validation utility.
 * Per DYK-02: Security - prevents path traversal attacks.
 *
 * Part of Plan 015: Agent Activity Fidelity Enhancement (Phase 1)
 */

import { describe, expect, it } from 'vitest';
import {
  SessionIdValidationError,
  isValidSessionId,
  validateSessionId,
} from '../../../packages/shared/src/lib/validators/session-id-validator';

describe('validateSessionId', () => {
  describe('valid session IDs', () => {
    it('should accept alphanumeric IDs', () => {
      /*
      Test Doc:
      - Why: Common session ID format from agents
      - Contract: Alphanumeric strings are valid
      - Usage Notes: Most session IDs are alphanumeric
      - Quality Contribution: Ensures basic IDs work
      - Worked Example: 'session123' → valid
      */
      expect(() => validateSessionId('session123')).not.toThrow();
      expect(() => validateSessionId('abc')).not.toThrow();
      expect(() => validateSessionId('12345')).not.toThrow();
    });

    it('should accept IDs with hyphens', () => {
      /*
      Test Doc:
      - Why: UUIDs and slug-style IDs use hyphens
      - Contract: Hyphens are allowed
      - Usage Notes: Common in session-abc-123 patterns
      - Quality Contribution: Supports standard ID formats
      - Worked Example: 'session-abc-123' → valid
      */
      expect(() => validateSessionId('session-abc-123')).not.toThrow();
      expect(() => validateSessionId('a-b-c')).not.toThrow();
      expect(() => validateSessionId('uuid-like-format')).not.toThrow();
    });

    it('should accept IDs with underscores', () => {
      /*
      Test Doc:
      - Why: Snake_case IDs are common
      - Contract: Underscores are allowed
      - Usage Notes: Used in session_123 patterns
      - Quality Contribution: Supports various naming conventions
      - Worked Example: 'session_123' → valid
      */
      expect(() => validateSessionId('session_123')).not.toThrow();
      expect(() => validateSessionId('a_b_c')).not.toThrow();
    });

    it('should accept UUID-like IDs', () => {
      /*
      Test Doc:
      - Why: Agents may use UUIDs for session IDs
      - Contract: UUID format is valid
      - Usage Notes: Full UUID support
      - Quality Contribution: Ensures UUID IDs work
      - Worked Example: '550e8400-e29b-41d4-a716-446655440000' → valid
      */
      expect(() => validateSessionId('550e8400-e29b-41d4-a716-446655440000')).not.toThrow();
    });
  });

  describe('path traversal prevention', () => {
    it('should reject forward slashes', () => {
      /*
      Test Doc:
      - Why: Forward slashes enable directory traversal
      - Contract: / in ID throws SessionIdValidationError
      - Usage Notes: Prevents escaping storage directory
      - Quality Contribution: Critical security test
      - Worked Example: 'session/../../etc/passwd' → throws
      */
      expect(() => validateSessionId('session/hack')).toThrow(SessionIdValidationError);
      expect(() => validateSessionId('/root')).toThrow(SessionIdValidationError);
      expect(() => validateSessionId('a/b/c')).toThrow(SessionIdValidationError);
    });

    it('should reject double dots', () => {
      /*
      Test Doc:
      - Why: .. enables parent directory traversal
      - Contract: .. in ID throws SessionIdValidationError
      - Usage Notes: Even in middle of ID
      - Quality Contribution: Critical security test
      - Worked Example: 'session..hack' → throws
      */
      expect(() => validateSessionId('session..hack')).toThrow(SessionIdValidationError);
      expect(() => validateSessionId('..')).toThrow(SessionIdValidationError);
      expect(() => validateSessionId('a..b')).toThrow(SessionIdValidationError);
    });

    it('should reject backslashes', () => {
      /*
      Test Doc:
      - Why: Backslashes enable directory traversal on Windows
      - Contract: \\ in ID throws SessionIdValidationError
      - Usage Notes: Cross-platform security
      - Quality Contribution: Windows path traversal prevention
      - Worked Example: 'session\\..\\hack' → throws
      */
      expect(() => validateSessionId('session\\hack')).toThrow(SessionIdValidationError);
      expect(() => validateSessionId('a\\b')).toThrow(SessionIdValidationError);
    });
  });

  describe('whitespace prevention', () => {
    it('should reject spaces', () => {
      /*
      Test Doc:
      - Why: Spaces in filenames cause issues
      - Contract: Spaces throw SessionIdValidationError
      - Usage Notes: No whitespace allowed
      - Quality Contribution: Prevents filesystem issues
      - Worked Example: 'session 123' → throws
      */
      expect(() => validateSessionId('session 123')).toThrow(SessionIdValidationError);
      expect(() => validateSessionId(' leading')).toThrow(SessionIdValidationError);
      expect(() => validateSessionId('trailing ')).toThrow(SessionIdValidationError);
    });

    it('should reject tabs and newlines', () => {
      /*
      Test Doc:
      - Why: Other whitespace also problematic
      - Contract: Tabs, newlines throw SessionIdValidationError
      - Usage Notes: All whitespace rejected
      - Quality Contribution: Comprehensive whitespace prevention
      - Worked Example: 'session\\thack' → throws
      */
      expect(() => validateSessionId('session\thack')).toThrow(SessionIdValidationError);
      expect(() => validateSessionId('session\nhack')).toThrow(SessionIdValidationError);
    });
  });

  describe('edge cases', () => {
    it('should reject empty string', () => {
      /*
      Test Doc:
      - Why: Empty session ID is invalid
      - Contract: '' throws SessionIdValidationError
      - Usage Notes: Must have at least one character
      - Quality Contribution: Catches empty input
      - Worked Example: '' → throws
      */
      expect(() => validateSessionId('')).toThrow(SessionIdValidationError);
    });

    it('should reject very long IDs', () => {
      /*
      Test Doc:
      - Why: Prevent filesystem path length issues
      - Contract: IDs > 255 chars throw SessionIdValidationError
      - Usage Notes: Reasonable limit for filesystem
      - Quality Contribution: Prevents path length errors
      - Worked Example: 'a'.repeat(256) → throws
      */
      const longId = 'a'.repeat(256);
      expect(() => validateSessionId(longId)).toThrow(SessionIdValidationError);
    });

    it('should accept IDs at max length', () => {
      /*
      Test Doc:
      - Why: Boundary test for max length
      - Contract: IDs of exactly 255 chars are valid
      - Usage Notes: Max length is inclusive
      - Quality Contribution: Precise boundary testing
      - Worked Example: 'a'.repeat(255) → valid
      */
      const maxLengthId = 'a'.repeat(255);
      expect(() => validateSessionId(maxLengthId)).not.toThrow();
    });

    it('should reject single dot', () => {
      /*
      Test Doc:
      - Why: Single dot is current directory
      - Contract: '.' throws SessionIdValidationError
      - Usage Notes: Prevents directory reference
      - Quality Contribution: Edge case handling
      - Worked Example: '.' → throws
      */
      expect(() => validateSessionId('.')).toThrow(SessionIdValidationError);
    });
  });
});

describe('isValidSessionId', () => {
  it('should return true for valid IDs', () => {
    /*
    Test Doc:
    - Why: Non-throwing validation for conditional checks
    - Contract: Returns true for valid IDs
    - Usage Notes: Use when you don't want exceptions
    - Quality Contribution: Alternative validation API
    - Worked Example: isValidSessionId('valid') → true
    */
    expect(isValidSessionId('valid-session-123')).toBe(true);
    expect(isValidSessionId('abc_def')).toBe(true);
  });

  it('should return false for invalid IDs', () => {
    /*
    Test Doc:
    - Why: Non-throwing validation returns false
    - Contract: Returns false for invalid IDs
    - Usage Notes: No exception thrown
    - Quality Contribution: Clean boolean API
    - Worked Example: isValidSessionId('../hack') → false
    */
    expect(isValidSessionId('../hack')).toBe(false);
    expect(isValidSessionId('session/path')).toBe(false);
    expect(isValidSessionId('')).toBe(false);
  });
});
