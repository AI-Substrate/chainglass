import { describe, expect, it } from 'vitest';
import { UndoRedoManager } from '@/features/050-workflow-page/lib/undo-redo-manager';
import type { WorkflowSnapshot } from '@/features/050-workflow-page/types';

function makeSnapshot(id: string): WorkflowSnapshot {
  return {
    definition: {
      slug: `test-${id}`,
      lines: [],
    } as unknown as WorkflowSnapshot['definition'],
    nodeConfigs: {},
    description: `Snapshot ${id}`,
  };
}

describe('UndoRedoManager', () => {
  it('starts empty', () => {
    const mgr = new UndoRedoManager();
    expect(mgr.undoDepth).toBe(0);
    expect(mgr.redoDepth).toBe(0);
    expect(mgr.canUndo).toBe(false);
    expect(mgr.canRedo).toBe(false);
  });

  it('snapshot pushes to undo stack', () => {
    const mgr = new UndoRedoManager();
    mgr.snapshot(makeSnapshot('a'));
    expect(mgr.undoDepth).toBe(1);
    expect(mgr.canUndo).toBe(true);
  });

  it('undo returns previous snapshot', () => {
    const mgr = new UndoRedoManager();
    const a = makeSnapshot('a');
    const b = makeSnapshot('b');
    mgr.snapshot(a);

    const result = mgr.undo(b);
    expect(result).not.toBeNull();
    expect(result?.description).toBe('Snapshot a');
    expect(mgr.undoDepth).toBe(0);
    expect(mgr.redoDepth).toBe(1);
  });

  it('redo returns next snapshot', () => {
    const mgr = new UndoRedoManager();
    const a = makeSnapshot('a');
    const b = makeSnapshot('b');
    mgr.snapshot(a);
    mgr.undo(b);

    const result = mgr.redo(a);
    expect(result).not.toBeNull();
    expect(result?.description).toBe('Snapshot b');
  });

  it('undo returns null when stack is empty', () => {
    const mgr = new UndoRedoManager();
    expect(mgr.undo(makeSnapshot('x'))).toBeNull();
  });

  it('redo returns null when stack is empty', () => {
    const mgr = new UndoRedoManager();
    expect(mgr.redo(makeSnapshot('x'))).toBeNull();
  });

  it('new snapshot clears redo stack', () => {
    const mgr = new UndoRedoManager();
    mgr.snapshot(makeSnapshot('a'));
    mgr.undo(makeSnapshot('b'));
    expect(mgr.redoDepth).toBe(1);

    mgr.snapshot(makeSnapshot('c'));
    expect(mgr.redoDepth).toBe(0);
  });

  it('invalidate clears both stacks', () => {
    const mgr = new UndoRedoManager();
    mgr.snapshot(makeSnapshot('a'));
    mgr.snapshot(makeSnapshot('b'));
    mgr.undo(makeSnapshot('c'));

    mgr.invalidate();
    expect(mgr.undoDepth).toBe(0);
    expect(mgr.redoDepth).toBe(0);
  });

  it('enforces max 50 snapshots', () => {
    const mgr = new UndoRedoManager();
    for (let i = 0; i < 60; i++) {
      mgr.snapshot(makeSnapshot(`s${i}`));
    }
    expect(mgr.undoDepth).toBe(50);
  });

  it('uses structuredClone for isolation', () => {
    const mgr = new UndoRedoManager();
    const original = makeSnapshot('a');
    mgr.snapshot(original);

    // Mutate the original after snapshot
    original.description = 'MUTATED';

    const restored = mgr.undo(makeSnapshot('b'));
    expect(restored?.description).toBe('Snapshot a');
  });
});
