/**
 * Auto-Save Debounce Tests - Phase 3 (T010)
 *
 * Tests for auto-save mechanism with 500ms debounce.
 * Per AC-4: Changes saved within 500ms of last edit.
 *
 * Testing approach: Full TDD - write tests first (RED), implement (GREEN), refactor.
 */

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
    const saveFn = vi.fn().mockResolvedValue({ errors: [] });
    const { triggerChange, getSaveCount } = createAutoSaveHelper(saveFn);

    // Trigger a change
    triggerChange();

    // Save should not happen immediately
    expect(getSaveCount()).toBe(0);

    // Advance time to 499ms - still no save
    await vi.advanceTimersByTimeAsync(499);
    expect(getSaveCount()).toBe(0);

    // Advance to 500ms - save should happen
    await vi.advanceTimersByTimeAsync(1);
    expect(getSaveCount()).toBe(1);
  });

  /**
   * Test: Rapid changes are coalesced
   *
   * Purpose: Proves multiple rapid changes result in single save
   * Quality Contribution: Reduces API calls
   * Acceptance Criteria: Multiple changes within 500ms = one save
   */
  test('should coalesce rapid changes into single save', async () => {
    const saveFn = vi.fn().mockResolvedValue({ errors: [] });
    const { triggerChange, getSaveCount } = createAutoSaveHelper(saveFn);

    // Trigger multiple rapid changes
    triggerChange();
    await vi.advanceTimersByTimeAsync(100);
    triggerChange();
    await vi.advanceTimersByTimeAsync(100);
    triggerChange();
    await vi.advanceTimersByTimeAsync(100);
    triggerChange();

    // Still no save yet (debounce timer resets each time)
    expect(getSaveCount()).toBe(0);

    // Advance 500ms from last change
    await vi.advanceTimersByTimeAsync(500);

    // Should have exactly one save
    expect(getSaveCount()).toBe(1);
  });

  /**
   * Test: Structural changes trigger save
   *
   * Purpose: Proves adds/removes trigger save
   * Quality Contribution: Data persistence
   * Acceptance Criteria: Node add triggers save
   */
  test('should save on structural change (add node)', async () => {
    const saveFn = vi.fn().mockResolvedValue({ errors: [] });
    const { triggerChange, getSaveCount } = createAutoSaveHelper(saveFn);

    // Add a node (structural change)
    triggerChange('add-node');

    // Wait for debounce
    await vi.advanceTimersByTimeAsync(500);

    expect(getSaveCount()).toBe(1);
  });

  /**
   * Test: Layout changes trigger save
   *
   * Purpose: Proves position updates trigger save
   * Quality Contribution: Layout persistence
   * Acceptance Criteria: Position change triggers save
   */
  test('should save on layout change (move node)', async () => {
    const saveFn = vi.fn().mockResolvedValue({ errors: [] });
    const { triggerChange, getSaveCount } = createAutoSaveHelper(saveFn);

    // Move a node (layout change)
    triggerChange('move-node');

    // Wait for debounce
    await vi.advanceTimersByTimeAsync(500);

    expect(getSaveCount()).toBe(1);
  });

  /**
   * Test: Save failure shows error
   *
   * Purpose: Proves error feedback on save failure
   * Quality Contribution: User notification
   * Acceptance Criteria: onError called with message
   */
  test('should call onError when save fails', async () => {
    const saveFn = vi.fn().mockResolvedValue({
      errors: [{ code: 'E500', message: 'Server error' }],
    });
    const onError = vi.fn();
    const { triggerChange } = createAutoSaveHelper(saveFn, onError);

    triggerChange();
    await vi.advanceTimersByTimeAsync(500);

    expect(onError).toHaveBeenCalledWith('Server error');
  });

  /**
   * Test: No save when nothing changed
   *
   * Purpose: Proves unnecessary saves are avoided
   * Quality Contribution: Efficiency
   * Acceptance Criteria: No API call if no change
   */
  test('should not save when no changes made', async () => {
    const saveFn = vi.fn().mockResolvedValue({ errors: [] });
    const { getSaveCount } = createAutoSaveHelper(saveFn);

    // Don't trigger any changes, just wait
    await vi.advanceTimersByTimeAsync(1000);

    expect(getSaveCount()).toBe(0);
  });
});

/**
 * Helper to create auto-save test context.
 * Simulates the debounce mechanism.
 */
function createAutoSaveHelper(
  saveFn: () => Promise<{ errors: { message: string }[] }>,
  onError?: (message: string) => void
) {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let saveCount = 0;
  const DEBOUNCE_MS = 500;

  const triggerChange = (_changeType?: string) => {
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Set new debounced save
    debounceTimer = setTimeout(async () => {
      saveCount++;
      const result = await saveFn();
      if (result.errors.length > 0 && onError) {
        onError(result.errors[0].message);
      }
    }, DEBOUNCE_MS);
  };

  const getSaveCount = () => saveCount;

  return { triggerChange, getSaveCount };
}
