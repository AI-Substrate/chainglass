/**
 * Plan 067 Phase 6: Question Popper — Chain Resolver
 *
 * Resolves conversation chains by walking `previousQuestionId` links.
 *
 * DYK-01: Bidirectional chain index — single O(N) scan builds
 *   parentToChildren + childToParent maps for discovery from any node.
 * DYK-04: Results cached in hook via useRef<Map> (cleared on refetch).
 * DYK-05: Sequential API fallback for missing links — accepted, show loading.
 *
 * Pure functions (no React dependency) — testable without rendering.
 */

import type { QuestionOut } from '@chainglass/shared/question-popper';

// ── Types ──

export interface ChainIndex {
  /** Map from parent question ID → child question IDs (forward links) */
  parentToChildren: Map<string, string[]>;
  /** Map from child question ID → parent question ID (backward link) */
  childToParent: Map<string, string>;
}

/** Function to fetch a single question by ID (API fallback) */
export type FetchQuestionFn = (id: string) => Promise<QuestionOut | null>;

// ── Index Builder (DYK-01) ──

/**
 * Build a bidirectional chain index from a list of items.
 * Single O(N) scan — call once per items refresh.
 */
export function buildChainIndex(
  items: Array<{ questionId?: string; question?: { previousQuestionId?: string | null } }>
): ChainIndex {
  const parentToChildren = new Map<string, string[]>();
  const childToParent = new Map<string, string>();

  for (const item of items) {
    if (!item.questionId) continue;
    const prevId = item.question?.previousQuestionId;
    if (!prevId) continue;

    childToParent.set(item.questionId, prevId);

    const children = parentToChildren.get(prevId);
    if (children) {
      children.push(item.questionId);
    } else {
      parentToChildren.set(prevId, [item.questionId]);
    }
  }

  return { parentToChildren, childToParent };
}

// ── Chain Resolver ──

const MAX_CHAIN_DEPTH = 50;

/**
 * Resolve the full conversation chain containing the given question.
 * Walks backwards to root, then returns ordered chain (oldest → newest).
 *
 * @param questionId - The question to resolve the chain for
 * @param items - All known QuestionOut items (local cache)
 * @param fetchQuestion - Optional API fallback for missing links
 * @returns Ordered chain from root to leaf, or single-item array if no chain
 */
export async function resolveChain(
  questionId: string,
  items: QuestionOut[],
  fetchQuestion?: FetchQuestionFn
): Promise<QuestionOut[]> {
  // Build lookup map from items
  const itemMap = new Map<string, QuestionOut>();
  for (const item of items) {
    itemMap.set(item.questionId, item);
  }

  // Find or fetch a question by ID
  async function findQuestion(id: string): Promise<QuestionOut | null> {
    const local = itemMap.get(id);
    if (local) return local;
    if (!fetchQuestion) return null;
    try {
      const fetched = await fetchQuestion(id);
      if (fetched) itemMap.set(fetched.questionId, fetched);
      return fetched;
    } catch {
      return null;
    }
  }

  // Start from the target question
  const target = await findQuestion(questionId);
  if (!target) return [];

  // Walk backwards to find the root (oldest ancestor)
  const visited = new Set<string>();
  const backwardsChain: QuestionOut[] = [target];
  visited.add(questionId);

  let current = target;
  let depth = 0;
  while (depth < MAX_CHAIN_DEPTH) {
    const prevId = current.question.previousQuestionId;
    if (!prevId || visited.has(prevId)) break;

    visited.add(prevId);
    const prev = await findQuestion(prevId);
    if (!prev) break; // Missing link — chain starts here

    backwardsChain.unshift(prev);
    current = prev;
    depth++;
  }

  // Now walk forward from the target to find any children
  // (questions that reference the target as their previousQuestionId)
  const index = buildChainIndex(items);
  const forwardChain: QuestionOut[] = [];

  function collectChildren(parentId: string, depthRemaining: number): void {
    if (depthRemaining <= 0) return;
    const childIds = index.parentToChildren.get(parentId);
    if (!childIds) return;

    for (const childId of childIds) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      const child = itemMap.get(childId);
      if (child) {
        forwardChain.push(child);
        collectChildren(childId, depthRemaining - 1);
      }
    }
  }

  collectChildren(questionId, MAX_CHAIN_DEPTH - depth);

  return [...backwardsChain, ...forwardChain];
}

/**
 * Check if a question is part of a chain (has previousQuestionId or has children).
 * Cheap check — no API calls.
 */
export function isPartOfChain(questionId: string, items: QuestionOut[]): boolean {
  const index = buildChainIndex(items);
  // Has a parent or has children
  return index.childToParent.has(questionId) || index.parentToChildren.has(questionId);
}

/**
 * Get the previousQuestionId from a QuestionOut, if any.
 */
export function getPreviousQuestionId(question: QuestionOut): string | null {
  return question.question.previousQuestionId ?? null;
}
