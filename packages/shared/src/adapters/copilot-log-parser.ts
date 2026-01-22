/**
 * Parser for GitHub Copilot CLI log files.
 *
 * Per plan Phase 4 and Discovery 05: Copilot writes session data to log files
 * asynchronously. The session ID is extracted via regex pattern matching.
 *
 * Unlike ClaudeCode's stream-json (NDJSON), Copilot logs are plain text with
 * embedded session information in the format:
 *   "events to session <UUID>"
 *
 * Usage:
 * ```typescript
 * const parser = new CopilotLogParser();
 * const sessionId = parser.extractSessionId(logContent);
 * if (sessionId) {
 *   console.log(`Session: ${sessionId}`);
 * } else {
 *   console.log('Session ID not found, using fallback');
 * }
 * ```
 */
export class CopilotLogParser {
  /**
   * Regex pattern to extract session UUID from log content.
   *
   * Pattern: "events to session <UUID>"
   * UUID format: 8-4-4-4-12 hex characters (36 total with dashes)
   *
   * Per research scripts (copilot-session-demo.ts, test-model-tokens-copilot.ts):
   * This pattern is used by Copilot CLI to log session information.
   */
  private static readonly SESSION_REGEX = /events to session ([0-9a-fA-F-]{36})/;

  /**
   * Extract session ID from Copilot log file content.
   *
   * Per plan AC-1/AC-17: Returns session ID for session resumption.
   * Per Discovery 05: When extraction fails, caller should generate fallback session ID.
   *
   * @param logContent - Raw content from Copilot log file(s)
   * @returns Session UUID string, or undefined if not found/invalid
   */
  extractSessionId(logContent: string): string | undefined {
    if (!logContent) {
      return undefined;
    }

    const match = logContent.match(CopilotLogParser.SESSION_REGEX);

    if (match && match[1]) {
      return match[1];
    }

    return undefined;
  }
}
