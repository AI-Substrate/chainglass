/**
 * Fixture Exports - Shared demo data for tests and UI
 *
 * Re-exports all fixtures from a single entry point for clean imports:
 * `import { DEMO_BOARD, DEMO_FLOW } from '@/data/fixtures';`
 */

// Board fixtures
export {
  DEMO_BOARD,
  EMPTY_BOARD,
  SINGLE_COLUMN_BOARD,
  type BoardState,
  type Card,
  type CardId,
  type Column,
  type ColumnId,
} from './board.fixture';

// Flow fixtures
export {
  DEMO_FLOW,
  EMPTY_FLOW,
  SINGLE_NODE_FLOW,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowNodeData,
} from './flow.fixture';

// Workflow fixtures (Plan 011)
export {
  // Types
  type RunStatus,
  type PhaseRunStatus,
  type Facilitator,
  type QuestionType,
  type PhaseQuestion,
  type PhaseStatusEntry,
  type PhaseJSON,
  type RunMetadataJSON,
  type CheckpointMetadataJSON,
  type WorkflowJSON,
  // Factory functions
  createPhase,
  createRunMetadata,
  createCheckpointMetadata,
  createWorkflow,
  // Demo data
  DEMO_QUESTIONS,
  DEMO_MANUAL_TEST_WORKFLOW,
  DEMO_WORKFLOWS,
} from './workflows.fixture';

// Run fixtures (Plan 011)
export {
  type RunSummary,
  type RunDetail,
  createRunSummary,
  createRunDetail,
  DEMO_RUN_GATHER_BLOCKED,
  DEMO_RUN_PROCESS_BLOCKED,
  DEMO_RUN_REPORT_BLOCKED,
  DEMO_RUN_GATHER_ACTIVE,
  DEMO_RUN_COMPLETE,
  DEMO_RUN_FAILED,
  DEMO_RUNS,
  DEMO_RUN_SUMMARIES,
  DEMO_CHECKPOINTS,
  getRunsForWorkflow,
  getRunById,
  getRunSummariesForWorkflow,
} from './runs.fixture';

// Run board fixtures (Plan 011 - Kanban view)
export {
  type RunCard,
  createRunsBoard,
  DEMO_RUNS_BOARD,
  getRunsBoardForWorkflow,
} from './runs-board.fixture';
