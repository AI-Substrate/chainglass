import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  AgentEvent,
  AgentEventHandler,
  AgentResult,
  AgentRunOptions,
  IAgentAdapter,
} from '../interfaces/index.js';
import { parseEventsJsonlLine } from './events-jsonl-parser.js';

const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const SEND_KEYS_DELAY_MS = 100;

/**
 * Options for CopilotCLIAdapter.
 */
export interface CopilotCLIAdapterOptions {
  /** Injectable function for sending text keystrokes via tmux. */
  sendKeys: (target: string, text: string) => void;
  /** Injectable function for sending Enter key via tmux. Separate because tmux needs Enter as an unquoted key name. */
  sendEnter?: (target: string) => void;
  /** Base directory containing session-state folders (default: ~/.copilot/session-state). */
  sessionStateDir?: string;
  /** tmux target pane (e.g., "studio:1.0"). */
  tmuxTarget?: string;
  /** Polling interval for events.jsonl in ms. */
  pollIntervalMs?: number;
  /** Timeout for run() in ms. */
  timeoutMs?: number;
  /** Default sessionId when not provided in run() options. */
  defaultSessionId?: string;
}

type TailResult = 'idle' | 'timeout' | 'terminated';

/**
 * Agent adapter that attaches to a running Copilot CLI via tmux for input
 * and events.jsonl file-tailing for output.
 *
 * This adapter is an observer and participant, not an owner. It does not
 * spawn or kill the CLI process.
 */
export class CopilotCLIAdapter implements IAgentAdapter {
  private readonly sendKeysFn: (target: string, text: string) => void;
  private readonly sendEnterFn: (target: string) => void;
  private readonly sessionStateDir: string;
  private readonly tmuxTarget: string;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly defaultSessionId: string | undefined;
  private terminated = false;
  private activePollTimer: ReturnType<typeof setTimeout> | null = null;
  private activeResolve: ((result: TailResult) => void) | null = null;

  constructor(options: CopilotCLIAdapterOptions) {
    this.sendKeysFn = options.sendKeys;
    this.sendEnterFn = options.sendEnter ?? ((target: string) => options.sendKeys(target, 'Enter'));
    this.sessionStateDir =
      options.sessionStateDir ?? path.join(process.env.HOME ?? '~', '.copilot', 'session-state');
    this.tmuxTarget = options.tmuxTarget ?? '';
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultSessionId = options.defaultSessionId;
  }

  async run(options: AgentRunOptions): Promise<AgentResult> {
    const sessionId = options.sessionId ?? this.defaultSessionId;

    if (!sessionId) {
      return this.failedResult('', 'sessionId is required for CopilotCLIAdapter');
    }

    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return this.failedResult(sessionId, 'invalid sessionId: contains path traversal characters');
    }

    const eventsPath = path.join(this.sessionStateDir, sessionId, 'events.jsonl');

    if (!fs.existsSync(eventsPath)) {
      return this.failedResult(sessionId, `events.jsonl not found at ${eventsPath}`);
    }

    this.terminated = false;

    // AC-11: Start file watcher BEFORE sending prompt
    const { promise, events } = this.tailUntilIdle(eventsPath, options.onEvent);

    // Send prompt via tmux (text, then Enter as separate calls)
    try {
      this.sendKeysFn(this.tmuxTarget, options.prompt);
      await this.sleep(SEND_KEYS_DELAY_MS);
      this.sendEnterFn(this.tmuxTarget);
    } catch (err) {
      this.stopPolling();
      const message = err instanceof Error ? err.message : String(err);
      return this.failedResult(sessionId, `tmux send-keys failed: ${message}`);
    }

    const result = await promise;

    if (result === 'terminated') {
      return { output: '', sessionId, status: 'killed', exitCode: 0, tokens: null };
    }

    if (result === 'timeout') {
      return this.failedResult(sessionId, 'timeout: session.idle not received');
    }

    // result === 'idle'
    const output = events
      .filter((e) => e.type === 'message')
      .map((e) => (e as { data: { content: string } }).data.content)
      .join('');

    return { output, sessionId, status: 'completed', exitCode: 0, tokens: null };
  }

  async compact(sessionId: string): Promise<AgentResult> {
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return this.failedResult(sessionId, 'invalid sessionId');
    }

    const eventsPath = path.join(this.sessionStateDir, sessionId, 'events.jsonl');

    if (!fs.existsSync(eventsPath)) {
      return this.failedResult(sessionId, 'events.jsonl not found');
    }

    this.terminated = false;
    const { promise } = this.tailUntilIdle(eventsPath);

    try {
      this.sendKeysFn(this.tmuxTarget, '/compact');
      await this.sleep(SEND_KEYS_DELAY_MS);
      this.sendEnterFn(this.tmuxTarget);
    } catch (err) {
      this.stopPolling();
      const message = err instanceof Error ? err.message : String(err);
      return this.failedResult(sessionId, `tmux send-keys failed: ${message}`);
    }

    await promise;
    return { output: '', sessionId, status: 'completed', exitCode: 0, tokens: null };
  }

  async terminate(sessionId: string): Promise<AgentResult> {
    this.terminated = true;
    this.stopPolling();
    // Resolve any active tail promise immediately
    if (this.activeResolve) {
      this.activeResolve('terminated');
      this.activeResolve = null;
    }
    return { output: '', sessionId, status: 'killed', exitCode: 0, tokens: null };
  }

  /**
   * Tail events.jsonl from current position until session.idle, timeout, or termination.
   */
  private tailUntilIdle(
    eventsPath: string,
    onEvent?: AgentEventHandler
  ): { promise: Promise<TailResult>; events: AgentEvent[] } {
    const events: AgentEvent[] = [];
    let bytesRead = 0;

    try {
      const stat = fs.statSync(eventsPath);
      bytesRead = stat.size;
    } catch {
      // start from 0
    }

    const promise = new Promise<TailResult>((resolve) => {
      this.activeResolve = resolve;
      const startTime = Date.now();

      const poll = (): void => {
        if (this.terminated) {
          resolve('terminated');
          return;
        }

        if (Date.now() - startTime > this.timeoutMs) {
          resolve('timeout');
          return;
        }

        try {
          const stat = fs.statSync(eventsPath);
          if (stat.size > bytesRead) {
            const fd = fs.openSync(eventsPath, 'r');
            const buffer = Buffer.alloc(stat.size - bytesRead);
            fs.readSync(fd, buffer, 0, buffer.length, bytesRead);
            fs.closeSync(fd);
            bytesRead = stat.size;

            const lines = buffer.toString('utf8').split('\n');

            for (const line of lines) {
              if (!line.trim()) continue;
              const event = parseEventsJsonlLine(line);
              if (!event) continue; // PL-07: skip malformed

              events.push(event);
              onEvent?.(event);

              if (event.type === 'session_idle') {
                resolve('idle');
                return;
              }
            }
          }
        } catch {
          // File read error — continue polling
        }

        this.activePollTimer = setTimeout(poll, this.pollIntervalMs);
      };

      poll();
    });

    return { promise, events };
  }

  private stopPolling(): void {
    if (this.activePollTimer) {
      clearTimeout(this.activePollTimer);
      this.activePollTimer = null;
    }
  }

  private failedResult(sessionId: string, message: string): AgentResult {
    return { output: message, sessionId, status: 'failed', exitCode: 1, tokens: null };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
