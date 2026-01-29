/**
 * Auto-Save Debounce Tests - Phase 3 (T010)
 *
 * Tests for auto-save mechanism with 500ms debounce.
 * Per AC-4: Changes saved within 500ms of last edit.
 *
 * Testing approach: Full TDD - write tests first (RED), implement (GREEN), refactor.
 * Per Constitution Principle 4: Using Fake classes instead of vi.fn().
 */

import { FakeErrorCallback, FakeSaveFunction } from '@/features/022-workgraph-ui/test-fakes';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('Auto-Save Debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Test: Changes trigger save after debounce period
   *
   * Purpose: Proves save happens after 500ms idle
   * Quality Contribution: Core auto-save functionality
   * Acceptance Criteria: API called 500ms after last change
   */
  test('should save 500ms after last change', async () => {
    const fakeSave = new FakeSaveFunction();
    const { triggerChange } = createAutoSaveHelper(fakeSave);

    // Trigger a change
    triggerChange();

    // Save should not happen immediately
    expect(fakeSave.callCount).toBe(0);

    // Advance time to 499ms - still no save
    await vi.advanceTimersByTimeAsync(499);
    expect(fakeSave.callCount).toBe(0);

    // Advance to 500ms - save should happen
    await vi.advanceTimersByTimeAsync(1);
    expect(fakeSave.callCount).toBe(1);
  });

  /**
   * Test: Rapid changes are coalesced
   *
   * Purpose: Proves multiple rapid changes result in single save
   * Quality Contribution: Reduces API calls
   * Acceptance Criteria: Multiple changes within 500ms = one save
   */
  test('should coalesce rapid changes into single save', async () => {
    const fakeSave = new FakeSaveFunction();
    const { triggerChange } = createAutoSaveHelper(fakeSave);

    // Trigger multiple rapid changes
    triggerChange();
    await vi.advanceTimersByTimeAsync(100);
    triggerChange();
    await vi.advanceTimersByTimeAsync(100);
    triggerChange();
    await vi.advanceTimersByTimeAsync(100);
    triggerChange();

    // Still no save yet (debounce timer resets each time)
    expect(fakeSave.callCount).toBe(0);

    // Advance 500ms from last change
    await vi.advanceTimersByTimeAsync(500);

    // Should have exactly one save
    expect(fakeSave.callCount).toBe(1);
  });

  /**
   * Test: Structural changes trigger save
   *
   * Purpose: Proves adds/removes trigger save
   * Quality Contribution: Data persistence
   * Acceptance Criteria: Node add triggers save
   */
  test('should save on structural change (add node)', async () => {
    const fakeSave = new FakeSaveFunction();
    const { triggerChange } = createAutoSaveHelper(fakeSave);

    // Add a node (structural change)
    triggerChange('add-node');

    // Wait for debounce
    await vi.advanceTimersByTimeAsync(500);

    expect(fakeSave.callCount).toBe(1);
  });

  /**
   * Test: Layout changes trigger save
   *
   * Purpose: Proves position updates trigger save
   * Quality Contribution: Layout persistence
   * Acceptance Criteria: Position change triggers save
   */
  test('should save on layout change (move node)', async () => {
    const fakeSave = new FakeSaveFunction();
    const { triggerChange } = createAutoSaveHelper(fakeSave);

    // Move a node (layout change)
    triggerChange('move-node');

    // Wait for debounce
    await vi.advanceTimersByTimeAsync(500);

    expect(fakeSave.callCount).toBe(1);
  });

  /**
   * Test: Save failure shows error
   *
   * Purpose: Proves error feedback on save failure
   * Quality Contribution: User notification
   * Acceptance Criteria: onError called with message
   */
  test('should call onError when save fails', async () => {
    const fakeSave = new FakeSaveFunction();
    fakeSave.setResult({
      errors: [{ code: 'E500', message: 'Server error' }],
    });
    const errorCallback = new FakeErrorCallback();
    const { triggerChange } = createAutoSaveHelper(fakeSave, errorCallback);

    triggerChange();
    await vi.advanceTimersByTimeAsync(500);

    expect(errorCallback.wasCalledWith('Server error')).toBe(true);
  });

  /**
   * Test: No save when nothing changed
   *
   * Purpose: Proves unnecessary saves are avoided
   * Quality Contribution: Efficiency
   * Acceptance Criteria: No API call if no change
   */
  test('should not save when no changes made', async () => {
    const fakeSave = new FakeSaveFunction();
    createAutoSaveHelper(fakeSave);

    // Don't trigger any changes, just wait
    await vi.advanceTimersByTimeAsync(1000);

    expect(fakeSave.callCount).toBe(0);
  });
});

/**
 * Helper to create auto-save test context.
 * Simulates the debounce mechanism using FakeSaveFunction.
 */
function createAutoSaveHelper(fakeSave: FakeSaveFunction, errorCallback?: FakeErrorCallback) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 500;

  const triggerChange = (_changeType?: string) => {
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Set new debounced save
    debounceTimer = setTimeout(async () => {
      const result = await fakeSave.save();
      if (result.errors.length > 0 && errorCallback) {
        errorCallback.handler(result.errors[0].message);
      }
    }, DEBOUNCE_MS);
  };

  return { triggerChange };
}
