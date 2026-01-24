# Headless Components Guide

This guide explains the headless hook pattern used in the Chainglass dashboard for testable, reusable component logic.

## Overview

The headless pattern separates **logic** (hooks) from **presentation** (UI components):

```
┌─────────────────────────────────────────────────────────────┐
│                    Component Layer                          │
│                                                             │
│  ┌─────────────────┐          ┌─────────────────┐          │
│  │  KanbanContent  │          │ WorkflowContent │          │
│  │   (UI + dnd-kit)│          │  (UI + ReactFlow)│         │
│  └────────┬────────┘          └────────┬────────┘          │
│           │                            │                    │
│           ▼                            ▼                    │
│  ┌─────────────────┐          ┌─────────────────┐          │
│  │  useBoardState  │          │  useFlowState   │          │
│  │   (Pure Logic)  │          │  (Pure Logic)   │          │
│  └─────────────────┘          └─────────────────┘          │
│                                                             │
│                    Hooks Layer                              │
└─────────────────────────────────────────────────────────────┘
```

**Benefits**:
- **Testability**: Hooks can be tested without rendering UI
- **Reusability**: Same logic works across CLI, MCP, and Web
- **Separation**: UI changes don't affect business logic

## Core Pattern

### 1. Define the Hook Interface

```typescript
// apps/web/src/hooks/useBoardState.ts

export interface UseBoardStateReturn {
  board: BoardState;
  moveCard: (cardId: CardId, targetColumnId: ColumnId, position: number) => void;
  addCard: (columnId: ColumnId, card: Card) => void;
  deleteCard: (cardId: CardId) => void;
}
```

### 2. Implement Pure Logic

```typescript
export function useBoardState(initialBoard: BoardState): UseBoardStateReturn {
  const [board, setBoard] = useState<BoardState>(() => ({
    columns: initialBoard.columns.map((col) => ({
      ...col,
      cards: [...col.cards],
    })),
  }));

  const moveCard = useCallback((cardId, targetColumnId, position) => {
    setBoard((prev) => {
      // Pure transformation logic
      // No DOM access, no side effects
      return transformedBoard;
    });
  }, []);

  return { board, moveCard, addCard, deleteCard };
}
```

### 3. Wrap with UI Component

```tsx
// apps/web/src/components/kanban/kanban-content.tsx
'use client';

export function KanbanContent({ initialBoard }: Props) {
  const { board, moveCard } = useBoardState(initialBoard);

  return (
    <DndContext onDragEnd={(event) => {
      // Bridge dnd-kit events to hook methods
      moveCard(cardId, newColumnId, newPosition);
    }}>
      {/* UI rendering */}
    </DndContext>
  );
}
```

## TDD Workflow

### RED → GREEN → REFACTOR

1. **RED**: Write test first, expect failure
2. **GREEN**: Implement minimal code to pass
3. **REFACTOR**: Improve code quality

### Example Test-First Development

```typescript
// test/unit/web/hooks/use-board-state.test.ts

import { renderHook, act } from '@testing-library/react';
import { useBoardState } from '@/hooks/useBoardState';
import { DEMO_BOARD } from '@/data/fixtures';

describe('useBoardState', () => {
  it('should move card between columns', () => {
    /*
    Test Doc:
    - Why: Core Kanban functionality for task management
    - Contract: moveCard(cardId, targetColumnId, position) updates card's columnId
    - Usage Notes: Use act() for state updates; check board structure
    - Quality Contribution: Catches state mutation bugs
    - Worked Example: moveCard('card-1', 'done', 0) → card in done column
    */
    const { result } = renderHook(() => useBoardState(DEMO_BOARD));

    act(() => {
      result.current.moveCard('card-1', 'done', 0);
    });

    const doneColumn = result.current.board.columns.find(c => c.id === 'done');
    expect(doneColumn?.cards[0]?.id).toBe('card-1');
  });
});
```

### Test Documentation Standard

Every test must include 5-field Test Doc:

```typescript
it('should handle edge case', () => {
  /*
  Test Doc:
  - Why: [Business/bug/regression reason]
  - Contract: [Plain-English invariant being tested]
  - Usage Notes: [How to call/configure; gotchas]
  - Quality Contribution: [What failure this catches]
  - Worked Example: [Inputs → Outputs]
  */
});
```

## Dependency Injection Pattern

### Parameter Injection (Recommended)

Hooks receive dependencies as parameters, not from container:

```typescript
// ✅ CORRECT - Testable
export function useSSE(
  url: string,
  eventSourceFactory: EventSourceFactory = defaultFactory
): UseSSEReturn {
  // Factory is injectable for testing
  const es = eventSourceFactory(url);
  // ...
}

// Test with fake
const fakeFactory = createFakeEventSourceFactory();
const { result } = renderHook(() => useSSE('/api/events', fakeFactory.create));
```

### DI Bridge for Components

Components bridge between DI container and hooks:

```tsx
// apps/web/src/contexts/ContainerContext.tsx

export const ContainerContext = createContext<Container | null>(null);

export function ContainerProvider({ container, children }: Props) {
  return (
    <ContainerContext.Provider value={container}>
      {children}
    </ContainerContext.Provider>
  );
}

export function useContainer(): Container {
  const container = useContext(ContainerContext);
  if (!container) throw new Error('Missing ContainerProvider');
  return container;
}
```

```tsx
// Component bridges DI → Hook
function KanbanBoard({ initialBoard }: Props) {
  const container = useContainer();
  const logger = container.resolve<ILogger>(DI_TOKENS.LOGGER);
  
  // Pass dependency to hook
  const { board, moveCard } = useBoardState(initialBoard, logger);
  // ...
}
```

## Fakes Over Mocks

### Why Fakes?

- **Behavioral**: Fakes implement the full interface with realistic behavior
- **Reusable**: Same fake works across many tests
- **Maintainable**: Interface changes propagate to fakes

### Creating a Fake

```typescript
// test/fakes/fake-event-source.ts

export class FakeEventSource implements Partial<EventSource> {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  
  readyState = EventSource.CONNECTING;
  url: string;
  
  constructor(url: string) {
    this.url = url;
  }
  
  // Simulation methods for testing
  simulateOpen() {
    this.readyState = EventSource.OPEN;
    this.onopen?.({ type: 'open' } as Event);
  }
  
  simulateMessage(data: string) {
    this.onmessage?.({ data } as MessageEvent);
  }
  
  simulateError() {
    this.onerror?.({ type: 'error' } as Event);
  }
  
  close() {
    this.readyState = EventSource.CLOSED;
  }
}
```

### Using Fakes in Tests

```typescript
import { FakeEventSource, createFakeEventSourceFactory } from '@test/fakes';

describe('useSSE', () => {
  it('should reconnect on error', async () => {
    const factory = createFakeEventSourceFactory();
    
    renderHook(() => useSSE('/api/events', factory.create));
    
    // Get the created instance
    const instance = factory.instances[0];
    instance.simulateOpen();
    instance.simulateError();
    
    // Verify reconnection attempt
    await waitFor(() => {
      expect(factory.instances.length).toBe(2);
    });
  });
});
```

## Shared Fixtures

### Creating Fixtures

```typescript
// apps/web/src/data/fixtures/board.fixture.ts

export const DEMO_BOARD: BoardState = {
  columns: [
    {
      id: 'todo',
      title: 'To Do',
      cards: [
        { id: 'card-1', title: 'Task 1', priority: 'high' },
        { id: 'card-2', title: 'Task 2', priority: 'medium' },
      ],
    },
    {
      id: 'in-progress',
      title: 'In Progress',
      cards: [
        { id: 'card-3', title: 'Task 3', priority: 'low' },
      ],
    },
    {
      id: 'done',
      title: 'Done',
      cards: [],
    },
  ],
};

// Edge case fixtures
export const EMPTY_BOARD: BoardState = { columns: [] };
export const SINGLE_COLUMN_BOARD: BoardState = { columns: [DEMO_BOARD.columns[0]] };
```

### Fixture Best Practices

- **Share between tests and demos**: Same data shapes validate both
- **Cover edge cases**: Empty states, single items, max capacity
- **Type exports**: Export types alongside data for consumers

```typescript
// apps/web/src/data/fixtures/index.ts
export * from './board.fixture';
export * from './flow.fixture';
export type { BoardState, Card, Column, CardId, ColumnId } from './board.fixture';
```

## Creating a New Headless Hook

### Step-by-Step

1. **Define interface** in `apps/web/src/hooks/useNewHook.ts`:
   ```typescript
   export interface UseNewHookReturn {
     state: StateType;
     action: (param: ParamType) => void;
   }
   ```

2. **Write tests first** in `test/unit/web/hooks/use-new-hook.test.ts`:
   ```typescript
   describe('useNewHook', () => {
     it('should perform action', () => {
       // Test Doc block
       const { result } = renderHook(() => useNewHook(initialState));
       act(() => result.current.action(param));
       expect(result.current.state).toBe(expected);
     });
   });
   ```

3. **Implement minimal hook** to pass tests

4. **Create fixture** in `apps/web/src/data/fixtures/`:
   ```typescript
   export const DEMO_STATE: StateType = { /* ... */ };
   ```

5. **Create UI wrapper** in `apps/web/src/components/`:
   ```tsx
   export function NewContent({ initial }: Props) {
     const { state, action } = useNewHook(initial);
     return <UI state={state} onAction={action} />;
   }
   ```

6. **Export from barrel** files:
   ```typescript
   // hooks/index.ts
   export * from './useNewHook';
   
   // data/fixtures/index.ts
   export * from './new.fixture';
   ```

## Example: Complete Hook Implementation

### `useBoardState` - Kanban Logic

**Location**: `apps/web/src/hooks/useBoardState.ts`

```typescript
import { useCallback, useState } from 'react';
import type { BoardState, Card, CardId, ColumnId } from '../data/fixtures';

export function useBoardState(initialBoard: BoardState) {
  const [board, setBoard] = useState<BoardState>(() => ({
    columns: initialBoard.columns.map((col) => ({
      ...col,
      cards: [...col.cards],
    })),
  }));

  const moveCard = useCallback((cardId: CardId, targetColumnId: ColumnId, position: number) => {
    setBoard((prev) => {
      // Find source
      let card: Card | undefined;
      let sourceColIdx = -1;
      
      for (let i = 0; i < prev.columns.length; i++) {
        const idx = prev.columns[i].cards.findIndex(c => c.id === cardId);
        if (idx !== -1) {
          sourceColIdx = i;
          card = prev.columns[i].cards[idx];
          break;
        }
      }
      
      if (!card || sourceColIdx === -1) return prev;
      
      const targetColIdx = prev.columns.findIndex(c => c.id === targetColumnId);
      if (targetColIdx === -1) return prev;
      
      // Immutable update
      const newColumns = prev.columns.map((col, i) => ({
        ...col,
        cards: [...col.cards],
      }));
      
      // Remove from source
      newColumns[sourceColIdx].cards = newColumns[sourceColIdx].cards.filter(
        c => c.id !== cardId
      );
      
      // Add to target at position
      const safePosition = Math.max(0, Math.min(position, newColumns[targetColIdx].cards.length));
      newColumns[targetColIdx].cards.splice(safePosition, 0, card);
      
      return { columns: newColumns };
    });
  }, []);

  // ... addCard, deleteCard implementations

  return { board, moveCard, addCard, deleteCard };
}
```

**Test Coverage**: 100% (14 tests)

## References

- [Testing Library - React Hooks](https://testing-library.com/docs/react-testing-library/api#renderhook)
- [Kent C. Dodds - Testing Implementation Details](https://kentcdodds.com/blog/testing-implementation-details)
- [Architecture Rules](../rules/architecture.md) - Clean architecture patterns
