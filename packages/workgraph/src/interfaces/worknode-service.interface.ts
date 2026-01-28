/**
 * IWorkNodeService interface for node execution operations.
 *
 * This service handles execution lifecycle and I/O operations for WorkNodes.
 * Graph structure operations (addNodeAfter, removeNode) are in IWorkGraphService.
 *
 * Per spec AC-09 through AC-13: Node execution and I/O operations.
 * Per Critical Discovery 02: All methods return results with errors array.
 * Per Insight 5: This interface is execution-focused (5 methods).
 */

import type { BaseResult } from '@chainglass/shared';

// ============================================
// Result Types
// ============================================

/**
 * Blocking node information.
 */
export interface BlockingNode {
  /** Node ID that is blocking */
  nodeId: string;
  /** Current status of blocking node */
  status: string;
  /** Required outputs from this node */
  requiredOutputs: string[];
}

/**
 * Result of checking if a node can run.
 */
export interface CanRunResult extends BaseResult {
  /** Whether the node can run */
  canRun: boolean;
  /** Reason why node cannot run (if canRun=false) */
  reason?: string;
  /** Nodes that are blocking execution */
  blockingNodes?: BlockingNode[];
}

/**
 * Result of marking a node as ready.
 */
export interface MarkReadyResult extends BaseResult {
  /** Node ID that was marked ready */
  nodeId: string;
  /** New status (should be 'ready') */
  status: string;
  /** ISO timestamp when marked ready */
  readyAt: string;
}

/**
 * Result of starting node execution.
 */
export interface StartResult extends BaseResult {
  /** Node ID that was started */
  nodeId: string;
  /** New status (should be 'running') */
  status: string;
  /** ISO timestamp when started */
  startedAt: string;
}

/**
 * Result of ending node execution.
 */
export interface EndResult extends BaseResult {
  /** Node ID that was ended */
  nodeId: string;
  /** New status (should be 'complete') */
  status: string;
  /** ISO timestamp when completed */
  completedAt: string;
  /** Missing required outputs (if any) */
  missingOutputs?: string[];
}

/**
 * Result of checking if a node can end.
 */
export interface CanEndResult extends BaseResult {
  /** Node ID that was checked */
  nodeId: string;
  /** Whether the node can end */
  canEnd: boolean;
  /** Missing required outputs (if any) */
  missingOutputs?: string[];
}

/**
 * Input data value.
 */
export interface InputDataValue {
  /** Input name */
  name: string;
  /** Input value */
  value: unknown;
  /** Source node ID */
  fromNode: string;
  /** Source output name */
  fromOutput: string;
}

/**
 * Result of getting input data.
 */
export interface GetInputDataResult extends BaseResult {
  /** Node ID */
  nodeId: string;
  /** Input name */
  inputName: string;
  /** Input value (undefined if not available) */
  value?: unknown;
  /** Source node ID */
  fromNode?: string;
  /** Source output name */
  fromOutput?: string;
}

/**
 * Result of getting input file.
 */
export interface GetInputFileResult extends BaseResult {
  /** Node ID */
  nodeId: string;
  /** Input name */
  inputName: string;
  /** Absolute path to the input file (undefined if not available) */
  filePath?: string;
  /** Source node ID */
  fromNode?: string;
  /** Source output name */
  fromOutput?: string;
}

/**
 * Result of getting output data from a node.
 * Used by orchestrators to read a completed node's outputs.
 */
export interface GetOutputDataResult extends BaseResult {
  /** Node ID */
  nodeId: string;
  /** Output name */
  outputName: string;
  /** Output value (undefined if not available) */
  value?: unknown;
}

/**
 * Result of saving output data.
 */
export interface SaveOutputDataResult extends BaseResult {
  /** Node ID */
  nodeId: string;
  /** Output name */
  outputName: string;
  /** Whether the save was successful */
  saved: boolean;
}

/**
 * Result of saving output file.
 */
export interface SaveOutputFileResult extends BaseResult {
  /** Node ID */
  nodeId: string;
  /** Output name */
  outputName: string;
  /** Whether the save was successful */
  saved: boolean;
  /** Path where the file was saved */
  savedPath?: string;
}

/**
 * Question types for the ask() handover flow.
 */
export type QuestionType = 'text' | 'single' | 'multi' | 'confirm';

/**
 * Question for the ask() handover flow.
 */
export interface Question {
  /** Question type */
  type: QuestionType;
  /** Question text */
  text: string;
  /** Options for single/multi choice questions */
  options?: string[];
  /** Default value */
  default?: string | boolean;
}

/**
 * Result of asking a question (handover to orchestrator).
 */
export interface AskResult extends BaseResult {
  /** Node ID */
  nodeId: string;
  /** New status (should be 'waiting-question') */
  status: string;
  /** Question ID for answer correlation */
  questionId: string;
  /** Question that was asked */
  question: Question;
}

/**
 * Result of answering a question.
 */
export interface AnswerResult extends BaseResult {
  /** Node ID */
  nodeId: string;
  /** New status (should be 'running') */
  status: string;
  /** Question ID that was answered */
  questionId: string;
  /** Answer value */
  answer: unknown;
}

/**
 * Result of getting an answer to a question.
 */
export interface GetAnswerResult extends BaseResult {
  /** Node ID */
  nodeId: string;
  /** Question ID */
  questionId: string;
  /** Answer value (undefined if not yet answered) */
  answer?: unknown;
  /** Whether the question has been answered */
  answered: boolean;
  /** ISO timestamp when answered */
  answeredAt?: string;
}

/**
 * Options for clearing a node.
 */
export interface ClearOptions {
  /** Must be true to confirm clearing. Returns error if false/missing. */
  force: boolean;
}

/**
 * Result of clearing a node.
 */
export interface ClearResult extends BaseResult {
  /** Node ID that was cleared */
  nodeId: string;
  /** New status (should be 'pending') */
  status: string;
  /** Outputs that were removed */
  clearedOutputs: string[];
}

// ============================================
// Service Interface
// ============================================

/**
 * Service for node execution operations.
 *
 * Per spec AC-09: canRun() checks if node can be executed.
 * Per spec AC-10: start() begins node execution (returns E110 if blocked).
 * Per spec AC-11: end() completes node execution.
 * Per spec AC-12: Re-execution clears previous outputs.
 * Per spec AC-13: Dependent nodes warned on re-execution.
 */
export interface IWorkNodeService {
  /**
   * Check if a node can be run.
   *
   * A node can run when all upstream nodes are complete
   * and all required inputs are available.
   *
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to check
   * @returns CanRunResult with canRun flag and blocking info
   */
  canRun(graphSlug: string, nodeId: string): Promise<CanRunResult>;

  /**
   * Mark a node as ready for execution.
   *
   * Called by orchestrator when it determines a node can be executed.
   * Validates canRun() internally before setting status to 'ready'.
   * Returns E110 if node cannot be run (blocked by upstream).
   *
   * Per DYK#6: Orchestrator controls pending→ready transition for UI visibility.
   *
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to mark ready
   * @returns MarkReadyResult with new status
   */
  markReady(graphSlug: string, nodeId: string): Promise<MarkReadyResult>;

  /**
   * Start node execution.
   *
   * Transitions node status to 'running'.
   * Returns E110 if node cannot be run (use canRun() first).
   *
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to start
   * @returns StartResult with new status
   */
  start(graphSlug: string, nodeId: string): Promise<StartResult>;

  /**
   * End node execution.
   *
   * Validates that all required outputs are present.
   * Transitions node status to 'complete' if valid.
   *
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to end
   * @returns EndResult with new status and any missing outputs
   */
  end(graphSlug: string, nodeId: string): Promise<EndResult>;

  /**
   * Check if a node can end (query only, no state change).
   *
   * Validates that all required outputs are present without
   * actually transitioning the node state.
   *
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to check
   * @returns CanEndResult with canEnd flag and any missing outputs
   */
  canEnd(graphSlug: string, nodeId: string): Promise<CanEndResult>;

  /**
   * Get input data for a node.
   *
   * Resolves the input value from the upstream node's outputs.
   *
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to get input for
   * @param inputName - Name of the input to get
   * @returns GetInputDataResult with resolved value
   */
  getInputData(graphSlug: string, nodeId: string, inputName: string): Promise<GetInputDataResult>;

  /**
   * Get input file path for a node.
   *
   * Resolves the file path from the upstream node's file outputs.
   * Per Discovery 10: Rejects paths containing '..' for security.
   *
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to get input for
   * @param inputName - Name of the input to get
   * @returns GetInputFileResult with resolved file path
   */
  getInputFile(graphSlug: string, nodeId: string, inputName: string): Promise<GetInputFileResult>;

  /**
   * Get output data from a node.
   *
   * Reads the output value from the node's own saved outputs.
   * Used by orchestrators to read completed node results.
   * Note: Unlike getInputData which reads from upstream nodes,
   * this reads from the node's own outputs (semantic asymmetry by design).
   *
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to get output from
   * @param outputName - Name of the output to get
   * @returns GetOutputDataResult with the output value
   */
  getOutputData(
    graphSlug: string,
    nodeId: string,
    outputName: string
  ): Promise<GetOutputDataResult>;

  /**
   * Save output data for a node.
   *
   * Validates the value type against the output declaration.
   * Returns E123 if type mismatch.
   *
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to save output for
   * @param outputName - Name of the output
   * @param value - Value to save
   * @returns SaveOutputDataResult with save status
   */
  saveOutputData(
    graphSlug: string,
    nodeId: string,
    outputName: string,
    value: unknown
  ): Promise<SaveOutputDataResult>;

  /**
   * Save output file for a node.
   *
   * Copies the source file to node storage.
   * Per Discovery 10: Rejects paths containing '..' for security.
   *
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to save output for
   * @param outputName - Name of the output
   * @param sourcePath - Path to the source file to copy
   * @returns SaveOutputFileResult with save status and saved path
   */
  saveOutputFile(
    graphSlug: string,
    nodeId: string,
    outputName: string,
    sourcePath: string
  ): Promise<SaveOutputFileResult>;

  /**
   * Clear a node's outputs and reset to pending.
   *
   * Per DYK#7: No cascade - clears only the specified node.
   * Requires force=true to confirm, returns error otherwise.
   * Downstream nodes are NOT automatically cleared.
   *
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to clear
   * @param options - Must include force: true to confirm
   * @returns ClearResult with cleared outputs list
   */
  clear(graphSlug: string, nodeId: string, options: ClearOptions): Promise<ClearResult>;

  /**
   * Ask a question (handover to orchestrator).
   *
   * Transitions node to 'waiting-question' status.
   * The orchestrator will present the question to the user.
   *
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node asking the question
   * @param question - Question to ask
   * @returns AskResult with question ID and status
   */
  ask(graphSlug: string, nodeId: string, question: Question): Promise<AskResult>;

  /**
   * Answer a question (resume node execution).
   *
   * Transitions node from 'waiting-question' back to 'running'.
   * The answer is stored in data.json for the agent to retrieve.
   *
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to resume
   * @param questionId - ID of the question being answered
   * @param answer - Answer value
   * @returns AnswerResult with answer and new status
   */
  answer(
    graphSlug: string,
    nodeId: string,
    questionId: string,
    answer: unknown
  ): Promise<AnswerResult>;

  /**
   * Get the answer to a question.
   *
   * Reads the answer from data.json if it has been provided.
   * Used by agents to retrieve answers after orchestrator has answered.
   *
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to get answer for
   * @param questionId - ID of the question
   * @returns GetAnswerResult with answer if available
   */
  getAnswer(graphSlug: string, nodeId: string, questionId: string): Promise<GetAnswerResult>;
}
