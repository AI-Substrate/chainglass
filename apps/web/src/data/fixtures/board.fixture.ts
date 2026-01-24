/**
 * Board Fixtures - Demo data for Kanban board tests and UI
 *
 * Shared fixtures ensure tests and demo pages use identical data shapes,
 * catching type mismatches early (per CF-09).
 *
 * Structure follows DYK-04 decision: Nested column arrays for dnd-kit
 * compatibility rather than normalized map.
 */

/** Unique identifier for a card */
export type CardId = string;

/** Unique identifier for a column */
export type ColumnId = string;

/** A card represents a single task on the Kanban board */
export interface Card {
  id: CardId;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  labels?: string[];
}

/** A column contains cards and represents a workflow stage */
export interface Column {
  id: ColumnId;
  title: string;
  cards: Card[];
}

/** The complete board state with all columns */
export interface BoardState {
  columns: Column[];
}

/**
 * Demo board with 3 columns (Todo, In Progress, Done) and 5 sample cards.
 * Used in tests and Phase 6 demo pages.
 */
export const DEMO_BOARD: BoardState = {
  columns: [
    {
      id: 'todo',
      title: 'Todo',
      cards: [
        {
          id: 'card-1',
          title: 'Research API endpoints',
          description: 'Document available REST endpoints for integration',
          priority: 'high',
          labels: ['research', 'api'],
        },
        {
          id: 'card-2',
          title: 'Design database schema',
          description: 'Create ERD for user and workflow tables',
          priority: 'medium',
          labels: ['database', 'design'],
        },
      ],
    },
    {
      id: 'in-progress',
      title: 'In Progress',
      cards: [
        {
          id: 'card-3',
          title: 'Implement user authentication',
          description: 'JWT-based auth with refresh tokens',
          priority: 'high',
          labels: ['auth', 'backend'],
        },
      ],
    },
    {
      id: 'done',
      title: 'Done',
      cards: [
        {
          id: 'card-4',
          title: 'Set up project structure',
          priority: 'low',
          labels: ['setup'],
        },
        {
          id: 'card-5',
          title: 'Configure CI/CD pipeline',
          description: 'GitHub Actions for build and deploy',
          priority: 'medium',
          labels: ['devops'],
        },
      ],
    },
  ],
};

/**
 * Empty board for testing initial state scenarios.
 */
export const EMPTY_BOARD: BoardState = {
  columns: [
    { id: 'todo', title: 'Todo', cards: [] },
    { id: 'in-progress', title: 'In Progress', cards: [] },
    { id: 'done', title: 'Done', cards: [] },
  ],
};

/**
 * Single-column board for minimal testing scenarios.
 */
export const SINGLE_COLUMN_BOARD: BoardState = {
  columns: [
    {
      id: 'backlog',
      title: 'Backlog',
      cards: [{ id: 'card-solo', title: 'Solo task', priority: 'medium' }],
    },
  ],
};
