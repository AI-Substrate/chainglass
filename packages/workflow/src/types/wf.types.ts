/**
 * TypeScript types matching wf.schema.json
 * Schema for workflow definition files (wf.yaml)
 */

/**
 * Workflow definition - the root of a wf.yaml file
 */
export interface WfDefinition {
  /** Workflow template name (slug format: ^[a-z][a-z0-9-]*$) */
  name: string;
  /** Semantic version of the workflow template (^\\d+\\.\\d+\\.\\d+$) */
  version: string;
  /** Human-readable description of the workflow */
  description?: string;
  /** Phase definitions keyed by phase name */
  phases: Record<string, PhaseDefinition>;
}

/**
 * Phase definition within a workflow
 */
export interface PhaseDefinition {
  /** Human-readable description of this phase */
  description: string;
  /** Execution order (1-based) */
  order: number;
  /** Inputs required for this phase */
  inputs?: InputDeclaration;
  /** Outputs produced by this phase */
  outputs: Output[];
  /** Parameters extracted from outputs for downstream phases */
  output_parameters?: OutputParameter[];
}

/**
 * Input declarations for a phase
 */
export interface InputDeclaration {
  /** File inputs for this phase */
  files?: FileInput[];
  /** Parameter inputs from prior phases */
  parameters?: ParameterInput[];
  /** Message input declarations for agent-orchestrator communication */
  messages?: MessageInput[];
}

/**
 * File input declaration
 */
export interface FileInput {
  /** Input file name (must match source output name if from_phase is specified) */
  name: string;
  /** Whether this input is required */
  required: boolean;
  /** Human-readable description */
  description?: string;
  /** Source phase for cross-phase inputs */
  from_phase?: string;
}

/**
 * Parameter input declaration
 */
export interface ParameterInput {
  /** Parameter name (must match source output_parameter name) */
  name: string;
  /** Whether this parameter is required */
  required: boolean;
  /** Human-readable description */
  description?: string;
  /** Source phase that publishes this parameter */
  from_phase?: string;
}

/**
 * Message input declaration for agent-orchestrator communication
 */
export interface MessageInput {
  /** Expected message ID (without m- prefix, becomes m-{id}.json) */
  id: string;
  /** Expected message type */
  type: 'single_choice' | 'multi_choice' | 'free_text' | 'confirm';
  /** Who creates this message */
  from: 'agent' | 'orchestrator';
  /** Whether this message must exist for prepare to pass */
  required: boolean;
  /** Subject line for the message */
  subject: string;
  /** Guidance text for orchestrator UI or agent */
  prompt?: string;
  /** Pre-defined options for choice message types */
  options?: MessageOption[];
  /** Documentation for humans */
  description?: string;
}

/**
 * Option for choice message types
 */
export interface MessageOption {
  /** Single letter key (A, B, C, etc.) */
  key: string;
  /** Short label for the option */
  label: string;
  /** Longer description of the option */
  description?: string;
}

/**
 * Output declaration for a phase
 */
export interface Output {
  /** Output name */
  name: string;
  /** Output type (currently only file supported) */
  type: 'file';
  /** Whether this output is required */
  required: boolean;
  /** Path to JSON Schema for validation (relative to template) */
  schema?: string;
  /** Human-readable description */
  description?: string;
}

/**
 * Output parameter extraction declaration
 */
export interface OutputParameter {
  /** Parameter name for downstream reference */
  name: string;
  /** Source output file name */
  source: string;
  /** Dot-notation path to extract value (e.g., 'items.length') */
  query: string;
  /** Human-readable description */
  description?: string;
}
