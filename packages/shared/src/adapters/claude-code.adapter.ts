import * as path from 'node:path';
import type {
  IAgentAdapter,
  AgentResult,
  AgentRunOptions,
  AgentStatus,
  IProcessManager,
  ILogger,
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
 * Usage:
 * ```typescript
 * const adapter = new ClaudeCodeAdapter(processManager);
 * const result = await adapter.run({ prompt: 'Hello' });
 * console.log(result.sessionId, result.tokens);
 * ```
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
   * @param options - Prompt and optional session/cwd settings
   * @returns AgentResult with output, sessionId, status, exitCode, tokens
   */
  async run(options: AgentRunOptions): Promise<AgentResult> {
    // Per Discovery 07: Log CLI version on first use for debugging
    await this._logVersionOnFirstUse();

    const { prompt, sessionId, cwd } = options;

    // Validate cwd (may throw for path traversal)
    const validatedCwd = this._validateCwd(cwd);

    // Build command arguments (validates prompt - may throw)
    const args = this._buildArgs(prompt, sessionId);

    // Spawn the CLI process with error handling
    let handle;
    try {
      handle = await this._processManager.spawn({
        command: 'claude',
        args,
        cwd: validatedCwd,
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

    // Determine status from exit code
    const status = this._mapExitCodeToStatus(exitCode);

    // Parse output for session ID and tokens
    const extractedSessionId = this._parser.extractSessionId(output) ?? sessionId ?? '';
    const tokens = this._parser.extractTokens(output);
    const extractedOutput = this._parser.extractOutput(output);

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
    const normalizedRoot = path.resolve(this._workspaceRoot);

    // Ensure cwd is within workspace (or is the workspace itself)
    if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
      throw new Error(
        `cwd must be within workspace. Got: ${cwd}, Expected within: ${normalizedRoot}`
      );
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
  private _buildArgs(prompt: string, sessionId?: string): string[] {
    const args: string[] = [
      '--output-format=stream-json',
      '--verbose', // Required for stream-json with -p flag
      '--dangerously-skip-permissions',
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
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
    const hasInvalidChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed);
    if (hasInvalidChars) {
      throw new Error('Prompt contains invalid control characters');
    }

    return trimmed;
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
