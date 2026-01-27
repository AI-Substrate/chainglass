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
}
