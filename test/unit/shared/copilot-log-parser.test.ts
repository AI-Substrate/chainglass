import { describe, expect, it } from 'vitest';

// NOTE: This import will fail until T003 implements CopilotLogParser (RED phase)
import { CopilotLogParser } from '@chainglass/shared';

/**
 * Unit tests for CopilotLogParser session ID extraction.
 *
 * Per plan Task 4.2: TDD RED phase - tests define expected behavior.
 * Per Discovery 05: Session ID extracted from log files via regex.
 *
 * The Copilot CLI writes logs containing:
 *   "events to session <UUID>"
 *
 * CopilotLogParser extracts this UUID for session resumption.
 */
describe('CopilotLogParser', () => {
  describe('extractSessionId', () => {
    it('should extract session ID from log content with UUID', () => {
      /*
      Test Doc:
      - Why: AC-1/AC-17 requires session ID extraction for resumption
      - Contract: Log line containing "events to session <UUID>" → extracts UUID
      - Usage Notes: UUID is 36 characters (8-4-4-4-12 format)
      - Quality Contribution: Validates core log parsing functionality
      - Worked Example: "events to session abc12345-..." → "abc12345-..."
      */
      const parser = new CopilotLogParser();
      const logContent = `
2026-01-22T12:00:00.000Z INFO Starting Copilot CLI
2026-01-22T12:00:01.000Z INFO events to session a1b2c3d4-e5f6-7890-abcd-ef1234567890
2026-01-22T12:00:02.000Z INFO Processing prompt
      `.trim();

      const sessionId = parser.extractSessionId(logContent);

      expect(sessionId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('should return undefined when no session ID in log content', () => {
      /*
      Test Doc:
      - Why: Graceful handling when log doesn't contain session ID
      - Contract: Log without "events to session" pattern → undefined
      - Usage Notes: Caller should use fallback session ID when undefined
      - Quality Contribution: Ensures graceful degradation
      - Worked Example: "INFO Starting CLI" (no session) → undefined
      */
      const parser = new CopilotLogParser();
      const logContent = `
2026-01-22T12:00:00.000Z INFO Starting Copilot CLI
2026-01-22T12:00:01.000Z INFO No session information
2026-01-22T12:00:02.000Z INFO Processing prompt
      `.trim();

      const sessionId = parser.extractSessionId(logContent);

      expect(sessionId).toBeUndefined();
    });

    it('should return undefined for empty log content', () => {
      /*
      Test Doc:
      - Why: Handle edge case of empty or missing log files
      - Contract: Empty string → undefined (not error)
      - Usage Notes: Happens when log file exists but is empty
      - Quality Contribution: Prevents crashes on edge cases
      - Worked Example: "" → undefined
      */
      const parser = new CopilotLogParser();

      const sessionId = parser.extractSessionId('');

      expect(sessionId).toBeUndefined();
    });

    it('should return undefined for malformed log content', () => {
      /*
      Test Doc:
      - Why: Handle corrupted or non-standard log files
      - Contract: Malformed content → undefined (not crash)
      - Usage Notes: Log format may change; parser is defensive
      - Quality Contribution: Robustness against format changes
      - Worked Example: "events to session NOT-A-VALID-UUID" → undefined
      */
      const parser = new CopilotLogParser();
      const logContent = `
2026-01-22T12:00:00.000Z events to session NOT-A-VALID-UUID
2026-01-22T12:00:01.000Z events to session 12345
2026-01-22T12:00:02.000Z events to session
      `.trim();

      const sessionId = parser.extractSessionId(logContent);

      expect(sessionId).toBeUndefined();
    });

    it('should extract first session ID when multiple present', () => {
      /*
      Test Doc:
      - Why: Handle logs from multiple runs or corrupted concatenation
      - Contract: Multiple session lines → extract first UUID
      - Usage Notes: First session ID is typically the current session
      - Quality Contribution: Deterministic behavior with duplicate data
      - Worked Example: "session A...\nsession B..." → "A..."
      */
      const parser = new CopilotLogParser();
      const logContent = `
2026-01-22T12:00:00.000Z INFO events to session 11111111-1111-1111-1111-111111111111
2026-01-22T12:00:05.000Z INFO events to session 22222222-2222-2222-2222-222222222222
      `.trim();

      const sessionId = parser.extractSessionId(logContent);

      expect(sessionId).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('should handle case-insensitive UUID hex characters', () => {
      /*
      Test Doc:
      - Why: UUIDs may be uppercase, lowercase, or mixed
      - Contract: Hex characters a-f or A-F accepted
      - Usage Notes: Standard UUID format allows either case
      - Quality Contribution: Handles real-world UUID variations
      - Worked Example: "events to session ABCD..." → "ABCD..."
      */
      const parser = new CopilotLogParser();
      const logContent = `events to session ABCDEF12-3456-7890-ABCD-EF1234567890`;

      const sessionId = parser.extractSessionId(logContent);

      expect(sessionId).toBe('ABCDEF12-3456-7890-ABCD-EF1234567890');
    });

    it('should extract session ID from multi-megabyte log content efficiently', () => {
      /*
      Test Doc:
      - Why: Per guardrails: log files may be up to 10MB
      - Contract: Large log content → still extracts session ID
      - Usage Notes: Performance test - regex should stop on first match
      - Quality Contribution: Validates no infinite loops or memory issues
      - Worked Example: 1MB log with session at start → fast extraction
      */
      const parser = new CopilotLogParser();

      // Create a large log: session ID at start, then lots of filler
      const sessionLine = 'events to session 99999999-9999-9999-9999-999999999999';
      const fillerLine = '2026-01-22T12:00:00.000Z DEBUG Some verbose logging output\n';
      const filler = fillerLine.repeat(10000); // ~500KB of filler

      const logContent = sessionLine + '\n' + filler;

      const startTime = Date.now();
      const sessionId = parser.extractSessionId(logContent);
      const elapsed = Date.now() - startTime;

      expect(sessionId).toBe('99999999-9999-9999-9999-999999999999');
      expect(elapsed).toBeLessThan(100); // Should be very fast (< 100ms)
    });
  });
});
