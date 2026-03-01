/**
 * Tests for WorkUnitCatalogWatcherAdapter.
 *
 * Plan 058, Phase 4, FT-004.
 *
 * @vitest-environment node
 */

import { describe, expect, it, vi } from 'vitest';

import { WorkUnitCatalogWatcherAdapter } from '@chainglass/workflow';
import type { WatcherEvent } from '@chainglass/workflow';

function makeEvent(path: string, overrides: Partial<WatcherEvent> = {}): WatcherEvent {
  return {
    path,
    eventType: 'change',
    worktreePath: '/workspace',
    workspaceSlug: 'test-ws',
    ...overrides,
  };
}

describe('WorkUnitCatalogWatcherAdapter', () => {
  it('emits event for unit.yaml changes', () => {
    /*
    Test Doc:
    - Why: Unit metadata edits must trigger notifications
    - Contract: unit.yaml changes in units/<slug>/ emit onUnitChanged
    - Usage Notes: AC-24: banner appears on unit file change
    - Quality Contribution: Proves watcher adapter self-filters correctly
    - Worked Example: units/my-unit/unit.yaml change => onUnitChanged fires
    */
    const adapter = new WorkUnitCatalogWatcherAdapter(0);
    const callback = vi.fn();
    adapter.onUnitChanged(callback);

    adapter.handleEvent(makeEvent('/workspace/.chainglass/units/my-unit/unit.yaml'));

    // Debounce fires asynchronously even at 0ms
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback.mock.calls[0][0].unitSlug).toBe('my-unit');
        expect(callback.mock.calls[0][0].workspaceSlug).toBe('test-ws');
        resolve();
      }, 10);
    });
  });

  it('emits event for template file changes', () => {
    /*
    Test Doc:
    - Why: Template content edits (prompt, script) must trigger notifications
    - Contract: templates/* changes in units/<slug>/ emit onUnitChanged
    - Usage Notes: AC-24: both unit.yaml and template changes detected
    - Quality Contribution: Proves regex matches template subdirectory
    - Worked Example: units/my-unit/templates/prompt.md => onUnitChanged fires
    */
    const adapter = new WorkUnitCatalogWatcherAdapter(0);
    const callback = vi.fn();
    adapter.onUnitChanged(callback);

    adapter.handleEvent(makeEvent('/workspace/.chainglass/units/my-unit/templates/prompt.md'));

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback.mock.calls[0][0].unitSlug).toBe('my-unit');
        resolve();
      }, 10);
    });
  });

  it('ignores non-unit file changes', () => {
    /*
    Test Doc:
    - Why: Adapter must self-filter — only unit catalog files are relevant
    - Contract: Non-matching paths do not trigger onUnitChanged
    - Usage Notes: Prevents false notifications from workflow or other data changes
    - Quality Contribution: Proves regex exclusion works
    - Worked Example: workflows/wf-1/graph.yaml => no event
    */
    const adapter = new WorkUnitCatalogWatcherAdapter(0);
    const callback = vi.fn();
    adapter.onUnitChanged(callback);

    adapter.handleEvent(makeEvent('/workspace/.chainglass/data/workflows/wf-1/graph.yaml'));
    adapter.handleEvent(makeEvent('/workspace/src/index.ts'));

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(callback).not.toHaveBeenCalled();
        resolve();
      }, 10);
    });
  });

  it('debounces rapid changes', () => {
    /*
    Test Doc:
    - Why: Bulk operations (rename cascade) produce many events — debounce prevents storm
    - Contract: Multiple rapid events produce only one callback invocation
    - Usage Notes: 200ms default debounce; test uses 50ms for speed
    - Quality Contribution: Proves debounce collapses rapid events
    - Worked Example: 3 rapid unit.yaml changes => 1 onUnitChanged call
    */
    const adapter = new WorkUnitCatalogWatcherAdapter(50);
    const callback = vi.fn();
    adapter.onUnitChanged(callback);

    adapter.handleEvent(makeEvent('/workspace/.chainglass/units/a/unit.yaml'));
    adapter.handleEvent(makeEvent('/workspace/.chainglass/units/b/unit.yaml'));
    adapter.handleEvent(makeEvent('/workspace/.chainglass/units/c/unit.yaml'));

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(callback).toHaveBeenCalledTimes(1);
        // Last event wins
        expect(callback.mock.calls[0][0].unitSlug).toBe('c');
        resolve();
      }, 100);
    });
  });

  it('unsubscribe stops callbacks', () => {
    /*
    Test Doc:
    - Why: Cleanup must prevent memory leaks and stale callbacks
    - Contract: Calling returned unsubscribe function stops future callbacks
    - Usage Notes: Components call unsubscribe on unmount
    - Quality Contribution: Proves subscriber cleanup works
    - Worked Example: subscribe => unsubscribe => event => no callback
    */
    const adapter = new WorkUnitCatalogWatcherAdapter(0);
    const callback = vi.fn();
    const unsubscribe = adapter.onUnitChanged(callback);

    unsubscribe();
    adapter.handleEvent(makeEvent('/workspace/.chainglass/units/my-unit/unit.yaml'));

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(callback).not.toHaveBeenCalled();
        resolve();
      }, 10);
    });
  });
});
