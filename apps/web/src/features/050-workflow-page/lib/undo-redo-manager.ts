/**
 * UndoRedoManager — In-memory snapshot undo/redo for workflow structural edits.
 *
 * Uses structuredClone for isolation. Snapshots include graph definition +
 * all node configs (NOT runtime state.json). Max 50 snapshots (~5MB for
 * typical workflows).
 *
 * Phase 5: Q&A + Node Properties Modal + Undo/Redo — Plan 050
 */

import type { WorkflowSnapshot } from '../types';

const MAX_SNAPSHOTS = 50;

export class UndoRedoManager {
  private undoStack: WorkflowSnapshot[] = [];
  private redoStack: WorkflowSnapshot[] = [];

  /** Capture current state before a mutation. */
  snapshot(state: WorkflowSnapshot): void {
    this.undoStack.push(structuredClone(state));
    // New mutation invalidates redo history
    this.redoStack = [];
    // Enforce max cap
    if (this.undoStack.length > MAX_SNAPSHOTS) {
      this.undoStack.shift();
    }
  }

  /** Undo: pop from undo stack, push current to redo, return previous state. */
  undo(current: WorkflowSnapshot): WorkflowSnapshot | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    this.redoStack.push(structuredClone(current));
    return previous;
  }

  /** Redo: pop from redo stack, push current to undo, return next state. */
  redo(current: WorkflowSnapshot): WorkflowSnapshot | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(structuredClone(current));
    return next;
  }

  /** Clear both stacks (e.g., external change detected). */
  invalidate(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
