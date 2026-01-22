import type { TokenMetrics } from '../interfaces/agent-types.js';

/**
 * Message type from Claude Code stream-json output.
 */
interface StreamJsonMessage {
  type?: string;
  session_id?: string;
  content?: Array<{ type?: string; text?: string }>;
  result?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  context_window?: number;
}

/**
 * Parser for Claude Code CLI stream-json NDJSON output.
 *
 * Per plan Phase 2: Parses --output-format=stream-json output to extract
 * session IDs and token metrics.
 *
 * Per DYK-07: Session ID appears in ALL messages, not just first.
 * Parse all NDJSON lines, return first session_id found.
 *
 * Per Discovery 03: Tokens are calculated from usage field:
 * used = input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens
 */
export class StreamJsonParser {
  /** Maximum number of NDJSON lines to process (memory protection) */
  private static readonly MAX_LINES = 100_000;
  /** Maximum length of a single NDJSON line (memory protection) */
  private static readonly MAX_LINE_LENGTH = 1_000_000; // 1MB
  /**
   * Extract session ID from stream-json output.
   *
   * Per DYK-07: Parse all NDJSON lines, return first session_id found.
   * This is more resilient than only checking the first message.
   *
   * @param output - Raw NDJSON output from CLI
   * @returns Session ID or undefined if not found
   * @throws Error if input exceeds size limits
   */
  extractSessionId(output: string): string | undefined {
    if (!output || output.trim() === '') {
      return undefined;
    }

    const lines = output.split('\n');
    this._validateInputSize(lines);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed) as StreamJsonMessage;
        if (parsed.session_id) {
          return parsed.session_id;
        }
      } catch {}
    }

    return undefined;
  }

  /**
   * Extract token metrics from stream-json output.
   *
   * Per Discovery 03: Calculate from usage field in Result message.
   * used = input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens
   *
   * Per DYK-03: Returns null when tokens are unavailable (nullable object pattern).
   *
   * @param output - Raw NDJSON output from CLI
   * @returns TokenMetrics or null if not found
   * @throws Error if input exceeds size limits or token values are invalid
   */
  extractTokens(output: string): TokenMetrics | null {
    if (!output || output.trim() === '') {
      return null;
    }

    const lines = output.split('\n');
    this._validateInputSize(lines);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed) as StreamJsonMessage;

        if (parsed.type === 'result' && parsed.usage) {
          const usage = parsed.usage;

          // Validate and extract token fields
          const inputTokens = this._validateTokenValue(usage.input_tokens, 'input_tokens');
          const outputTokens = this._validateTokenValue(usage.output_tokens, 'output_tokens');
          const cacheCreation = this._validateTokenValue(
            usage.cache_creation_input_tokens ?? 0,
            'cache_creation_input_tokens'
          );
          const cacheRead = this._validateTokenValue(
            usage.cache_read_input_tokens ?? 0,
            'cache_read_input_tokens'
          );

          const used = inputTokens + outputTokens + cacheCreation + cacheRead;

          // Validate context_window with default fallback
          // Default: 200000 (Claude Code context window as of 2026-01)
          let contextWindow = 200_000;
          if (parsed.context_window !== undefined) {
            contextWindow = this._validateTokenValue(parsed.context_window, 'context_window');
          }

          return {
            used,
            total: used, // For single turn, total equals used
            limit: contextWindow,
          };
        }
      } catch (error) {
        // Re-throw validation errors, skip malformed JSON
        if (error instanceof Error && error.message.includes('Token field')) {
          throw error;
        }
      }
    }

    return null;
  }

  /**
   * Extract text output from stream-json messages.
   *
   * Extracts text from:
   * - Assistant message content[].text fields
   * - Result message result field
   *
   * @param output - Raw NDJSON output from CLI
   * @returns Output string (may be empty if no content). **Never returns null**.
   *
   * @remarks
   * Unlike extractSessionId() and extractTokens() which return null/undefined for
   * unavailable data, this method always returns a string to distinguish:
   * - Empty string: No output content (valid state)
   * - null: Data unavailable (not applicable for output extraction)
   *
   * @throws Error if input exceeds size limits
   */
  extractOutput(output: string): string {
    if (!output || output.trim() === '') {
      return '';
    }

    const lines = output.split('\n');
    this._validateInputSize(lines);
    const texts: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed) as StreamJsonMessage;

        // Extract from content array (assistant messages)
        if (parsed.content && Array.isArray(parsed.content)) {
          for (const item of parsed.content) {
            if (item.type === 'text' && item.text) {
              texts.push(item.text);
            }
          }
        }

        // Extract from result field (result messages)
        if (parsed.type === 'result' && parsed.result) {
          texts.push(parsed.result);
        }
      } catch {}
    }

    return texts.join('');
  }

  /**
   * Validate NDJSON input size to prevent memory exhaustion.
   *
   * @param lines - Array of NDJSON lines
   * @throws Error if line count or individual line length exceeds limits
   */
  private _validateInputSize(lines: string[]): void {
    if (lines.length > StreamJsonParser.MAX_LINES) {
      throw new Error(`NDJSON exceeds maximum lines: ${StreamJsonParser.MAX_LINES}`);
    }

    for (const line of lines) {
      if (line.length > StreamJsonParser.MAX_LINE_LENGTH) {
        throw new Error(
          `NDJSON line exceeds maximum length: ${StreamJsonParser.MAX_LINE_LENGTH} bytes`
        );
      }
    }
  }

  /**
   * Validate a token value is a non-negative integer.
   *
   * @param value - Value to validate
   * @param fieldName - Field name for error messages
   * @returns The validated number
   * @throws Error if value is not a non-negative integer
   */
  private _validateTokenValue(value: unknown, fieldName: string): number {
    if (typeof value !== 'number') {
      throw new Error(`Token field '${fieldName}' must be a number, got ${typeof value}`);
    }

    if (!Number.isInteger(value)) {
      throw new Error(`Token field '${fieldName}' must be an integer, got ${value}`);
    }

    if (value < 0) {
      throw new Error(`Token field '${fieldName}' cannot be negative, got ${value}`);
    }

    return value;
  }
}
