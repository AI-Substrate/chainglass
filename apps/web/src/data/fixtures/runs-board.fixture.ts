/**
 * Run Board Fixtures - Transform runs into Kanban board format
 *
 * Columns represent run states:
 * - Active: Currently running (agent working)
 * - Blocked: Waiting for user input
 * - Complete: Successfully finished
 * - Failed: Errored out
 *
 * Cards show run details with phase info.
 */

import type { BoardState, Card } from './board.fixture';
import { DEMO_RUNS, type RunDetail, type RunSummary } from './runs.fixture';
import type { PhaseQuestion } from './workflows.fixture';

/**
 * Extended card type for workflow runs
 */
export interface RunCard extends Card {
  runId: string;
  workflowSlug: string;
  currentPhase: string | null;
  currentPhaseStatus: string | null;
  hasBlockedPhase: boolean;
  completedPhases: number;
  totalPhases: number;
  triggeredBy: string;
  startedAt: string;
  /** Question from blocked phase (if any) */
  question?: PhaseQuestion;
}

/**
 * Transform a RunDetail into a Kanban card (includes question data)
 */
function runDetailToCard(run: RunDetail): RunCard {
  const summary = run.runSummary;
  const phaseProgress = `${summary.completedPhases}/${summary.totalPhases}`;
  const phaseLabel = summary.currentPhase ? `Phase: ${summary.currentPhase}` : 'Completed';

  // Determine priority based on status
  let priority: 'low' | 'medium' | 'high' = 'medium';
  if (summary.hasBlockedPhase) {
    priority = 'high'; // Needs user attention
  } else if (summary.status === 'failed') {
    priority = 'high';
  } else if (summary.status === 'complete') {
    priority = 'low';
  }

  // Build labels
  const labels: string[] = [phaseProgress];
  if (summary.hasBlockedPhase) {
    labels.push('⚠️ Needs Input');
  }
  if (summary.triggeredBy) {
    labels.push(summary.triggeredBy);
  }

  // Find question from blocked phase
  const blockedPhase = run.phases.find((p) => p.status === 'blocked');
  const question = blockedPhase?.question;

  return {
    id: summary.runId,
    runId: summary.runId,
    workflowSlug: summary.workflowSlug,
    title: summary.runId,
    description: phaseLabel,
    priority,
    labels,
    currentPhase: summary.currentPhase,
    currentPhaseStatus: summary.currentPhaseStatus,
    hasBlockedPhase: summary.hasBlockedPhase,
    completedPhases: summary.completedPhases,
    totalPhases: summary.totalPhases,
    triggeredBy: summary.triggeredBy,
    startedAt: summary.startedAt,
    question,
  };
}

/**
 * Transform a RunSummary into a Kanban card (no question data)
 */
function runSummaryToCard(run: RunSummary): RunCard {
  const phaseProgress = `${run.completedPhases}/${run.totalPhases}`;
  const phaseLabel = run.currentPhase ? `Phase: ${run.currentPhase}` : 'Completed';

  // Determine priority based on status
  let priority: 'low' | 'medium' | 'high' = 'medium';
  if (run.hasBlockedPhase) {
    priority = 'high'; // Needs user attention
  } else if (run.status === 'failed') {
    priority = 'high';
  } else if (run.status === 'complete') {
    priority = 'low';
  }

  // Build labels
  const labels: string[] = [phaseProgress];
  if (run.hasBlockedPhase) {
    labels.push('⚠️ Needs Input');
  }
  if (run.triggeredBy) {
    labels.push(run.triggeredBy);
  }

  return {
    id: run.runId,
    runId: run.runId,
    workflowSlug: run.workflowSlug,
    title: run.runId,
    description: phaseLabel,
    priority,
    labels,
    currentPhase: run.currentPhase,
    currentPhaseStatus: run.currentPhaseStatus,
    hasBlockedPhase: run.hasBlockedPhase,
    completedPhases: run.completedPhases,
    totalPhases: run.totalPhases,
    triggeredBy: run.triggeredBy,
    startedAt: run.startedAt,
  };
}

/**
 * Create a board from run details (includes question data)
 */
export function createRunsBoardFromDetails(runs: RunDetail[]): BoardState {
  // Categorize runs into columns
  const activeRuns: RunCard[] = [];
  const blockedRuns: RunCard[] = [];
  const completeRuns: RunCard[] = [];
  const failedRuns: RunCard[] = [];

  for (const run of runs) {
    const card = runDetailToCard(run);
    const summary = run.runSummary;

    // Blocked takes priority over active
    if (summary.hasBlockedPhase) {
      blockedRuns.push(card);
    } else if (summary.status === 'active') {
      activeRuns.push(card);
    } else if (summary.status === 'complete') {
      completeRuns.push(card);
    } else if (summary.status === 'failed') {
      failedRuns.push(card);
    }
  }

  // Sort by startedAt (newest first)
  const sortByStart = (a: RunCard, b: RunCard) =>
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();

  activeRuns.sort(sortByStart);
  blockedRuns.sort(sortByStart);
  completeRuns.sort(sortByStart);
  failedRuns.sort(sortByStart);

  return {
    columns: [
      {
        id: 'active',
        title: '🔄 Active',
        cards: activeRuns,
      },
      {
        id: 'blocked',
        title: '⏸️ Needs Input',
        cards: blockedRuns,
      },
      {
        id: 'complete',
        title: '✅ Complete',
        cards: completeRuns,
      },
      {
        id: 'failed',
        title: '❌ Failed',
        cards: failedRuns,
      },
    ],
  };
}

/**
 * Create a board from run summaries (no question data)
 */
export function createRunsBoard(runs: RunSummary[]): BoardState {
  // Categorize runs into columns
  const activeRuns: RunCard[] = [];
  const blockedRuns: RunCard[] = [];
  const completeRuns: RunCard[] = [];
  const failedRuns: RunCard[] = [];

  for (const run of runs) {
    const card = runSummaryToCard(run);

    // Blocked takes priority over active
    if (run.hasBlockedPhase) {
      blockedRuns.push(card);
    } else if (run.status === 'active') {
      activeRuns.push(card);
    } else if (run.status === 'complete') {
      completeRuns.push(card);
    } else if (run.status === 'failed') {
      failedRuns.push(card);
    }
  }

  // Sort by startedAt (newest first)
  const sortByStart = (a: RunCard, b: RunCard) =>
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();

  activeRuns.sort(sortByStart);
  blockedRuns.sort(sortByStart);
  completeRuns.sort(sortByStart);
  failedRuns.sort(sortByStart);

  return {
    columns: [
      {
        id: 'active',
        title: '🔄 Active',
        cards: activeRuns,
      },
      {
        id: 'blocked',
        title: '⏸️ Needs Input',
        cards: blockedRuns,
      },
      {
        id: 'complete',
        title: '✅ Complete',
        cards: completeRuns,
      },
      {
        id: 'failed',
        title: '❌ Failed',
        cards: failedRuns,
      },
    ],
  };
}

/**
 * Demo board created from DEMO_RUNS (with question data)
 */
export const DEMO_RUNS_BOARD: BoardState = createRunsBoardFromDetails(DEMO_RUNS);

/**
 * Get runs board for a specific workflow
 */
export function getRunsBoardForWorkflow(
  workflowSlug: string,
  runs: RunDetail[] = DEMO_RUNS
): BoardState {
  const filteredRuns = runs.filter((r) => r.slug === workflowSlug);
  return createRunsBoardFromDetails(filteredRuns);
}
