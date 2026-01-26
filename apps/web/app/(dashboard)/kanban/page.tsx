import { Activity, ArrowRight, Layers } from 'lucide-react';
import Link from 'next/link';

import { RunsKanbanContent } from '@/components/kanban';
import { Button } from '@/components/ui/button';
import { DEMO_RUNS_BOARD } from '@/data/fixtures';

/**
 * KanbanPage - Workflow Runs Kanban Board
 *
 * World-class kanban interface for monitoring workflow runs.
 * Professional design with clear visual hierarchy and status indication.
 */
export default function KanbanPage() {
  // Calculate stats from board
  const stats = {
    active: DEMO_RUNS_BOARD.columns.find((c) => c.id === 'active')?.cards.length ?? 0,
    blocked: DEMO_RUNS_BOARD.columns.find((c) => c.id === 'blocked')?.cards.length ?? 0,
    complete: DEMO_RUNS_BOARD.columns.find((c) => c.id === 'complete')?.cards.length ?? 0,
    failed: DEMO_RUNS_BOARD.columns.find((c) => c.id === 'failed')?.cards.length ?? 0,
  };
  const total = stats.active + stats.blocked + stats.complete + stats.failed;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/25">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Workflow Runs</h1>
              <p className="text-sm text-muted-foreground">
                Monitor and manage your active workflow executions
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href="/workflows">
              <Layers className="h-4 w-4" />
              View Workflows
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="group relative overflow-hidden rounded-xl border bg-gradient-to-br from-blue-500/10 via-background to-background p-4 transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">
                Active
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.active}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10">
              <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-xl border bg-gradient-to-br from-amber-500/10 via-background to-background p-4 transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Needs Input
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.blocked}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10">
              <div className="h-2 w-2 rounded-full bg-amber-500" />
            </div>
          </div>
          {stats.blocked > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-amber-500 to-orange-500" />
          )}
        </div>

        <div className="group relative overflow-hidden rounded-xl border bg-gradient-to-br from-emerald-500/10 via-background to-background p-4 transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Complete
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.complete}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-xl border bg-gradient-to-br from-red-500/10 via-background to-background p-4 transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-red-600 dark:text-red-400">
                Failed
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{stats.failed}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10">
              <div className="h-2 w-2 rounded-full bg-red-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <RunsKanbanContent board={DEMO_RUNS_BOARD} />
    </div>
  );
}
