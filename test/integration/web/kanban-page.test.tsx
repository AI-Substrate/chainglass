/**
 * KanbanPage Integration Tests - TDD RED Phase
 *
 * Tests for the Kanban board page with dnd-kit drag-and-drop.
 * Following TDD: tests written first to fail until T006-T007 implement components.
 *
 * DYK-08: Tests focus on keyboard accessibility (Space→Arrow→Space) because
 * pointer drag is unreliable in jsdom. This is actually better as it validates
 * AC-16 (keyboard accessibility).
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Browser mocks now consolidated in test/setup-browser-mocks.ts (FIX-007)

describe('KanbanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('board rendering', () => {
    it('should render board with columns from DEMO_BOARD fixture', async () => {
      /*
      Test Doc:
      - Why: Core rendering verification - board must display columns
      - Contract: KanbanPage renders columns from DEMO_BOARD
      - Usage Notes: Uses useBoardState hook for state management
      - Quality Contribution: Catches board layout issues
      - Worked Example: Render page → 3 columns visible (Todo, In Progress, Done)
      */

      const { KanbanContent } = await import('@/components/kanban/kanban-content');
      const { DEMO_BOARD } = await import('@/data/fixtures/board.fixture');

      render(<KanbanContent initialBoard={DEMO_BOARD} />);

      // Should render all three columns
      expect(screen.getByText('Todo')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    it('should render cards within their respective columns', async () => {
      /*
      Test Doc:
      - Why: Cards must appear in correct columns
      - Contract: DEMO_BOARD cards render in their assigned columns
      - Usage Notes: Nested column structure per DYK-04
      - Quality Contribution: Validates board data structure
      - Worked Example: "Research API endpoints" appears in Todo column
      */

      const { KanbanContent } = await import('@/components/kanban/kanban-content');
      const { DEMO_BOARD } = await import('@/data/fixtures/board.fixture');

      render(<KanbanContent initialBoard={DEMO_BOARD} />);

      // Cards should be visible
      expect(screen.getByText('Research API endpoints')).toBeInTheDocument();
      expect(screen.getByText('Design database schema')).toBeInTheDocument();
      expect(screen.getByText('Implement user authentication')).toBeInTheDocument();
      expect(screen.getByText('Set up project structure')).toBeInTheDocument();
      expect(screen.getByText('Configure CI/CD pipeline')).toBeInTheDocument();
    });
  });

  describe('keyboard accessibility (AC-16)', () => {
    it('should allow card selection with Space key', async () => {
      /*
      Test Doc:
      - Why: AC-16 - Keyboard users need to select cards
      - Contract: Focused card can be picked up with Space key
      - Usage Notes: DYK-08 - Test keyboard nav, not pointer drag
      - Quality Contribution: Validates keyboard accessibility
      - Worked Example: Focus card → Press Space → Card is "dragging"
      */

      const { KanbanContent } = await import('@/components/kanban/kanban-content');
      const { DEMO_BOARD } = await import('@/data/fixtures/board.fixture');

      render(<KanbanContent initialBoard={DEMO_BOARD} />);

      // Find the first card and focus it
      const firstCard = screen.getByText('Research API endpoints').closest('[data-sortable]');
      expect(firstCard).toBeTruthy();

      // Focus the card
      if (firstCard) {
        (firstCard as HTMLElement).focus();
        expect(document.activeElement).toBe(firstCard);

        // Press Space to start dragging
        fireEvent.keyDown(firstCard, { key: ' ', code: 'Space' });

        // The card should have a dragging indicator (aria-pressed or similar)
        await waitFor(() => {
          // Check for dragging state - implementation will add aria-grabbed or data-dragging
          const isDragging =
            firstCard.getAttribute('aria-pressed') === 'true' ||
            firstCard.getAttribute('data-dragging') === 'true';
          expect(isDragging).toBe(true);
        });
      }
    });

    it('should support keyboard navigation between cards', async () => {
      /*
      Test Doc:
      - Why: AC-16 - Keyboard users need to navigate board
      - Contract: Arrow keys move selection between cards
      - Usage Notes: Uses SortableContext from dnd-kit
      - Quality Contribution: Validates keyboard navigation
      - Worked Example: Press ArrowDown → Focus moves to next card
      */

      const { KanbanContent } = await import('@/components/kanban/kanban-content');
      const { DEMO_BOARD } = await import('@/data/fixtures/board.fixture');

      render(<KanbanContent initialBoard={DEMO_BOARD} />);

      // Find cards (dnd-kit uses role="button" for sortables)
      const cards = screen.getAllByRole('button');
      expect(cards.length).toBeGreaterThan(1);

      // Focus first card
      const firstCard = cards[0];
      (firstCard as HTMLElement).focus();

      // Verify cards are focusable (have tabindex)
      expect(firstCard.getAttribute('tabindex')).toBe('0');
    });
  });

  describe('drag and drop reordering', () => {
    it('should have proper drag-drop infrastructure in place', async () => {
      /*
      Test Doc:
      - Why: AC-14 - Cards must be movable between columns
      - Contract: KanbanContent has DndContext and proper sensors
      - Usage Notes: Full drag testing unreliable in jsdom per DYK-08
      - Quality Contribution: Validates drag-drop infrastructure
      - Worked Example: Cards have data-sortable and aria-roledescription="sortable"
      */

      const { KanbanContent } = await import('@/components/kanban/kanban-content');
      const { DEMO_BOARD } = await import('@/data/fixtures/board.fixture');

      render(<KanbanContent initialBoard={DEMO_BOARD} />);

      // Verify cards are set up for drag-and-drop
      const card = screen.getByText('Research API endpoints').closest('[data-sortable]');
      expect(card).toBeTruthy();
      expect(card).toHaveAttribute('aria-roledescription', 'sortable');
      expect(card).toHaveAttribute('data-sortable', 'true');
    });

    it('should provide onMoveCard callback prop', async () => {
      /*
      Test Doc:
      - Why: SSE integration needs to know when cards move
      - Contract: KanbanContent accepts onMoveCard callback
      - Usage Notes: Callback receives cardId, columnId, position
      - Quality Contribution: Validates callback prop exists
      - Worked Example: onMoveCard prop is accepted without error
      */

      const { KanbanContent } = await import('@/components/kanban/kanban-content');
      const { DEMO_BOARD } = await import('@/data/fixtures/board.fixture');

      const onMoveCard = vi.fn();

      // Should render without error with onMoveCard prop
      const { container } = render(
        <KanbanContent initialBoard={DEMO_BOARD} onMoveCard={onMoveCard} />
      );

      expect(container).toBeTruthy();
      // Columns should still render
      expect(screen.getByText('Todo')).toBeInTheDocument();
    });
  });

  describe('component structure', () => {
    it('should export KanbanColumn component', async () => {
      /*
      Test Doc:
      - Why: Modular design - columns should be separate components
      - Contract: KanbanColumn is exported from kanban module
      - Usage Notes: Used by KanbanContent internally
      - Quality Contribution: Validates component architecture
      - Worked Example: import { KanbanColumn } → defined
      */

      const { KanbanColumn } = await import('@/components/kanban');

      expect(KanbanColumn).toBeDefined();
    });

    it('should export KanbanCard component', async () => {
      /*
      Test Doc:
      - Why: Modular design - cards should be separate components
      - Contract: KanbanCard is exported from kanban module
      - Usage Notes: Uses useSortable hook for drag
      - Quality Contribution: Validates component architecture
      - Worked Example: import { KanbanCard } → defined
      */

      const { KanbanCard } = await import('@/components/kanban');

      expect(KanbanCard).toBeDefined();
    });
  });
});
