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
