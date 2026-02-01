/**
 * WorkUnit type definitions extracted from @chainglass/workgraph.
 *
 * These are pure domain types describing WorkUnit structure (inputs, outputs,
 * configuration). They live here in @chainglass/workflow so that packages
 * needing WorkUnit types (e.g., positional-graph) can consume them without
 * depending on the full workgraph service layer.
 *
 * NOTE: InputDeclaration/OutputDeclaration are renamed to WorkUnitInput/WorkUnitOutput
 * to avoid collision with the existing workflow InputDeclaration (phase-level inputs
 * in wf.types.ts). The workgraph package re-exports these under the original names
 * for backward compatibility.
 *
 * Per Plan 026, Phase 1: WorkUnit Type Extraction.
 */

/**
 * Input declaration for a WorkUnit.
 *
 * Renamed from `InputDeclaration` to avoid collision with the workflow-level
 * InputDeclaration (phase inputs: files, parameters, messages).
 */
export interface WorkUnitInput {
  /** Input name (lowercase, underscores allowed) */
  name: string;
  /** Input type: data or file */
  type: 'data' | 'file';
  /** Data type (required when type='data') */
  dataType?: 'text' | 'number' | 'boolean' | 'json';
  /** Whether this input is required */
  required: boolean;
  /** Human-readable description */
  description?: string;
}

/**
 * Output declaration for a WorkUnit.
 *
 * Renamed from `OutputDeclaration` to avoid collision pattern consistency
 * with WorkUnitInput.
 */
export interface WorkUnitOutput {
  /** Output name (lowercase, underscores allowed) */
  name: string;
  /** Output type: data or file */
  type: 'data' | 'file';
  /** Data type (required when type='data') */
  dataType?: 'text' | 'number' | 'boolean' | 'json';
  /** Whether this output is required */
  required: boolean;
  /** Human-readable description */
  description?: string;
}

/**
 * Agent-specific configuration for AgentUnit.
 */
export interface AgentConfig {
  /** Path to prompt template relative to unit folder */
  promptTemplate: string;
  /** Optional system prompt prefix */
  systemPrompt?: string;
  /** Supported agent types (defaults to all) */
  supportedAgents?: ('claude-code' | 'copilot')[];
  /** Estimated token budget (informational) */
  estimatedTokens?: number;
}

/**
 * Code-specific configuration for CodeUnit.
 */
export interface CodeConfig {
  /** Execution timeout in seconds (default: 60) */
  timeout?: number;
}

/**
 * User input option for single/multi choice questions.
 */
export interface UserInputOption {
  /** Single letter key (A, B, C, etc.) */
  key: string;
  /** Display label */
  label: string;
  /** Optional longer description */
  description?: string;
}

/**
 * User input configuration for UserInputUnit.
 */
export interface UserInputConfig {
  /** Question type */
  questionType: 'text' | 'single' | 'multi' | 'confirm';
  /** Prompt text (may contain {{config.X}} placeholders) */
  prompt: string;
  /** Options for single/multi choice */
  options?: UserInputOption[] | string;
}

/**
 * Full WorkUnit definition.
 */
export interface WorkUnit {
  /** Unique unit identifier */
  slug: string;
  /** Unit type */
  type: 'agent' | 'code' | 'user-input';
  /** Semantic version */
  version: string;
  /** Human-readable description */
  description?: string;
  /** Input declarations */
  inputs: WorkUnitInput[];
  /** Output declarations */
  outputs: WorkUnitOutput[];
  /** Agent configuration (when type='agent') */
  agent?: AgentConfig;
  /** Code configuration (when type='code') */
  code?: CodeConfig;
  /** User input configuration (when type='user-input') */
  userInput?: UserInputConfig;
}

/**
 * Backward-compatible aliases for the original names.
 * Used by @chainglass/workgraph re-exports.
 */
export type InputDeclaration = WorkUnitInput;
export type OutputDeclaration = WorkUnitOutput;
