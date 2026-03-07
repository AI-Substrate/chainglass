/**
 * Agent runner types — data structures for agent definitions, run config, and results.
 *
 * These types are internal to the harness. They are NOT exported to other packages.
 * The runner consumes IAgentAdapter and AgentEvent from @chainglass/shared.
 */

import type { AgentEvent, AgentResult } from '@chainglass/shared';
import type { HarnessEnvelope } from '../cli/output.js';

/** An agent definition discovered from the agents/ folder. */
export interface AgentDefinition {
  /** Agent slug (folder name, e.g., "smoke-test") */
  slug: string;
  /** Absolute path to the agent folder */
  dir: string;
  /** Absolute path to prompt.md (always present) */
  promptPath: string;
  /** Absolute path to output-schema.json (optional) */
  schemaPath: string | null;
  /** Absolute path to instructions.md (optional) */
  instructionsPath: string | null;
}

/** Configuration for a single agent run. */
export interface AgentRunConfig {
  /** Agent slug to run */
  slug: string;
  /** Model to use (e.g., "gpt-5.4", "claude-sonnet-4") */
  model?: string;
  /** Reasoning effort for models that support it */
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  /** Timeout in seconds (default: 300) */
  timeout?: number;
  /** Working directory for the agent (default: repo root) */
  cwd?: string;
}

/** Validation result from JSON Schema check. */
export interface ValidationResult {
  /** Whether the output passed schema validation */
  valid: boolean;
  /** Validation error messages (empty if valid) */
  errors: string[];
}

/** Metadata written to completed.json after each run. */
export interface CompletedMetadata {
  /** Agent slug */
  slug: string;
  /** Run folder name (ISO-dated with suffix) */
  runId: string;
  /** ISO timestamp when run started */
  startedAt: string;
  /** ISO timestamp when run completed */
  completedAt: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Copilot session ID for investigation/resumption */
  sessionId: string;
  /** Run result status */
  result: 'completed' | 'failed' | 'timeout' | 'degraded';
  /** Process exit code */
  exitCode: number;
  /** Schema validation result (null if no schema) */
  validated: boolean | null;
  /** Validation errors (empty if valid or no schema) */
  validationErrors: string[];
  /** Total events captured */
  eventCount: number;
  /** Number of tool calls made */
  toolCallCount: number;
  /** List of artifact files in the run folder */
  artifacts: string[];
}

/** Result returned from the runner to the CLI command. */
export interface AgentRunResult {
  /** The agent adapter result */
  agentResult: AgentResult;
  /** Run metadata (written to completed.json) */
  metadata: CompletedMetadata;
  /** Validation result (null if no schema) */
  validation: ValidationResult | null;
  /** Absolute path to the run folder */
  runDir: string;
}

/** Events collected during a run, for counting and analysis. */
export interface RunEventStats {
  total: number;
  toolCalls: number;
  toolResults: number;
  messages: number;
  thinking: number;
  errors: number;
}
