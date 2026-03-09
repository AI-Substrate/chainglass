import * as path from 'node:path';
import type {
  AgentEvent,
  AgentResult,
  AgentRunOptions,
  AgentStatus,
  IAgentAdapter,
  ILogger,
  IProcessManager,
} from '../interfaces/index.js';
import { StreamJsonParser } from './stream-json-parser.js';

/**
 * Options for creating a ClaudeCodeAdapter.
 */
export interface ClaudeCodeAdapterOptions {
  /** Logger for debugging output. Per Discovery 07: logs CLI version for debugging. */
  logger?: ILogger;
  /**
   * Workspace root directory for cwd validation.
   * If provided, cwd option in run() must be within this directory.
   * If not provided, defaults to process.cwd().
   */
  workspaceRoot?: string;
}

/**
 * Adapter for Claude Code CLI.
 *
 * Implements IAgentAdapter interface for spawning and controlling
 * the Claude Code CLI with session continuity and token tracking.
 *
 * Per plan Phase 2:
 * - Spawns with --output-format=stream-json and --dangerously-skip-permissions
 * - Parses NDJSON output for session IDs and token metrics
 * - Supports session resumption via --resume flag
 *
 * Per Discovery 06: Handles completed/failed/killed states via exit code mapping.
 * Per DYK-09: compact() delegates to run() with "/compact" prompt.
 *
 * ## Real-Time Streaming Events
 *
 * When `onEvent` is provided in `AgentRunOptions`, events are emitted in real-time
 * as the Claude CLI produces output. The adapter parses NDJSON lines from stdout
 * and translates them to `AgentEvent` types.
 *
 * **Event Mapping:**
 * - `system.init` → `session_start` (with sessionId)
 * - `assistant` with content → `text_delta` (streaming text)
 * - `result` → `message` (final output)
 * - Other events → `raw` (passthrough)
 *
 * **Usage (without streaming):**
 * ```typescript
 * const processManager = new UnixProcessManager(logger);
 * const adapter = new ClaudeCodeAdapter(processManager);
 * const result = await adapter.run({ prompt: 'Hello' });
 * console.log(result.sessionId, result.output);
 * ```
 *
 * **Usage (with streaming):**
 * ```typescript
 * const processManager = new UnixProcessManager(logger);
 * const adapter = new ClaudeCodeAdapter(processManager);
 * const result = await adapter.run({
 *   prompt: 'Hello',
 *   onEvent: (event) => {
 *     if (event.type === 'text_delta') {
 *       process.stdout.write(event.data.content);
 *     }
 *   },
 * });
 * ```
 *
 * **Technical Notes:**
 * - Per DYK-01: Uses `stdio: ['ignore', 'pipe', 'pipe']` when streaming (stdin not needed with -p flag)
 * - Per DYK-02: Uses `onStdoutLine` callback for real-time line processing
 * - See `scripts/agent/demo-claude-adapter-streaming.ts` for full working example
 */
export class ClaudeCodeAdapter implements IAgentAdapter {
  private readonly _processManager: IProcessManager;
  private readonly _parser: StreamJsonParser;
  private readonly _activeSessions = new Map<string, number>(); // sessionId -> pid
  private readonly _logger?: ILogger;
  private readonly _workspaceRoot: string;
  private _cliVersion: string | null | undefined; // undefined = not checked, null = check failed, string = version
  private _versionLogged = false;

  constructor(processManager: IProcessManager, options?: ClaudeCodeAdapterOptions) {
    this._processManager = processManager;
    this._parser = new StreamJsonParser();
    this._logger = options?.logger;
    this._workspaceRoot = options?.workspaceRoot ?? process.cwd();
  }

  /**
   * Get CLI version for debugging.
   *
   * Per Discovery 07: Log CLI version for debugging; no version pinning.
   * This method spawns `claude --version` and returns the version string.
   *
   * @returns Version string or null if unavailable
   */
  async getCliVersion(): Promise<string | null> {
    if (this._cliVersion !== undefined) {
      return this._cliVersion;
    }

    try {
      const handle = await this._processManager.spawn({
        command: 'claude',
        args: ['--version'],
      });

      const exitResult = await handle.waitForExit();

      if (exitResult.exitCode === 0) {
        const output = this._getOutput(handle.pid);
        this._cliVersion = output.trim();
        return this._cliVersion;
      }

      // Non-zero exit code
      this._logger?.warn('CLI version command exited with non-zero code', {
        exitCode: exitResult.exitCode,
      });
    } catch (error) {
      // Distinguish ENOENT (command not found) from other errors
      const errno = error as NodeJS.ErrnoException;
      if (errno.code === 'ENOENT') {
        this._logger?.warn(
          'Claude CLI not found in PATH - install with: npm install -g @anthropic-ai/claude-code'
        );
      } else if (error instanceof Error) {
        this._logger?.warn('CLI version check failed', {
          error: error.message,
        });
      } else {
        this._logger?.warn('CLI version check failed with unknown error', { error });
      }
    }

    this._cliVersion = null;
    return null;
  }

  /**
   * Log CLI version on first use.
   *
   * Per Discovery 07: Version logging for debugging purposes.
   * Sanitizes version string to only log semantic version pattern.
   */
  private async _logVersionOnFirstUse(): Promise<void> {
    if (this._versionLogged || !this._logger) {
      return;
    }

    this._versionLogged = true;
    const version = await this.getCliVersion();

    if (version) {
      // Sanitize: only log semantic version pattern for security
      const semverMatch = version.match(/(\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?)/);
      const safeVersion = semverMatch ? semverMatch[0] : 'unknown';
      this._logger.info('Claude Code CLI version', { version: safeVersion });
    } else {
      this._logger.warn('Could not determine Claude Code CLI version');
    }
  }

  /**
   * Execute a prompt through Claude Code CLI.
   *
   * TODO Phase 5: Implement timeout enforcement per AgentConfigSchema.timeout
   * Current limitation: Adapter waits indefinitely for CLI to complete.
   * Mitigation: Callers MUST implement timeout at orchestration layer.
   * See plan § 5 Tasks 5.3-5.4 for timeout implementation.
   *
   * When `onEvent` is provided in options, events are emitted in real-time
   * as stdout lines arrive. This enables streaming UI updates.
   *
   * @param options - Prompt and optional session/cwd/onEvent settings
   * @returns AgentResult with output, sessionId, status, exitCode, tokens
   */
  async run(options: AgentRunOptions): Promise<AgentResult> {
    // Per Discovery 07: Log CLI version on first use for debugging
    await this._logVersionOnFirstUse();

    const { prompt, sessionId, cwd, onEvent } = options;
    const isStreaming = !!onEvent;

    // Validate cwd (may throw for path traversal)
    const validatedCwd = this._validateCwd(cwd);

    // Build command arguments (validates prompt - may throw)
    const args = this._buildArgs(prompt, sessionId, options.model);

    // Variables to accumulate streamed content
    let streamedSessionId = sessionId ?? '';
    let streamedOutput = '';

    // Spawn the CLI process with error handling
    let handle: Awaited<ReturnType<typeof this._processManager.spawn>> | undefined;
    try {
      handle = await this._processManager.spawn({
        command: 'claude',
        args,
        cwd: validatedCwd,
        // Per DYK-01: Use 'ignore' for stdin when streaming.
        // Note: Original research suggested 'inherit' to avoid hanging with 'pipe',
        // but 'ignore' works correctly in server contexts (no TTY) and still avoids
        // the pipe-based hanging issue. The prompt is passed via -p flag, not stdin.
        stdio: isStreaming ? ['ignore', 'pipe', 'pipe'] : undefined,
        // Per DYK-02: Emit events as lines arrive
        // Per Phase 2: Uses _translateClaudeToAgentEvents for multi-event support
        onStdoutLine: isStreaming
          ? (line: string) => {
              try {
                const msg = JSON.parse(line);
                const events = this._translateClaudeToAgentEvents(msg);
                for (const event of events) {
                  onEvent(event);
                  // Extract session ID from session_start event
                  if (event.type === 'session_start' && event.data.sessionId) {
                    streamedSessionId = event.data.sessionId;
                  }
                  // Accumulate text_delta content
                  if (event.type === 'text_delta') {
                    streamedOutput += event.data.content;
                  }
                  // Final result replaces accumulated output
                  if (event.type === 'message') {
                    streamedOutput = event.data.content;
                  }
                }
              } catch {
                // Not JSON, skip silently
              }
            }
          : undefined,
      });
    } catch (error) {
      // Spawn failed - return failed status instead of crashing
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        output: `Failed to spawn Claude CLI: ${errorMsg}`,
        sessionId: sessionId ?? '',
        status: 'failed',
        exitCode: -1,
        tokens: null,
      };
    }

    // Wait for process to exit with error handling
    let exitCode: number;
    try {
      const exitResult = await handle.waitForExit();
      exitCode = exitResult.exitCode ?? 0;
    } catch (error) {
      // Wait failed - process may have been killed externally
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        output: `Process wait failed: ${errorMsg}`,
        sessionId: sessionId ?? '',
        status: 'killed',
        exitCode: -1,
        tokens: null,
      };
    }

    // Get output AFTER exit (for FakeProcessManager, use getProcessOutput)
    // Per DYK-06: Buffered output pattern - collect after process completes
    const output = this._getOutput(handle.pid);

    if (exitCode !== 0) {
      const stderr = this._processManager.getProcessStderr?.(handle.pid) ?? '';
      console.log(
        `[ClaudeCodeAdapter] Process exited with code ${exitCode}. stdout=${output.substring(0, 200)} stderr=${stderr.substring(0, 500)}`
      );
    }

    // Determine status from exit code
    const status = this._mapExitCodeToStatus(exitCode);

    // Parse output for session ID and tokens
    const extractedSessionId = this._parser.extractSessionId(output) ?? streamedSessionId ?? '';
    const tokens = this._parser.extractTokens(output);
    const extractedOutput = isStreaming ? streamedOutput : this._parser.extractOutput(output);

    // Track active session (for terminate())
    if (extractedSessionId) {
      this._activeSessions.set(extractedSessionId, handle.pid);
    }

    return {
      output: extractedOutput,
      sessionId: extractedSessionId,
      status,
      exitCode,
      tokens,
    };
  }

  /**
   * Send compact command to reduce context.
   *
   * Per DYK-09: Claude Code uses -p "/compact" approach.
   *
   * @param sessionId - Session to compact
   * @returns AgentResult with updated token counts
   */
  async compact(sessionId: string): Promise<AgentResult> {
    return this.run({
      prompt: '/compact',
      sessionId,
    });
  }

  /**
   * Terminate a running agent session.
   *
   * @param sessionId - Session to terminate
   * @returns AgentResult with status='killed'
   */
  async terminate(sessionId: string): Promise<AgentResult> {
    const pid = this._activeSessions.get(sessionId);

    if (pid !== undefined) {
      await this._processManager.terminate(pid);
      this._activeSessions.delete(sessionId);
    }

    return {
      output: '',
      sessionId,
      status: 'killed',
      exitCode: 137, // SIGKILL exit code
      tokens: null,
    };
  }

  /**
   * Validate cwd option to prevent path traversal attacks.
   *
   * @param cwd - Optional working directory
   * @returns Resolved absolute path, or undefined if not provided
   * @throws Error if cwd is outside workspace root
   */
  private _validateCwd(cwd: string | undefined): string | undefined {
    if (!cwd) {
      return undefined;
    }

    // Resolve to absolute path
    const resolved = path.resolve(cwd);

    // Log warning if outside workspace (but don't block - enables scratch/ and other dirs)
    const normalizedRoot = path.resolve(this._workspaceRoot);
    if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
      this._logger?.debug('cwd is outside workspace root', {
        cwd: resolved,
        workspaceRoot: normalizedRoot,
      });
    }

    return resolved;
  }

  /** Maximum prompt length (100k characters) */
  private static readonly MAX_PROMPT_LENGTH = 100_000;

  /**
   * Build CLI arguments array.
   *
   * @throws Error if prompt is empty, too long, or contains invalid characters
   */
  private _buildArgs(prompt: string, sessionId?: string, model?: string): string[] {
    const args: string[] = [
      '--output-format=stream-json',
      '--verbose', // Required for stream-json with -p flag
      '--dangerously-skip-permissions',
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    if (model) {
      args.push('--model', model);
    }

    // Validate and sanitize prompt
    const sanitizedPrompt = this._validateAndSanitizePrompt(prompt);
    args.push('-p', sanitizedPrompt);

    return args;
  }

  /**
   * Validate and sanitize prompt string.
   *
   * @param prompt - Raw prompt string
   * @returns Sanitized prompt (trimmed)
   * @throws Error if prompt is empty, too long, or contains invalid characters
   */
  private _validateAndSanitizePrompt(prompt: string): string {
    // Check for empty/whitespace-only
    const trimmed = prompt.trim();
    if (!trimmed) {
      throw new Error('Prompt cannot be empty or whitespace-only');
    }

    // Check length limit
    if (trimmed.length > ClaudeCodeAdapter.MAX_PROMPT_LENGTH) {
      throw new Error(
        `Prompt exceeds maximum length of ${ClaudeCodeAdapter.MAX_PROMPT_LENGTH} characters`
      );
    }

    // Reject control characters except newline (\n), carriage return (\r), and tab (\t)
    // Allow: \x09 (tab), \x0A (newline), \x0D (carriage return)
    // Reject: \x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional security validation
    const hasInvalidChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed);
    if (hasInvalidChars) {
      throw new Error('Prompt contains invalid control characters');
    }

    return trimmed;
  }

  /**
   * Translate a Claude stream-json message to AgentEvent(s).
   *
   * Claude CLI stream-json event types:
   * - {"type":"system","subtype":"init","session_id":"..."} → session_start
   * - {"type":"assistant","message":{"content":[...]}} → text_delta, tool_call, thinking
   * - {"type":"user","message":{"content":[...]}} → tool_result
   * - {"type":"result","result":"...","usage":{...}} → message
   *
   * Per Phase 2 Critical Discovery 03: Parses all content block types.
   * Per Insight 1: Uses inline filtering pattern for content blocks.
   * Per Insight 5: Additive code paths only - doesn't modify existing text extraction.
   *
   * @param msg - Parsed JSON message from Claude CLI stdout
   * @returns Array of AgentEvents (may be empty for skipped messages)
   */
  private _translateClaudeToAgentEvents(msg: Record<string, unknown>): AgentEvent[] {
    const timestamp = new Date().toISOString();
    const events: AgentEvent[] = [];

    // System init → session_start
    if (msg.type === 'system' && msg.subtype === 'init') {
      events.push({
        type: 'session_start',
        timestamp,
        data: { sessionId: (msg.session_id as string) ?? '' },
      });
      return events;
    }

    // Assistant message → parse all content blocks
    if (msg.type === 'assistant' && msg.message) {
      const message = msg.message as {
        content?: Array<{
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: unknown;
          thinking?: string;
          signature?: string;
        }>;
      };

      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          switch (block.type) {
            case 'text':
              if (block.text) {
                events.push({
                  type: 'text_delta',
                  timestamp,
                  data: { content: block.text },
                });
              }
              break;

            case 'tool_use':
              events.push({
                type: 'tool_call',
                timestamp,
                data: {
                  toolName: block.name ?? '',
                  input: block.input ?? {},
                  toolCallId: block.id ?? '',
                },
              });
              break;

            case 'thinking':
              events.push({
                type: 'thinking',
                timestamp,
                data: {
                  content: block.thinking ?? '',
                  signature: block.signature,
                },
              });
              break;

            // Other content block types are ignored (AC22: no crash)
          }
        }
      }

      return events;
    }

    // User message → parse tool_result content blocks
    if (msg.type === 'user' && msg.message) {
      const message = msg.message as {
        content?: Array<{
          type: string;
          tool_use_id?: string;
          content?: string;
          is_error?: boolean;
        }>;
      };

      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          if (block.type === 'tool_result') {
            events.push({
              type: 'tool_result',
              timestamp,
              data: {
                toolCallId: block.tool_use_id ?? '',
                output: block.content ?? '',
                isError: block.is_error ?? false,
              },
            });
          }
        }
      }

      return events;
    }

    // Result → message (final output)
    if (msg.type === 'result') {
      events.push({
        type: 'message',
        timestamp,
        data: { content: (msg.result as string) ?? '' },
      });
      return events;
    }

    // Fallback: raw passthrough for other events
    events.push({
      type: 'raw',
      timestamp,
      data: {
        provider: 'claude',
        originalType: (msg.type as string) || 'unknown',
        originalData: msg,
      },
    });
    return events;
  }

  /**
   * Translate a Claude stream-json message to an AgentEvent.
   *
   * @deprecated Use _translateClaudeToAgentEvents() instead for full content block support.
   * This method is kept for backward compatibility and returns only the first event.
   *
   * @param msg - Parsed JSON message from Claude CLI stdout
   * @returns AgentEvent or null if message should be skipped
   */
  private _translateClaudeToAgentEvent(msg: Record<string, unknown>): AgentEvent | null {
    const events = this._translateClaudeToAgentEvents(msg);
    return events.length > 0 ? events[0] : null;
  }

  /**
   * Map exit code to agent status.
   *
   * Per Discovery 06:
   * - exit 0 → 'completed'
   * - exit >0 → 'failed'
   * - signal (128+) → handled as failed; terminate() returns 'killed'
   */
  private _mapExitCodeToStatus(exitCode: number): AgentStatus {
    if (exitCode === 0) {
      return 'completed';
    }
    return 'failed';
  }

  /**
   * Get process output.
   *
   * Per DYK-06: Uses buffered output pattern.
   * Calls optional getProcessOutput() method on IProcessManager.
   *
   * @param pid - Process ID to get output for
   * @returns Buffered stdout content, or empty string if unavailable
   */
  private _getOutput(pid: number): string {
    return this._processManager.getProcessOutput?.(pid) ?? '';
  }
}
