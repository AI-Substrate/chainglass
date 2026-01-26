import type { AgentResult, AgentRunOptions } from './agent-types.js';

/**
 * Interface for AI coding agent adapters.
 *
 * Per DYK-01: All methods return Promise<T> - this is the gold standard
 * for long-running operation interfaces. Agents may take minutes to respond.
 *
 * Implementations:
 * - FakeAgentAdapter: Test double with configurable responses
 * - ClaudeCodeAdapter: Real Claude Code CLI integration (Phase 2)
 * - CopilotAdapter: Real Copilot CLI integration (Phase 4)
 */
export interface IAgentAdapter {
  /**
   * Execute a prompt through the agent.
   *
   * @param options - Prompt and optional session/cwd settings
   * @returns AgentResult with output, sessionId, status, exitCode, tokens
   *
   * AC-1: Returns sessionId for session resumption
   * AC-2: If sessionId provided, resumes existing session
   * AC-4: Returns structured result object
   * AC-5/AC-6/AC-7: Status reflects exit path (completed/failed/killed)
   * AC-9/AC-10/AC-11: Includes token metrics when available
   */
  run(options: AgentRunOptions): Promise<AgentResult>;

  /**
   * Send compact command to reduce context.
   *
   * @param sessionId - Session to compact
   * @returns AgentResult with updated token counts
   *
   * AC-12: Sends /compact command to agent
   * AC-13: tokens.total reflects reduced count after compaction
   */
  compact(sessionId: string): Promise<AgentResult>;

  /**
   * Terminate a running agent session.
   *
   * @param sessionId - Session to terminate
   * @returns AgentResult with status='killed'
   *
   * AC-14: Stops agent within 10 seconds via signal escalation
   * AC-15: Session can still be resumed after termination
   */
  terminate(sessionId: string): Promise<AgentResult>;
}
