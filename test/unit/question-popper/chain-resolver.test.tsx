/**
 * Plan 067 Phase 6: Question Popper — Chain Resolver + Component Tests
 *
 * Tests chain resolution logic (pure functions, no React) and
 * component rendering for chain view and history list.
 *
 * Testing approach: Lightweight per plan.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { QuestionOut } from '@chainglass/shared/question-popper';

import { buildChainIndex, isPartOfChain, resolveChain } from '../../../apps/web/src/features/067-question-popper/lib/chain-resolver';

afterEach(cleanup);

// ── Test Fixtures ──

function makeQ(id: string, previousId: string | null = null, status: QuestionOut['status'] = 'pending'): QuestionOut {
  return {
    questionId: id,
    status,
    question: {
      questionType: 'text',
      text: `Question ${id}`,
      description: null,
      options: null,
      default: null,
      previousQuestionId: previousId,
    },
    source: 'test-agent',
    createdAt: `2026-03-07T10:0${id.replace(/\D/g, '') || '0'}:00.000Z`,
  };
}

// ── buildChainIndex ──

describe('buildChainIndex', () => {
  it('builds bidirectional maps from items with previousQuestionId', () => {
    /**
     * Test Doc:
     * - Why: DYK-01 requires bidirectional chain discovery from any node.
     * - Contract: Single O(N) scan produces parentToChildren + childToParent maps.
     * - Usage Notes: Called internally by resolveChain and isPartOfChain.
     * - Quality Contribution: Ensures forward+backward lookups work from any position.
     * - Worked Example: A→B→C produces parent→children {A:[B], B:[C]} and child→parent {B:A, C:B}.
     */
    const items = [makeQ('a'), makeQ('b', 'a'), makeQ('c', 'b')];
    const index = buildChainIndex(items);

    expect(index.parentToChildren.get('a')).toEqual(['b']);
    expect(index.parentToChildren.get('b')).toEqual(['c']);
    expect(index.childToParent.get('b')).toBe('a');
    expect(index.childToParent.get('c')).toBe('b');
  });

  it('returns empty maps for items without chains', () => {
    /**
     * Test Doc:
     * - Why: Most questions won't be chained — index must handle this gracefully.
     * - Contract: Items with no previousQuestionId produce empty maps.
     * - Usage Notes: isPartOfChain returns false for unchained items.
     * - Quality Contribution: Prevents false positives in chain detection.
     * - Worked Example: Three independent questions → both maps empty.
     */
    const items = [makeQ('x'), makeQ('y'), makeQ('z')];
    const index = buildChainIndex(items);

    expect(index.parentToChildren.size).toBe(0);
    expect(index.childToParent.size).toBe(0);
  });
});

// ── isPartOfChain ──

describe('isPartOfChain', () => {
  it('detects chain membership for parent and child nodes', () => {
    /**
     * Test Doc:
     * - Why: Chain indicator on QuestionCard relies on this check.
     * - Contract: Returns true for any question that is a parent or child in a chain.
     * - Usage Notes: Cheap O(N) check — no API calls.
     * - Quality Contribution: Ensures "View Thread" button appears on correct cards.
     * - Worked Example: A→B: both A (parent) and B (child) return true; C (standalone) returns false.
     */
    const items = [makeQ('a'), makeQ('b', 'a'), makeQ('c')];

    expect(isPartOfChain('a', items)).toBe(true);  // parent
    expect(isPartOfChain('b', items)).toBe(true);  // child
    expect(isPartOfChain('c', items)).toBe(false); // standalone
  });
});

// ── resolveChain ──

describe('resolveChain', () => {
  it('resolves a linear chain in order (oldest → newest)', async () => {
    /**
     * Test Doc:
     * - Why: AC-24 requires conversation thread rendering in chronological order.
     * - Contract: resolveChain returns QuestionOut[] from root to leaf.
     * - Usage Notes: Walks backwards to root, then collects forward children.
     * - Quality Contribution: Ensures chain order is correct for timeline rendering.
     * - Worked Example: A→B→C, resolve from B → returns [A, B, C].
     */
    const items = [makeQ('a'), makeQ('b', 'a'), makeQ('c', 'b')];
    const chain = await resolveChain('b', items);

    expect(chain.map((q) => q.questionId)).toEqual(['a', 'b', 'c']);
  });

  it('returns single-item array for standalone questions', async () => {
    /**
     * Test Doc:
     * - Why: Standalone questions have no chain — should return just themselves.
     * - Contract: No previousQuestionId and no children → chain of length 1.
     * - Usage Notes: QuestionChainView renders nothing for single-item chains.
     * - Quality Contribution: Prevents empty chain or null return.
     * - Worked Example: Standalone Q → returns [Q].
     */
    const items = [makeQ('solo')];
    const chain = await resolveChain('solo', items);

    expect(chain).toHaveLength(1);
    expect(chain[0].questionId).toBe('solo');
  });

  it('handles missing links gracefully (chain starts from first found)', async () => {
    /**
     * Test Doc:
     * - Why: Old questions may be purged — chain must not fail on missing parents.
     * - Contract: When a previousQuestionId points to a missing item and no fetchFn is provided, chain starts from current.
     * - Usage Notes: Missing root = chain is partial but still usable.
     * - Quality Contribution: Prevents crashes on stale chains.
     * - Worked Example: B references missing A → chain = [B, C].
     */
    // B references 'missing-a' which doesn't exist in items
    const items = [makeQ('b', 'missing-a'), makeQ('c', 'b')];
    const chain = await resolveChain('c', items);

    // Should include b and c (missing-a not found), chain starts from b
    expect(chain.map((q) => q.questionId)).toEqual(['b', 'c']);
  });

  it('uses fetchQuestion fallback for missing items', async () => {
    /**
     * Test Doc:
     * - Why: DYK-05 — deep chains may have items beyond the API list limit.
     * - Contract: When item not in local list, fetchQuestion is called as fallback.
     * - Usage Notes: Sequential fetch — inherent to chain walking.
     * - Quality Contribution: Verifies API fallback path works.
     * - Worked Example: B references A not in items, fetchFn returns A → chain = [A, B].
     */
    const missingA = makeQ('a');
    const items = [makeQ('b', 'a')];

    const fetchCalls: string[] = [];
    const fetchFn = async (id: string) => {
      fetchCalls.push(id);
      return id === 'a' ? missingA : null;
    };
    const chain = await resolveChain('b', items, fetchFn);

    expect(fetchCalls).toEqual(['a']);
    expect(chain.map((q) => q.questionId)).toEqual(['a', 'b']);
  });

  it('protects against circular references', async () => {
    /**
     * Test Doc:
     * - Why: Malformed data could create cycles — must not infinite loop.
     * - Contract: Visited set breaks cycles; chain returns what was found before cycle.
     * - Usage Notes: MAX_CHAIN_DEPTH (50) also limits traversal.
     * - Quality Contribution: Prevents browser hang on corrupt data.
     * - Worked Example: A→B→A (cycle) starting from B → returns [A, B] without looping.
     */
    const a = makeQ('a', 'b'); // A references B
    const b = makeQ('b', 'a'); // B references A — circular!
    const items = [a, b];

    const chain = await resolveChain('b', items);

    // Should not hang — returns items found before cycle detected
    expect(chain.length).toBeLessThanOrEqual(2);
    expect(chain.length).toBeGreaterThanOrEqual(1);
  });

  it('resolves chain from root node (forward-only)', async () => {
    /**
     * Test Doc:
     * - Why: DYK-01 — bidirectional discovery must work from root (no backward walk needed).
     * - Contract: From root, forward walk finds all descendants.
     * - Usage Notes: Root has no previousQuestionId — backward walk returns immediately.
     * - Quality Contribution: Verifies forward-only chain direction works.
     * - Worked Example: A→B→C, resolve from A → returns [A, B, C].
     */
    const items = [makeQ('a'), makeQ('b', 'a'), makeQ('c', 'b')];
    const chain = await resolveChain('a', items);

    expect(chain.map((q) => q.questionId)).toEqual(['a', 'b', 'c']);
  });
});

// ── QuestionHistoryList (component rendering) ──

describe('QuestionHistoryList', () => {
  it('renders compact rows that expand on click', async () => {
    /**
     * Test Doc:
     * - Why: AC-26 requires scannable history list, AC-27 requires expandable detail.
     * - Contract: Renders compact rows; clicking expands to show full detail.
     * - Usage Notes: Uses HistoryItemRow (compact) + HistoryItemDetail (expanded).
     * - Quality Contribution: Verifies expand/collapse UX wiring.
     * - Worked Example: Click row → detail appears; click again → detail hides.
     */
    const { QuestionHistoryList } = await import(
      '../../../apps/web/src/features/067-question-popper/components/question-history-list'
    );

    const items = [makeQ('q1', null, 'answered')];
    const noop = async () => {};

    render(
      <QuestionHistoryList
        items={items}
        onAnswer={noop}
        onDismiss={noop}
        onClarify={noop}
        onAcknowledge={noop}
        getChain={async () => []}
      />
    );

    // Compact row should be visible
    const row = screen.getByText('Question q1');
    expect(row).toBeDefined();

    // Click to expand
    fireEvent.click(row);

    // Detail should now be visible (full question text rendered in expanded detail)
    await waitFor(() => {
      expect(screen.getByText('Answered:')).toBeDefined();
    });
  });
});
