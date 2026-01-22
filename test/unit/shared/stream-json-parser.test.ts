import { describe, expect, it } from 'vitest';

import type { TokenMetrics } from '@chainglass/shared';

// Import will fail until T003 implements the parser
import { StreamJsonParser } from '@chainglass/shared';

/**
 * Unit tests for StreamJsonParser.
 *
 * Per plan Task 2.2: Tests cover session ID extraction, token extraction,
 * malformed JSON handling, and missing fields.
 *
 * Per DYK-07: Session ID appears in ALL messages, not just first.
 * Parse all NDJSON lines, return first session_id found.
 *
 * Per Discovery 03: Tokens are calculated from usage field:
 * used = input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens
 */
describe('StreamJsonParser', () => {
  describe('extractSessionId', () => {
    it('should extract session ID from first message', () => {
      /*
      Test Doc:
      - Why: AC-1 requires session ID in result for session resumption
      - Contract: First message with session_id field provides session ID
      - Usage Notes: NDJSON format, one JSON object per line
      - Quality Contribution: Catches parsing regressions
      - Worked Example: {"session_id":"abc"}\n → "abc"
      */
      const parser = new StreamJsonParser();
      const output = '{"type":"message","session_id":"abc-123"}\n{"type":"text","content":"Hello"}';

      const sessionId = parser.extractSessionId(output);

      expect(sessionId).toBe('abc-123');
    });

    it('should extract session ID from any message (DYK-07)', () => {
      /*
      Test Doc:
      - Why: DYK-07 discovered session_id appears in ALL messages
      - Contract: Parse all lines, return first session_id found
      - Usage Notes: Resilient pattern handles partially parsed output
      - Quality Contribution: Ensures extraction works even with malformed first lines
      - Worked Example: {"type":"x"}\n{"session_id":"abc"} → "abc"
      */
      const parser = new StreamJsonParser();
      // First message without session_id, second has it
      const output =
        '{"type":"init"}\n{"type":"message","session_id":"def-456","content":"Hi"}\n{"type":"text"}';

      const sessionId = parser.extractSessionId(output);

      expect(sessionId).toBe('def-456');
    });

    it('should return undefined when no session ID present', () => {
      /*
      Test Doc:
      - Why: Handle edge case where session ID is missing
      - Contract: Returns undefined instead of throwing
      - Usage Notes: Caller must handle undefined case
      - Quality Contribution: Prevents crashes on unexpected output
      - Worked Example: {"type":"text"}\n → undefined
      */
      const parser = new StreamJsonParser();
      const output = '{"type":"message"}\n{"type":"text","content":"Hello"}';

      const sessionId = parser.extractSessionId(output);

      expect(sessionId).toBeUndefined();
    });

    it('should handle malformed JSON gracefully', () => {
      /*
      Test Doc:
      - Why: Real CLI may produce partial/corrupted output
      - Contract: Skip malformed lines, continue parsing
      - Usage Notes: Logs warning for malformed lines (optional)
      - Quality Contribution: Prevents crashes on corrupted output
      - Worked Example: {invalid}\n{"session_id":"abc"} → "abc"
      */
      const parser = new StreamJsonParser();
      const output = '{invalid json here}\n{"session_id":"abc-123"}\n{also bad}';

      const sessionId = parser.extractSessionId(output);

      expect(sessionId).toBe('abc-123');
    });

    it('should handle empty output', () => {
      /*
      Test Doc:
      - Why: CLI may produce no output on errors
      - Contract: Returns undefined for empty string
      - Usage Notes: Check output length before parsing
      - Quality Contribution: Handles edge case gracefully
      - Worked Example: "" → undefined
      */
      const parser = new StreamJsonParser();

      const sessionId = parser.extractSessionId('');

      expect(sessionId).toBeUndefined();
    });
  });

  describe('extractTokens', () => {
    it('should extract token metrics from Result message usage field', () => {
      /*
      Test Doc:
      - Why: AC-9/AC-10/AC-11 require token tracking for compaction decisions
      - Contract: Parse usage field, calculate: used = input + output + cache tokens
      - Usage Notes: Result message has type="result"
      - Quality Contribution: Ensures accurate token tracking
      - Worked Example: usage.input_tokens=100, output_tokens=50 → used=150
      */
      const parser = new StreamJsonParser();
      const resultMessage = {
        type: 'result',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 5,
        },
        context_window: 200000,
      };
      const output = `{"type":"message","session_id":"abc"}\n${JSON.stringify(resultMessage)}`;

      const tokens = parser.extractTokens(output);

      expect(tokens).not.toBeNull();
      expect(tokens?.used).toBe(165); // 100+50+10+5
      expect(tokens?.total).toBe(165); // same as used for single turn
      expect(tokens?.limit).toBe(200000);
    });

    it('should handle missing cache tokens', () => {
      /*
      Test Doc:
      - Why: Some responses may not have cache tokens
      - Contract: Missing cache tokens treated as 0
      - Usage Notes: Only input_tokens and output_tokens are required
      - Quality Contribution: Handles variations in API response
      - Worked Example: usage without cache → still calculates correctly
      */
      const parser = new StreamJsonParser();
      const resultMessage = {
        type: 'result',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
        context_window: 200000,
      };
      const output = JSON.stringify(resultMessage);

      const tokens = parser.extractTokens(output);

      expect(tokens).not.toBeNull();
      expect(tokens?.used).toBe(150); // 100+50+0+0
    });

    it('should return null when no Result message present', () => {
      /*
      Test Doc:
      - Why: Incomplete output may lack Result message
      - Contract: Returns null when usage data unavailable
      - Usage Notes: Per DYK-03 pattern: null for unavailable data
      - Quality Contribution: Indicates missing data vs error
      - Worked Example: no Result → null
      */
      const parser = new StreamJsonParser();
      const output = '{"type":"message","session_id":"abc"}\n{"type":"text","content":"Hello"}';

      const tokens = parser.extractTokens(output);

      expect(tokens).toBeNull();
    });

    it('should return null on malformed Result message', () => {
      /*
      Test Doc:
      - Why: Corrupted output should not crash
      - Contract: Returns null instead of throwing
      - Usage Notes: Caller handles null appropriately
      - Quality Contribution: Graceful degradation
      - Worked Example: {type:"result",usage:null} → null
      */
      const parser = new StreamJsonParser();
      const output = '{"type":"result","usage":null}\n{bad json}';

      const tokens = parser.extractTokens(output);

      expect(tokens).toBeNull();
    });

    it('should handle empty output', () => {
      /*
      Test Doc:
      - Why: CLI may produce no output on errors
      - Contract: Returns null for empty string
      - Usage Notes: Empty output means no token data available
      - Quality Contribution: Handles edge case gracefully
      - Worked Example: "" → null
      */
      const parser = new StreamJsonParser();

      const tokens = parser.extractTokens('');

      expect(tokens).toBeNull();
    });
  });

  describe('extractOutput', () => {
    it('should extract text content from messages', () => {
      /*
      Test Doc:
      - Why: AC-4 requires output field in result
      - Contract: Concatenates text content from all messages
      - Usage Notes: Multiple text blocks may exist
      - Quality Contribution: Ensures full output captured
      - Worked Example: {content:"Hello"}\n{content:"World"} → "Hello\nWorld"
      */
      const parser = new StreamJsonParser();
      const output = [
        '{"type":"assistant","content":[{"type":"text","text":"Hello"}]}',
        '{"type":"assistant","content":[{"type":"text","text":" World"}]}',
      ].join('\n');

      const extracted = parser.extractOutput(output);

      expect(extracted).toBe('Hello World');
    });

    it('should handle result message output field', () => {
      /*
      Test Doc:
      - Why: Result message may contain final output
      - Contract: Extract from result.result field
      - Usage Notes: May be the primary output source
      - Quality Contribution: Handles both output formats
      - Worked Example: {"type":"result","result":"Done"} → "Done"
      */
      const parser = new StreamJsonParser();
      const output = '{"type":"result","result":"Task completed successfully"}';

      const extracted = parser.extractOutput(output);

      expect(extracted).toContain('Task completed successfully');
    });

    it('should return empty string for no content', () => {
      /*
      Test Doc:
      - Why: Some operations may have no text output
      - Contract: Returns empty string instead of null
      - Usage Notes: Consistent string type return
      - Quality Contribution: Simplifies caller handling
      - Worked Example: {} → ""
      */
      const parser = new StreamJsonParser();

      const extracted = parser.extractOutput('');

      expect(extracted).toBe('');
    });
  });

  describe('token validation (FIX-007)', () => {
    it('should reject negative input_tokens', () => {
      /*
      Test Doc:
      - Why: Prevent invalid token metrics from corrupt API data (FIX-007)
      - Contract: Negative tokens throw descriptive error
      - Usage Notes: Validates all token fields independently
      - Quality Contribution: Data integrity enforcement
      - Worked Example: input_tokens=-10 → throws 'cannot be negative'
      */
      const parser = new StreamJsonParser();
      const output = JSON.stringify({
        type: 'result',
        usage: {
          input_tokens: -10,
          output_tokens: 50,
        },
        context_window: 200000,
      });

      expect(() => parser.extractTokens(output)).toThrow("'input_tokens' cannot be negative");
    });

    it('should reject non-integer token values', () => {
      /*
      Test Doc:
      - Why: Token counts must be integers (FIX-007)
      - Contract: Non-integer throws error
      - Usage Notes: 100.5 is invalid
      - Quality Contribution: Data type enforcement
      - Worked Example: input_tokens=100.5 → throws 'must be an integer'
      */
      const parser = new StreamJsonParser();
      const output = JSON.stringify({
        type: 'result',
        usage: {
          input_tokens: 100.5,
          output_tokens: 50,
        },
        context_window: 200000,
      });

      expect(() => parser.extractTokens(output)).toThrow("'input_tokens' must be an integer");
    });

    it('should reject non-number token values', () => {
      /*
      Test Doc:
      - Why: Token counts must be numbers (FIX-007)
      - Contract: String tokens throw error
      - Usage Notes: "100" is invalid
      - Quality Contribution: Data type enforcement
      - Worked Example: input_tokens="100" → throws 'must be a number'
      */
      const parser = new StreamJsonParser();
      const output = JSON.stringify({
        type: 'result',
        usage: {
          input_tokens: '100',
          output_tokens: 50,
        },
        context_window: 200000,
      });

      expect(() => parser.extractTokens(output)).toThrow("'input_tokens' must be a number");
    });

    it('should reject negative context_window', () => {
      /*
      Test Doc:
      - Why: Context window must be positive (FIX-007)
      - Contract: Negative context_window throws error
      - Usage Notes: Validates even default fallback fields
      - Quality Contribution: Complete field validation
      - Worked Example: context_window=-1 → throws 'cannot be negative'
      */
      const parser = new StreamJsonParser();
      const output = JSON.stringify({
        type: 'result',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
        context_window: -1,
      });

      expect(() => parser.extractTokens(output)).toThrow("'context_window' cannot be negative");
    });
  });

  describe('input size limits (FIX-011)', () => {
    it('should reject NDJSON exceeding max lines', () => {
      /*
      Test Doc:
      - Why: Prevent memory exhaustion from huge outputs (FIX-011)
      - Contract: >100k lines throws error
      - Usage Notes: Limit is defensive, real outputs much smaller
      - Quality Contribution: Memory protection
      - Worked Example: 100001 lines → throws 'exceeds maximum lines'
      */
      const parser = new StreamJsonParser();
      const lines = Array(100_001).fill('{"type":"text"}').join('\n');

      expect(() => parser.extractSessionId(lines)).toThrow('exceeds maximum lines');
    });

    it('should reject lines exceeding max length', () => {
      /*
      Test Doc:
      - Why: Prevent memory exhaustion from huge lines (FIX-011)
      - Contract: Line > 1MB throws error
      - Usage Notes: JSON.parse would fail anyway on huge strings
      - Quality Contribution: Early failure with clear message
      - Worked Example: 1MB+ line → throws 'exceeds maximum length'
      */
      const parser = new StreamJsonParser();
      const hugeLine = `{"data":"${'x'.repeat(1_000_001)}"}`;

      expect(() => parser.extractSessionId(hugeLine)).toThrow('exceeds maximum length');
    });

    it('should accept output within limits', () => {
      /*
      Test Doc:
      - Why: Normal outputs should work (FIX-011)
      - Contract: Reasonable size outputs process normally
      - Usage Notes: Most real outputs are <1000 lines
      - Quality Contribution: Ensures limits don't break normal use
      - Worked Example: 1000 lines → processes normally
      */
      const parser = new StreamJsonParser();
      const lines = Array(1000)
        .fill('{"type":"text"}')
        .join('\n')
        .concat('\n{"session_id":"abc-123"}');

      const sessionId = parser.extractSessionId(lines);

      expect(sessionId).toBe('abc-123');
    });
  });
});
