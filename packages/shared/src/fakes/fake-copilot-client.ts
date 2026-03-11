import { randomUUID } from 'node:crypto';
import type {
  CopilotModelInfo,
  CopilotResumeSessionConfig,
  CopilotSessionConfig,
  CopilotSessionEvent,
  CopilotStatusResponse,
  ICopilotClient,
  ICopilotSession,
} from '../interfaces/copilot-sdk.interface.js';
import { FakeCopilotSession } from './fake-copilot-session.js';

/**
 * Creates a default session.idle event with base fields.
 */
function createDefaultIdleEvent(): CopilotSessionEvent {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    parentId: null,
    ephemeral: true,
    type: 'session.idle',
    data: {},
  };
}

/**
 * Configuration options for FakeCopilotClient.
 *
 * Per ADR-0002: This is a fake, not a mock - it implements the real interface
 * with configurable behavior for testing.
 */
export interface FakeCopilotClientOptions {
  /**
   * Pre-configured events that created sessions will emit.
   * Sessions will emit these events during sendAndWait().
   */
  events?: CopilotSessionEvent[];

  /**
   * Whether to throw on resumeSession() with unknown session ID.
   * When true, only sessions that were created can be resumed.
   * Default: false (always returns a session)
   */
  strictSessions?: boolean;

  /**
   * Errors to return from stop().
   * Default: empty array (clean shutdown)
   */
  stopErrors?: Error[];

  /**
   * Status response to return from getStatus().
   * Default: { version: '0.1.16', protocolVersion: 1 }
   */
  status?: CopilotStatusResponse;
}

/**
 * FakeCopilotClient is a test double for ICopilotClient that provides
 * configurable session creation and verification helpers for testing.
 *
 * Per ADR-0002: Fakes only, no mocks. This class implements ICopilotClient
 * with predictable behavior configured via constructor options.
 *
 * Per R-ARCH-001: Imports local interfaces (ICopilotClient), not SDK types.
 *
 * Usage:
 * ```typescript
 * const fake = new FakeCopilotClient({
 *   events: [
 *     { type: 'assistant.message', data: { content: 'Hello!' } },
 *     { type: 'session.idle', data: {} }
 *   ]
 * });
 *
 * const session = await fake.createSession();
 * const result = await session.sendAndWait({ prompt: 'test' });
 * expect(result?.data.content).toBe('Hello!');
 * ```
 */
export class FakeCopilotClient implements ICopilotClient {
  private readonly _options: FakeCopilotClientOptions;
  private readonly _sessionHistory: string[] = [];
  private readonly _createdSessions = new Set<string>();
  private readonly _sessions = new Map<string, FakeCopilotSession>();
  private _sessionCounter = 0;
  private _lastSession: FakeCopilotSession | null = null;
  private _lastSessionConfig: CopilotSessionConfig | CopilotResumeSessionConfig | undefined;
  private _lastResumeConfig: CopilotResumeSessionConfig | undefined;

  constructor(options: FakeCopilotClientOptions = {}) {
    this._options = {
      events: options.events ?? [createDefaultIdleEvent()],
      strictSessions: options.strictSessions ?? false,
      stopErrors: options.stopErrors ?? [],
      status: options.status ?? { version: '0.1.16', protocolVersion: 1 },
    };
  }

  /**
   * Creates a new conversation session.
   *
   * @param config - Session configuration (model, sessionId, etc.)
   * @returns A new FakeCopilotSession with immediately available sessionId
   */
  async createSession(config?: CopilotSessionConfig): Promise<ICopilotSession> {
    const sessionId = config?.sessionId ?? this._generateSessionId();
    this._sessionHistory.push(sessionId);
    this._createdSessions.add(sessionId);
    this._lastSessionConfig = config;

    const session = new FakeCopilotSession({
      sessionId,
      events: this._options.events,
    });
    this._sessions.set(sessionId, session);
    this._lastSession = session;

    return session;
  }

  /**
   * Resumes an existing conversation session by its ID.
   *
   * @param sessionId - The ID of the session to resume
   * @param config - Optional configuration for the resumed session
   * @returns The resumed session
   * @throws Error if strictSessions is true and session wasn't previously created
   */
  async resumeSession(
    sessionId: string,
    config?: CopilotResumeSessionConfig
  ): Promise<ICopilotSession> {
    if (this._options.strictSessions && !this._createdSessions.has(sessionId)) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    this._sessionHistory.push(sessionId);
    this._lastResumeConfig = config;

    const session = new FakeCopilotSession({
      sessionId,
      events: this._options.events,
    });
    this._sessions.set(sessionId, session);
    this._lastSession = session;

    return session;
  }

  /**
   * Stops the client and closes all connections.
   *
   * @returns Array of errors configured in options (empty if clean shutdown)
   */
  async stop(): Promise<Error[]> {
    return this._options.stopErrors ?? [];
  }

  /**
   * Gets the client status including version information.
   *
   * @returns Status response configured in options
   */
  async getStatus(): Promise<CopilotStatusResponse> {
    if (!this._options.status) {
      throw new Error('FakeCopilotClient: status not configured');
    }
    return this._options.status;
  }

  /**
   * List available models. Returns a canned model list for testing.
   */
  async listModels(): Promise<CopilotModelInfo[]> {
    return [
      {
        id: 'fake-model-reasoning',
        name: 'Fake Model (Reasoning)',
        capabilities: {
          supports: { vision: false, reasoningEffort: true },
          limits: { max_context_window_tokens: 200000 },
        },
        supportedReasoningEfforts: ['low', 'medium', 'high'],
        defaultReasoningEffort: 'medium',
      },
      {
        id: 'fake-model-basic',
        name: 'Fake Model (Basic)',
        capabilities: {
          supports: { vision: true, reasoningEffort: false },
          limits: { max_context_window_tokens: 128000 },
        },
      },
    ];
  }

  // ============================================
  // Test helper methods
  // ============================================

  /**
   * Get all session IDs that were created or resumed.
   * Useful for verifying session operations in tests.
   */
  getSessionHistory(): string[] {
    return [...this._sessionHistory];
  }

  /**
   * Get the config passed to the most recent createSession() or resumeSession().
   * Useful for verifying adapter correctly forwards model/reasoning options.
   */
  getLastSessionConfig(): CopilotSessionConfig | CopilotResumeSessionConfig | undefined {
    return this._lastSessionConfig;
  }

  /**
   * Get the config passed to the most recent resumeSession().
   */
  getLastResumeConfig(): CopilotResumeSessionConfig | undefined {
    return this._lastResumeConfig;
  }

  /**
   * Clear all session history.
   * Useful for test isolation between test cases.
   */
  reset(): void {
    this._sessionHistory.length = 0;
    this._createdSessions.clear();
    this._sessions.clear();
    this._sessionCounter = 0;
    this._lastSession = null;
    this._lastSessionConfig = undefined;
    this._lastResumeConfig = undefined;
  }

  /**
   * Get the most recently created/resumed session.
   * Useful for verifying session methods were called (abort/destroy).
   */
  getLastSession(): FakeCopilotSession | null {
    return this._lastSession;
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: string): FakeCopilotSession | undefined {
    return this._sessions.get(sessionId);
  }

  /**
   * Generate a unique session ID.
   */
  private _generateSessionId(): string {
    this._sessionCounter++;
    return `fake-session-${Date.now()}-${this._sessionCounter}`;
  }
}
