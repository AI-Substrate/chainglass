'use server';

/**
 * PR View Server Actions
 *
 * Server actions callable from client components for PR View data.
 * Delegates to pr-view service layer.
 *
 * Plan 071: PR View & File Notes — Phase 4
 */

import { requireAuth } from '@/features/063-login/lib/require-auth';
import type {
  ComparisonMode,
  PRViewData,
  PRViewResult,
} from '../../src/features/071-pr-view/types';

export async function fetchPRViewData(
  worktreePath: string,
  mode: ComparisonMode
): Promise<PRViewResult<PRViewData>> {
  await requireAuth();
  try {
    const { aggregatePRViewData } = await import(
      '../../src/features/071-pr-view/lib/diff-aggregator'
    );
    const data = await aggregatePRViewData(worktreePath, mode);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: `Failed to fetch PR View data: ${error}` };
  }
}

export async function markFileAsReviewed(
  worktreePath: string,
  filePath: string
): Promise<PRViewResult> {
  await requireAuth();
  try {
    const { computeContentHash } = await import('../../src/features/071-pr-view/lib/content-hash');
    const { markFileReviewed } = await import('../../src/features/071-pr-view/lib/pr-view-state');
    const hash = await computeContentHash(worktreePath, filePath);
    markFileReviewed(worktreePath, filePath, hash);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: `Failed to mark file as reviewed: ${error}` };
  }
}

export async function unmarkFileAsReviewed(
  worktreePath: string,
  filePath: string
): Promise<PRViewResult> {
  await requireAuth();
  try {
    const { unmarkFileReviewed } = await import('../../src/features/071-pr-view/lib/pr-view-state');
    unmarkFileReviewed(worktreePath, filePath);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: `Failed to unmark file: ${error}` };
  }
}

export async function clearAllReviewedState(worktreePath: string): Promise<PRViewResult> {
  await requireAuth();
  try {
    const { clearReviewedState } = await import('../../src/features/071-pr-view/lib/pr-view-state');
    clearReviewedState(worktreePath);
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: `Failed to clear reviewed state: ${error}` };
  }
}
