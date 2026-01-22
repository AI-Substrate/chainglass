/**
 * useBoardState - Kanban board state management hook
 *
 * Pure logic hook for managing Kanban board state.
 * Follows DYK-04 decision: Nested column arrays for dnd-kit compatibility.
 * Follows DYK-01 decision: Parameter injection for testability.
 */

import { useCallback, useState } from 'react';

import type { BoardState, Card, CardId, ColumnId } from '../data/fixtures';

export interface UseBoardStateReturn {
  board: BoardState;
  moveCard: (cardId: CardId, targetColumnId: ColumnId, position: number) => void;
  addCard: (columnId: ColumnId, card: Card) => void;
  deleteCard: (cardId: CardId) => void;
}

/**
 * Hook for managing Kanban board state with nested column structure.
 *
 * @param initialBoard - Initial board state with columns and cards
 * @returns Board state and mutation functions
 *
 * @example
 * const { board, moveCard, addCard, deleteCard } = useBoardState(DEMO_BOARD);
 * moveCard('card-1', 'done', 0); // Move card-1 to done column at index 0
 */
export function useBoardState(initialBoard: BoardState): UseBoardStateReturn {
  const [board, setBoard] = useState<BoardState>(() => ({
    // Deep clone to avoid mutating the original
    columns: initialBoard.columns.map((col) => ({
      ...col,
      cards: [...col.cards],
    })),
  }));

  /**
   * Move a card to a target column at a specific position.
   * Handles both cross-column moves and same-column reordering.
   */
  const moveCard = useCallback((cardId: CardId, targetColumnId: ColumnId, position: number) => {
    setBoard((prev) => {
      // Find the source column and card
      let sourceColumnIndex = -1;
      let sourceCardIndex = -1;
      let card: Card | undefined;

      for (let i = 0; i < prev.columns.length; i++) {
        const col = prev.columns[i];
        const cardIndex = col.cards.findIndex((c) => c.id === cardId);
        if (cardIndex !== -1) {
          sourceColumnIndex = i;
          sourceCardIndex = cardIndex;
          card = col.cards[cardIndex];
          break;
        }
      }

      // Card not found - no-op
      if (sourceColumnIndex === -1 || !card) {
        return prev;
      }

      // Find target column
      const targetColumnIndex = prev.columns.findIndex((col) => col.id === targetColumnId);

      // Target column not found - no-op
      if (targetColumnIndex === -1) {
        return prev;
      }

      // Create new state with immutable updates
      const newColumns = prev.columns.map((col, idx) => ({
        ...col,
        cards: [...col.cards],
      }));

      // Remove from source
      newColumns[sourceColumnIndex].cards.splice(sourceCardIndex, 1);

      // Insert at target position
      newColumns[targetColumnIndex].cards.splice(position, 0, card);

      return { columns: newColumns };
    });
  }, []);

  /**
   * Add a new card to a specific column.
   */
  const addCard = useCallback((columnId: ColumnId, card: Card) => {
    setBoard((prev) => {
      const columnIndex = prev.columns.findIndex((col) => col.id === columnId);

      // Column not found - no-op
      if (columnIndex === -1) {
        return prev;
      }

      const newColumns = prev.columns.map((col, idx) => ({
        ...col,
        cards: [...col.cards],
      }));

      newColumns[columnIndex].cards.push(card);

      return { columns: newColumns };
    });
  }, []);

  /**
   * Delete a card from the board.
   */
  const deleteCard = useCallback((cardId: CardId) => {
    setBoard((prev) => {
      // Find the column containing the card
      let columnIndex = -1;
      let cardIndex = -1;

      for (let i = 0; i < prev.columns.length; i++) {
        const idx = prev.columns[i].cards.findIndex((c) => c.id === cardId);
        if (idx !== -1) {
          columnIndex = i;
          cardIndex = idx;
          break;
        }
      }

      // Card not found - no-op
      if (columnIndex === -1) {
        return prev;
      }

      const newColumns = prev.columns.map((col, idx) => ({
        ...col,
        cards: [...col.cards],
      }));

      newColumns[columnIndex].cards.splice(cardIndex, 1);

      return { columns: newColumns };
    });
  }, []);

  return {
    board,
    moveCard,
    addCard,
    deleteCard,
  };
}
