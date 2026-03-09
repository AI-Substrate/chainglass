/**
 * Worktree Landing Page - /workspaces/[slug]/worktree
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 3)
 * Subtask 001: Worktree Landing Page & Agents Page Restructure
 *
 * Server component showing worktree info with feature cards.
 * Uses ?worktree= query param for context selection.
 *
 * Per Discovery 04: Uses `export const dynamic = 'force-dynamic'` for DI container access.
 * Per Discovery 11: Async params pattern (await params, await searchParams).
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    worktree?: string;
  }>;
}

export default async function WorktreeLandingPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { worktree: worktreePath } = await searchParams;

  // Always redirect to browser — worktree landing page is deprecated
  if (worktreePath) {
    redirect(`/workspaces/${slug}/browser?worktree=${encodeURIComponent(worktreePath)}`);
  }
  redirect(`/workspaces/${slug}`);
}
