/**
 * Agent execution status values.
 *
 * Per spec AC-5/AC-6/AC-7:
 * - 'completed': Agent exited with exit code 0
 * - 'failed': Agent exited with non-zero exit code or error
 * - 'killed': Agent was terminated via terminate() method
 */
export type AgentStatus = 'completed' | 'failed' | 'killed';

/**
 * Token usage metrics for context tracking.
 *
 * Per DYK-03: Uses `| null` pattern for unavailable data.
 * When tokens are available, all fields are present.
 * When unavailable (e.g., Copilot), entire object is null.
 */
export interface TokenMetrics {
  /** Tokens used in the current execution turn */
  used: number;
  /** Cumulative tokens for the entire session */
  total: number;
  /** Agent's context window limit */
  limit: number;
}

/**
 * Result object returned from agent execution.
 *
 * Per spec AC-4: Contains output, sessionId, status, exitCode, stderr, tokens.
 */
export interface AgentResult {
  /** Agent output (stdout content) */
  output: string;
  /** Session identifier for resumption */
  sessionId: string;
  /** Execution status */
  status: AgentStatus;
  /** Process exit code (0 for success, >0 for failure) */
  exitCode: number;
  /** Stderr output if present */
  stderr?: string;
  /** Token metrics (null when unavailable, e.g., Copilot) */
  tokens: TokenMetrics | null;
}

/**
 * Options for running a prompt through an agent.
 */
export interface AgentRunOptions {
  /** The prompt to execute */
  prompt: string;
  /** Session ID for resumption (optional - creates new session if omitted) */
  sessionId?: string;
  /** Working directory for the agent (optional) */
  cwd?: string;
}
