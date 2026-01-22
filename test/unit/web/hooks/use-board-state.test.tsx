/**
 * useBoardState Tests - TDD RED Phase
 *
 * Tests for the Kanban board state management hook.
 * Following TDD approach: write tests first, expect them to fail.
 *
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

// Use relative imports to work around vitest alias resolution issues
import { type Card, DEMO_BOARD, EMPTY_BOARD } from '../../../../apps/web/src/data/fixtures';
import { useBoardState } from '../../../../apps/web/src/hooks/useBoardState';

describe('useBoardState', () => {
  describe('initialization', () => {
    it('should initialize with provided board state', () => {
      /*
      Test Doc:
      - Why: Hook must accept and preserve initial board state
      - Contract: useBoardState(initialBoard) returns { board } where board === initialBoard shape
      - Usage Notes: Use renderHook from @testing-library/react
      - Quality Contribution: Catches initialization bugs, ensures state immutability
      - Worked Example: useBoardState(DEMO_BOARD) → board has 3 columns, 5 cards
      */
      const { result } = renderHook(() => useBoardState(DEMO_BOARD));

      expect(result.current.board.columns).toHaveLength(3);
      expect(result.current.board.columns[0].id).toBe('todo');
      expect(result.current.board.columns[0].cards).toHaveLength(2);
    });

    it('should initialize with empty board', () => {
      /*
      Test Doc:
      - Why: Hook must handle empty boards for fresh starts
      - Contract: useBoardState(emptyBoard) returns board with empty card arrays
      - Usage Notes: Empty columns array is valid initial state
      - Quality Contribution: Catches null pointer errors on empty state
      - Worked Example: useBoardState(EMPTY_BOARD) → 3 columns, 0 cards each
      */
      const { result } = renderHook(() => useBoardState(EMPTY_BOARD));

      expect(result.current.board.columns).toHaveLength(3);
      expect(result.current.board.columns[0].cards).toHaveLength(0);
    });
  });

  describe('moveCard', () => {
    it('should move card between columns (cross-column)', () => {
      /*
      Test Doc:
      - Why: Core Kanban functionality for task management
      - Contract: moveCard(cardId, targetColumnId, position) moves card to target column at position
      - Usage Notes: Use act() for state updates; position is 0-indexed
      - Quality Contribution: Catches state mutation bugs in board transformations
      - Worked Example: moveCard('card-1', 'done', 0) → card-1 in done column at index 0
      */
      const { result } = renderHook(() => useBoardState(DEMO_BOARD));

      // card-1 starts in 'todo' column
      const todoColumn = result.current.board.columns.find((c) => c.id === 'todo');
      expect(todoColumn?.cards.some((c) => c.id === 'card-1')).toBe(true);

      // Move to 'done' column
      act(() => {
        result.current.moveCard('card-1', 'done', 0);
      });

      // Verify card moved
      const updatedTodo = result.current.board.columns.find((c) => c.id === 'todo');
      const updatedDone = result.current.board.columns.find((c) => c.id === 'done');

      expect(updatedTodo?.cards.some((c) => c.id === 'card-1')).toBe(false);
      expect(updatedDone?.cards[0]?.id).toBe('card-1');
    });

    it('should reorder card within same column', () => {
      /*
      Test Doc:
      - Why: Users drag to prioritize tasks within column
      - Contract: moveCard(cardId, sameColumnId, newPosition) reorders card
      - Usage Notes: Moving within same column shifts other cards
      - Quality Contribution: Catches reorder bugs that lose cards
      - Worked Example: moveCard('card-2', 'todo', 0) → card-2 moves above card-1
      */
      const { result } = renderHook(() => useBoardState(DEMO_BOARD));

      // card-2 is at index 1 in todo
      const todoColumn = result.current.board.columns.find((c) => c.id === 'todo');
      expect(todoColumn?.cards[1]?.id).toBe('card-2');

      // Move card-2 to top (index 0)
      act(() => {
        result.current.moveCard('card-2', 'todo', 0);
      });

      // Verify reorder
      const updatedTodo = result.current.board.columns.find((c) => c.id === 'todo');
      expect(updatedTodo?.cards[0]?.id).toBe('card-2');
      expect(updatedTodo?.cards[1]?.id).toBe('card-1');
    });

    it('should handle moving to end of target column', () => {
      /*
      Test Doc:
      - Why: Users often drop cards at end of column
      - Contract: moveCard(cardId, columnId, column.length) appends card
      - Usage Notes: Position can be array length to append
      - Quality Contribution: Validates boundary position handling
      - Worked Example: moveCard('card-1', 'done', 2) → card-1 at end of done (3 cards total)
      */
      const { result } = renderHook(() => useBoardState(DEMO_BOARD));

      // done has 2 cards initially
      const doneColumn = result.current.board.columns.find((c) => c.id === 'done');
      expect(doneColumn?.cards).toHaveLength(2);

      // Move card-1 to end of done
      act(() => {
        result.current.moveCard('card-1', 'done', 2);
      });

      const updatedDone = result.current.board.columns.find((c) => c.id === 'done');
      expect(updatedDone?.cards).toHaveLength(3);
      expect(updatedDone?.cards[2]?.id).toBe('card-1');
    });
  });

  describe('addCard', () => {
    it('should add card to specified column', () => {
      /*
      Test Doc:
      - Why: Users create new tasks on the board
      - Contract: addCard(columnId, card) adds card to column
      - Usage Notes: Returns void; check board state for new card
      - Quality Contribution: Validates card creation doesn't corrupt state
      - Worked Example: addCard('todo', newCard) → todo has 3 cards
      */
      const { result } = renderHook(() => useBoardState(DEMO_BOARD));

      const newCard: Card = {
        id: 'card-new',
        title: 'New Task',
        priority: 'low',
      };

      act(() => {
        result.current.addCard('todo', newCard);
      });

      const todoColumn = result.current.board.columns.find((c) => c.id === 'todo');
      expect(todoColumn?.cards).toHaveLength(3);
      expect(todoColumn?.cards.some((c) => c.id === 'card-new')).toBe(true);
    });

    it('should add card to empty column', () => {
      /*
      Test Doc:
      - Why: Empty columns should accept new cards
      - Contract: addCard works on columns with no cards
      - Usage Notes: First card in column has index 0
      - Quality Contribution: Catches empty array edge cases
      - Worked Example: addCard('todo', card) on empty board → 1 card
      */
      const { result } = renderHook(() => useBoardState(EMPTY_BOARD));

      const newCard: Card = {
        id: 'first-card',
        title: 'First Task',
      };

      act(() => {
        result.current.addCard('todo', newCard);
      });

      const todoColumn = result.current.board.columns.find((c) => c.id === 'todo');
      expect(todoColumn?.cards).toHaveLength(1);
      expect(todoColumn?.cards[0]?.id).toBe('first-card');
    });
  });

  describe('deleteCard', () => {
    it('should remove card from board', () => {
      /*
      Test Doc:
      - Why: Users delete completed or cancelled tasks
      - Contract: deleteCard(cardId) removes card from its column
      - Usage Notes: Card must exist; no-op if not found
      - Quality Contribution: Validates deletion doesn't corrupt other cards
      - Worked Example: deleteCard('card-1') → todo has 1 card
      */
      const { result } = renderHook(() => useBoardState(DEMO_BOARD));

      // todo starts with 2 cards
      const todoColumn = result.current.board.columns.find((c) => c.id === 'todo');
      expect(todoColumn?.cards).toHaveLength(2);

      act(() => {
        result.current.deleteCard('card-1');
      });

      const updatedTodo = result.current.board.columns.find((c) => c.id === 'todo');
      expect(updatedTodo?.cards).toHaveLength(1);
      expect(updatedTodo?.cards.some((c) => c.id === 'card-1')).toBe(false);
    });

    it('should delete card from any column', () => {
      /*
      Test Doc:
      - Why: Cards can be deleted from any column
      - Contract: deleteCard finds card across all columns
      - Usage Notes: Searches all columns for matching cardId
      - Quality Contribution: Validates cross-column search works
      - Worked Example: deleteCard('card-3') removes from in-progress
      */
      const { result } = renderHook(() => useBoardState(DEMO_BOARD));

      // card-3 is in in-progress column
      act(() => {
        result.current.deleteCard('card-3');
      });

      const inProgressColumn = result.current.board.columns.find((c) => c.id === 'in-progress');
      expect(inProgressColumn?.cards).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should not crash when moving non-existent card', () => {
      /*
      Test Doc:
      - Why: Invalid card IDs shouldn't crash the app
      - Contract: moveCard with invalid cardId is no-op
      - Usage Notes: State remains unchanged on invalid input
      - Quality Contribution: Prevents crashes from race conditions
      - Worked Example: moveCard('non-existent', 'done', 0) → no change
      */
      const { result } = renderHook(() => useBoardState(DEMO_BOARD));

      const originalBoard = JSON.stringify(result.current.board);

      act(() => {
        result.current.moveCard('non-existent-card', 'done', 0);
      });

      expect(JSON.stringify(result.current.board)).toBe(originalBoard);
    });

    it('should not crash when moving to non-existent column', () => {
      /*
      Test Doc:
      - Why: Invalid column IDs shouldn't crash the app
      - Contract: moveCard with invalid columnId is no-op
      - Usage Notes: Validates target column exists before moving
      - Quality Contribution: Catches invalid drop targets
      - Worked Example: moveCard('card-1', 'invalid-column', 0) → no change
      */
      const { result } = renderHook(() => useBoardState(DEMO_BOARD));

      const originalBoard = JSON.stringify(result.current.board);

      act(() => {
        result.current.moveCard('card-1', 'non-existent-column', 0);
      });

      expect(JSON.stringify(result.current.board)).toBe(originalBoard);
    });

    it('should not crash when deleting non-existent card', () => {
      /*
      Test Doc:
      - Why: Invalid deletions shouldn't crash
      - Contract: deleteCard with invalid cardId is no-op
      - Usage Notes: Silent failure for missing cards
      - Quality Contribution: Handles double-delete race conditions
      - Worked Example: deleteCard('ghost') → no change
      */
      const { result } = renderHook(() => useBoardState(DEMO_BOARD));

      const originalBoard = JSON.stringify(result.current.board);

      act(() => {
        result.current.deleteCard('non-existent-card');
      });

      expect(JSON.stringify(result.current.board)).toBe(originalBoard);
    });

    it('should not crash when adding to non-existent column', () => {
      /*
      Test Doc:
      - Why: Adding to invalid column shouldn't crash
      - Contract: addCard with invalid columnId is no-op
      - Usage Notes: Validates column exists before adding
      - Quality Contribution: Prevents card loss to invalid targets
      - Worked Example: addCard('invalid', card) → no change
      */
      const { result } = renderHook(() => useBoardState(DEMO_BOARD));

      const originalBoard = JSON.stringify(result.current.board);
      const newCard: Card = { id: 'test', title: 'Test' };

      act(() => {
        result.current.addCard('non-existent-column', newCard);
      });

      expect(JSON.stringify(result.current.board)).toBe(originalBoard);
    });
  });

  describe('state immutability', () => {
    it('should not mutate original board state', () => {
      /*
      Test Doc:
      - Why: React requires immutable state updates
      - Contract: Operations return new state objects, not mutations
      - Usage Notes: Original board reference should remain unchanged
      - Quality Contribution: Catches mutation bugs that break React rendering
      - Worked Example: moveCard doesn't modify DEMO_BOARD
      */
      const originalTodoCards = [...DEMO_BOARD.columns[0].cards];

      const { result } = renderHook(() => useBoardState(DEMO_BOARD));

      act(() => {
        result.current.moveCard('card-1', 'done', 0);
      });

      // Original fixture should be unchanged
      expect(DEMO_BOARD.columns[0].cards).toEqual(originalTodoCards);
    });
  });
});
