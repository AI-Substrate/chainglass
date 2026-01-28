/**
 * Type definitions for E2E WorkGraph harness.
 *
 * These types match the JSON output of CLI commands when run with --json flag.
 */

/**
 * Base result with errors array.
 */
export interface BaseResult {
  errors: Array<{ code: string; message: string }>;
}

/**
 * Result of cg wg node can-run
 */
export interface CanRunData extends BaseResult {
  canRun: boolean;
  reason?: string;
  blockingNodes?: Array<{
    nodeId: string;
    status: string;
    requiredOutputs: string[];
  }>;
}

/**
 * Result of cg wg node can-end
 */
export interface CanEndData extends BaseResult {
  nodeId: string;
  canEnd: boolean;
  missingOutputs?: string[];
}

/**
 * Result of cg wg node start
 */
export interface StartData extends BaseResult {
  nodeId: string;
  status: string;
  startedAt: string;
}

/**
 * Result of cg wg node end
 */
export interface EndData extends BaseResult {
  nodeId: string;
  status: string;
  completedAt: string;
  missingOutputs?: string[];
}

/**
 * Result of cg wg node get-input-data
 */
export interface GetInputDataData extends BaseResult {
  nodeId: string;
  inputName: string;
  value?: unknown;
  fromNode?: string;
  fromOutput?: string;
}

/**
 * Result of cg wg node get-input-file
 */
export interface GetInputFileData extends BaseResult {
  nodeId: string;
  inputName: string;
  filePath?: string;
  fromNode?: string;
  fromOutput?: string;
}

/**
 * Result of cg wg node get-output-data
 * Used by orchestrator to read a node's output after completion.
 */
export interface GetOutputDataData extends BaseResult {
  nodeId: string;
  outputName: string;
  value?: unknown;
}

/**
 * Result of cg wg node save-output-data
 */
export interface SaveOutputDataData extends BaseResult {
  nodeId: string;
  outputName: string;
  saved: boolean;
}

/**
 * Result of cg wg create
 */
export interface GraphCreateData extends BaseResult {
  graphSlug: string;
  graphPath: string;
  created: boolean;
}

/**
 * Result of cg wg add-node
 */
export interface AddNodeData extends BaseResult {
  nodeId: string;
  unitSlug: string;
  graphSlug: string;
}

/**
 * Node status entry from graph status
 */
export interface NodeStatusEntry {
  id: string;
  unitSlug: string;
  status: 'pending' | 'ready' | 'running' | 'waiting-question' | 'complete' | 'failed';
  questionId?: string;
}

/**
 * Result of cg wg status
 */
export interface GraphStatusData extends BaseResult {
  graphSlug: string;
  graphStatus: string;
  nodes: NodeStatusEntry[];
}

/**
 * Result of cg wg node ask
 */
export interface AskData extends BaseResult {
  nodeId: string;
  status: string;
  questionId: string;
  question: {
    type: string;
    text: string;
    options?: string[];
  };
}

/**
 * Result of cg wg node answer
 */
export interface AnswerData extends BaseResult {
  nodeId: string;
  status: string;
  questionId: string;
  answer: unknown;
}

/**
 * CLI execution result wrapper
 */
export interface CliResult<T> {
  success: boolean;
  data: T;
  rawOutput: string;
  exitCode: number;
}
