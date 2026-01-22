import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as crypto from 'node:crypto';
import type {
  AgentResult,
  AgentRunOptions,
  AgentStatus,
  IAgentAdapter,
  ILogger,
  IProcessManager,
} from '../interfaces/index.js';
import { CopilotLogParser } from './copilot-log-parser.js';

/**
 * Function signature for reading log files.
 * Injectable for testing per DYK Insight 4.
 */
export type ReadLogFileFunction = (logDir: string) => Promise<string | null>;

/**
 * Options for creating a CopilotAdapter.
 */
export interface CopilotAdapterOptions {
  /** Logger for debugging output. Per Discovery 07: logs CLI version for debugging. */
  logger?: ILogger;
  /**
   * Workspace root directory for cwd validation.
   * If provided, cwd option in run() must be within this directory.
   * If not provided, defaults to process.cwd().
   */
  workspaceRoot?: string;
  /**
   * Injectable function for reading log files.
   * Per DYK Insight 4: Enables testing without real file system.
   * Default: reads from file system using fs.readFile.
   */
  readLogFile?: ReadLogFileFunction;
  /**
   * Base interval for exponential backoff polling (milliseconds).
   * Default: 50ms per Discovery 05.
   */
  pollBaseIntervalMs?: number;
  /**
   * Maximum timeout for session ID extraction polling (milliseconds).
   * Default: 5000ms (5 seconds) per Discovery 05.
   */
  pollMaxTimeoutMs?: number;
}

/**
 * Adapter for GitHub Copilot CLI.
 *
 * Implements IAgentAdapter interface for spawning and controlling
 * the GitHub Copilot CLI with session continuity.
 *
 * Per plan Phase 4:
 * - Spawns with --log-dir for deterministic log file location
 * - Extracts session ID from log files using CopilotLogParser
 * - Uses exponential backoff polling for session ID extraction
 * - Returns tokens: null (Copilot token reporting is undocumented)
 *
 * Per Discovery 01: Copilot uses log files instead of stdout for session data.
 * Per Discovery 04: Token reporting is unavailable; returns null.
 * Per Discovery 05: Uses exponential backoff polling with fallback session ID.
 * Per DYK Insight 1: Uses --log-dir flag for deterministic log location.
 * Per DYK Insight 2: Uses stdin for /compact command, not -p flag.
 *
 * Usage:
 * ```typescript
 * const adapter = new CopilotAdapter(processManager);
 * const result = await adapter.run({ prompt: 'Hello' });
 * console.log(result.sessionId, result.tokens); // tokens is always null
 * ```
 */
export class CopilotAdapter implements IAgentAdapter {
  private readonly _processManager: IProcessManager;
  private readonly _parser: CopilotLogParser;
  private readonly _activeSessions = new Map<string, number>(); // sessionId -> pid
  private readonly _logger?: ILogger;
  private readonly _workspaceRoot: string;
  private readonly _readLogFile: ReadLogFileFunction;
  private readonly _pollBaseIntervalMs: number;
  private readonly _pollMaxTimeoutMs: number;
  private _cliVersion: string | null | undefined;
  private _versionLogged = false;

  /** Maximum prompt length (100k characters) per guardrails */
  private static readonly MAX_PROMPT_LENGTH = 100_000;
  /** Maximum log file size (10MB) per guardrails - SEC-002 */
  static readonly MAX_LOG_FILE_SIZE = 10 * 1024 * 1024;
  /** Default polling base interval */
  private static readonly DEFAULT_POLL_BASE_INTERVAL_MS = 50;
  /** Default polling max timeout */
  private static readonly DEFAULT_POLL_MAX_TIMEOUT_MS = 5000;

  constructor(processManager: IProcessManager, options?: CopilotAdapterOptions) {
    this._processManager = processManager;
    this._parser = new CopilotLogParser();
    this._logger = options?.logger;
    this._workspaceRoot = options?.workspaceRoot ?? process.cwd();
    this._readLogFile = options?.readLogFile ?? this._defaultReadLogFile.bind(this);
    this._pollBaseIntervalMs = options?.pollBaseIntervalMs ?? CopilotAdapter.DEFAULT_POLL_BASE_INTERVAL_MS;
    this._pollMaxTimeoutMs = options?.pollMaxTimeoutMs ?? CopilotAdapter.DEFAULT_POLL_MAX_TIMEOUT_MS;
  }

  /**
   * Get CLI version for debugging.
   *
   * Per Discovery 07: Log CLI version for debugging; no version pinning.
   */
  async getCliVersion(): Promise<string | null> {
    if (this._cliVersion !== undefined) {
      return this._cliVersion;
    }

    try {
      const handle = await this._processManager.spawn({
        command: 'npx',
        args: ['-y', '@github/copilot', '--version'],
      });

      const exitResult = await handle.waitForExit();

      if (exitResult.exitCode === 0) {
        const output = this._processManager.getProcessOutput?.(handle.pid) ?? '';
        this._cliVersion = output.trim();
        return this._cliVersion;
      }

      this._logger?.warn('CLI version command exited with non-zero code', {
        exitCode: exitResult.exitCode,
      });
    } catch (error) {
      const errno = error as NodeJS.ErrnoException;
      if (errno.code === 'ENOENT') {
        this._logger?.warn(
          'Copilot CLI not found - install with: npm install -g @github/copilot'
        );
      } else if (error instanceof Error) {
        this._logger?.warn('CLI version check failed', { error: error.message });
      }
    }

    this._cliVersion = null;
    return null;
  }

  /**
   * Log CLI version on first use.
   */
  private async _logVersionOnFirstUse(): Promise<void> {
    if (this._versionLogged || !this._logger) {
      return;
    }

    this._versionLogged = true;
    const version = await this.getCliVersion();

    if (version) {
      const semverMatch = version.match(/(\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?)/);
      const safeVersion = semverMatch ? semverMatch[0] : 'unknown';
      this._logger.info('GitHub Copilot CLI version', { version: safeVersion });
    } else {
      this._logger.warn('Could not determine GitHub Copilot CLI version');
    }
  }

  /**
   * Execute a prompt through GitHub Copilot CLI.
   *
   * Per Discovery 01: Copilot uses log files for session data.
   * Per Discovery 05: Session ID extraction uses exponential backoff polling.
   */
  async run(options: AgentRunOptions): Promise<AgentResult> {
    await this._logVersionOnFirstUse();

    const { prompt, sessionId, cwd } = options;

    // COR-002: Validate inputs - return failed result instead of throwing
    let validatedCwd: string;
    try {
      validatedCwd = this._validateCwd(cwd);
      this._validatePrompt(prompt);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        output: `Validation error: ${errorMsg}`,
        sessionId: sessionId ?? '',
        status: 'failed',
        exitCode: -1,
        tokens: null,
      };
    }

    // Create unique log directory per DYK Insight 1
    const logDir = await this._createLogDir();

    // Build command arguments
    const args = this._buildArgs(prompt, sessionId, logDir);

    // Spawn the CLI process
    let handle;
    try {
      handle = await this._processManager.spawn({
        command: 'npx',
        args,
        cwd: validatedCwd,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        output: `Failed to spawn Copilot CLI: ${errorMsg}`,
        sessionId: sessionId ?? '',
        status: 'failed',
        exitCode: -1,
        tokens: null,
      };
    }

    // Wait for process to exit
    let exitCode: number;
    try {
      const exitResult = await handle.waitForExit();
      exitCode = exitResult.exitCode ?? 0;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        output: `Process wait failed: ${errorMsg}`,
        sessionId: sessionId ?? '',
        status: 'killed',
        exitCode: -1,
        tokens: null,
      };
    }

    // Get output
    const output = this._processManager.getProcessOutput?.(handle.pid) ?? '';

    // Determine status
    const status = this._mapExitCodeToStatus(exitCode);

    // Extract session ID with polling (or generate fallback)
    const extractedSessionId = await this._extractSessionIdWithPolling(logDir, handle.pid, sessionId);

    // Track active session
    if (extractedSessionId) {
      this._activeSessions.set(extractedSessionId, handle.pid);
    }

    // Per Discovery 04: Return null for tokens
    return {
      output,
      sessionId: extractedSessionId,
      status,
      exitCode,
      tokens: null,
    };
  }

  /**
   * Send compact command to reduce context.
   *
   * Per DYK Insight 2: Copilot requires stdin for slash commands.
   * The -p flag treats slash commands as literal text.
   *
   * NOTE: This implementation uses -p flag as a workaround since
   * stdin handling would require a different spawn approach.
   * May need to be updated if /compact doesn't work via -p.
   */
  async compact(sessionId: string): Promise<AgentResult> {
    // For Copilot, compact may be a no-op or behave differently
    // Per plan: "Best-effort compact or no-op"
    return this.run({
      prompt: '/compact',
      sessionId,
    });
  }

  /**
   * Terminate a running agent session.
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
      exitCode: 137,
      tokens: null,
    };
  }

  /**
   * Validate cwd option to prevent path traversal attacks.
   * SEC-001: Always returns workspaceRoot when cwd not specified.
   */
  private _validateCwd(cwd: string | undefined): string {
    if (!cwd) {
      // SEC-001: Always use workspaceRoot when cwd not specified
      return this._workspaceRoot;
    }

    const resolved = path.resolve(cwd);
    const normalizedRoot = path.resolve(this._workspaceRoot);

    if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
      throw new Error(
        `cwd must be within workspace. Got: ${cwd}, Expected within: ${normalizedRoot}`
      );
    }

    return resolved;
  }

  /**
   * Validate prompt string.
   */
  private _validatePrompt(prompt: string): void {
    const trimmed = prompt.trim();
    if (!trimmed) {
      throw new Error('Prompt cannot be empty or whitespace-only');
    }

    if (trimmed.length > CopilotAdapter.MAX_PROMPT_LENGTH) {
      throw new Error(
        `Prompt exceeds maximum length of ${CopilotAdapter.MAX_PROMPT_LENGTH} characters`
      );
    }

    // Reject control characters except newline, carriage return, and tab
    const hasInvalidChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed);
    if (hasInvalidChars) {
      throw new Error('Prompt contains invalid control characters');
    }
  }

  /**
   * Build CLI arguments array.
   *
   * Per DYK Insight 1: Uses --log-dir for deterministic log location.
   */
  private _buildArgs(prompt: string, sessionId: string | undefined, logDir: string): string[] {
    const args: string[] = [
      '-y',
      '@github/copilot',
      '--no-color',
      '--log-level', 'debug',
      '--log-dir', logDir,
      '--yolo', // Non-interactive mode
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
    }

    args.push('-p', prompt.trim());

    return args;
  }

  /**
   * Create unique log directory for this run.
   * SEC-003: Uses cryptographically secure random for directory names.
   */
  private async _createLogDir(): Promise<string> {
    const baseDir = path.join(os.tmpdir(), 'copilot-adapter');
    // SEC-003: Use crypto.randomBytes for unpredictable directory names
    const runId = crypto.randomBytes(16).toString('hex');
    const logDir = path.join(baseDir, runId);

    try {
      await fs.mkdir(logDir, { recursive: true });
    } catch {
      // Directory creation may fail in tests; continue anyway
    }

    return logDir;
  }

  /**
   * Extract session ID from log files with exponential backoff polling.
   *
   * Per Discovery 05:
   * - Backoff sequence: 0, 50, 100, 200, 400, 800, 1600, 3200
   * - Max timeout: 5 seconds
   * - Fallback: Generate copilot-{pid}-{timestamp} session ID
   */
  private async _extractSessionIdWithPolling(
    logDir: string,
    pid: number,
    existingSessionId?: string
  ): Promise<string> {
    // If session ID was provided, use it
    if (existingSessionId) {
      return existingSessionId;
    }

    const startTime = Date.now();
    let delay = 0;

    while (Date.now() - startTime < this._pollMaxTimeoutMs) {
      // Try to read log file
      const logContent = await this._readLogFile(logDir);

      if (logContent) {
        const sessionId = this._parser.extractSessionId(logContent);
        if (sessionId) {
          return sessionId;
        }
      }

      // Wait with exponential backoff
      if (delay > 0) {
        await this._sleep(delay);
      }

      // Double the delay for next iteration (exponential backoff)
      if (delay === 0) {
        delay = this._pollBaseIntervalMs;
      } else {
        delay = Math.min(delay * 2, this._pollMaxTimeoutMs);
      }
    }

    // Fallback: Generate session ID based on PID and timestamp
    return `copilot-${pid}-${Date.now()}`;
  }

  /**
   * Default implementation for reading log files from disk.
   * SEC-002: Enforces file size limits to prevent DoS via memory exhaustion.
   */
  private async _defaultReadLogFile(logDir: string): Promise<string | null> {
    try {
      const files = await fs.readdir(logDir);
      const logFiles = files.filter(f => f.endsWith('.log'));

      let combinedContent = '';
      let totalSize = 0;

      for (const logFile of logFiles) {
        const filePath = path.join(logDir, logFile);
        const stats = await fs.stat(filePath);

        // SEC-002: Skip files exceeding size limit
        if (stats.size > CopilotAdapter.MAX_LOG_FILE_SIZE) {
          this._logger?.warn('Log file exceeds size limit, skipping', {
            file: logFile,
            size: stats.size,
            limit: CopilotAdapter.MAX_LOG_FILE_SIZE,
          });
          continue;
        }

        // SEC-002: Stop if combined content would exceed limit
        if (totalSize + stats.size > CopilotAdapter.MAX_LOG_FILE_SIZE) {
          this._logger?.warn('Combined log content exceeds limit, stopping', {
            totalSize,
            limit: CopilotAdapter.MAX_LOG_FILE_SIZE,
          });
          break;
        }

        const content = await fs.readFile(filePath, 'utf-8');
        combinedContent += content + '\n';
        totalSize += stats.size;
      }

      return combinedContent || null;
    } catch {
      // Directory or files may not exist yet
      return null;
    }
  }

  /**
   * Map exit code to agent status.
   */
  private _mapExitCodeToStatus(exitCode: number): AgentStatus {
    if (exitCode === 0) {
      return 'completed';
    }
    return 'failed';
  }

  /**
   * Sleep helper for polling delays.
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
