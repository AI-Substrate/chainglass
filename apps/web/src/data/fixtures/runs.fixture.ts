/**
 * Run Fixtures - Demo data for workflow run UI mockups
 *
 * Factory functions for creating run fixtures with phases
 * aligned with Plan 010 entity types.
 *
 * @see Plan 010: Entity Upgrade
 * @see Plan 011: UI Mockups
 */

import {
  type CheckpointMetadataJSON,
  DEMO_QUESTIONS,
  GATHER_CLARIFICATION_QUESTION,
  PROCESS_FORMAT_QUESTION,
  type PhaseJSON,
  type PhaseRunStatus,
  REPORT_CONFIRM_QUESTION,
  type RunMetadataJSON,
  type RunStatus,
  type WorkflowJSON,
  createCheckpointMetadata,
  createPhase,
  createRunMetadata,
  createWorkflow,
} from './workflows.fixture';

// ============ Run Summary Types ============

/**
 * Run summary for list views (lightweight)
 */
export interface RunSummary {
  runId: string;
  workflowSlug: string;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  currentPhase: string | null;
  currentPhaseStatus: PhaseRunStatus | null;
  totalPhases: number;
  completedPhases: number;
  hasBlockedPhase: boolean;
  triggeredBy: string;
}

/**
 * Create a run summary from workflow and run metadata
 */
export function createRunSummary(workflow: WorkflowJSON, runMeta: RunMetadataJSON): RunSummary {
  const completedPhases = workflow.phases.filter(
    (p) => p.status === 'complete' || p.status === 'accepted'
  ).length;
  const blockedPhase = workflow.phases.find((p) => p.status === 'blocked');
  const activePhase = workflow.phases.find((p) => p.status === 'active');
  const currentPhase = blockedPhase ?? activePhase ?? null;

  return {
    runId: runMeta.runId,
    workflowSlug: workflow.slug,
    status: runMeta.status,
    startedAt: runMeta.startedAt,
    completedAt: runMeta.completedAt,
    duration: runMeta.duration,
    currentPhase: currentPhase?.name ?? null,
    currentPhaseStatus: currentPhase?.status ?? null,
    totalPhases: workflow.phases.length,
    completedPhases,
    hasBlockedPhase: !!blockedPhase,
    triggeredBy: runMeta.triggeredBy,
  };
}

// ============ Run Detail Type ============

/**
 * Full run detail with workflow and phases
 */
export interface RunDetail extends WorkflowJSON {
  runSummary: RunSummary;
}

/**
 * Create a full run detail
 */
export function createRunDetail(workflow: WorkflowJSON, runMeta: RunMetadataJSON): RunDetail {
  const runWorkflow: WorkflowJSON = {
    ...workflow,
    isRun: true,
    isTemplate: false,
    source: 'run',
    run: runMeta,
  };

  return {
    ...runWorkflow,
    runSummary: createRunSummary(runWorkflow, runMeta),
  };
}

// ============ Demo Run Fixtures ============

const NOW = new Date();
const HOUR_AGO = new Date(NOW.getTime() - 60 * 60 * 1000);
const TWO_HOURS_AGO = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
const YESTERDAY = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);

/**
 * Active run with test phase running
 */
export const DEMO_ACTIVE_RUN = createRunDetail(
  createWorkflow({
    slug: 'ci-cd-pipeline',
    description: 'Continuous integration and deployment pipeline',
    phases: [
      createPhase({
        name: 'checkout',
        order: 0,
        status: 'complete',
        description: 'Clone repository and checkout branch',
        startedAt: TWO_HOURS_AGO.toISOString(),
        completedAt: new Date(TWO_HOURS_AGO.getTime() + 30000).toISOString(),
        duration: 30,
      }),
      createPhase({
        name: 'build',
        order: 1,
        status: 'complete',
        description: 'Compile and bundle application',
        startedAt: new Date(TWO_HOURS_AGO.getTime() + 30000).toISOString(),
        completedAt: new Date(TWO_HOURS_AGO.getTime() + 120000).toISOString(),
        duration: 90,
      }),
      createPhase({
        name: 'test',
        order: 2,
        status: 'active',
        description: 'Run unit and integration tests',
        startedAt: new Date(TWO_HOURS_AGO.getTime() + 120000).toISOString(),
      }),
      createPhase({
        name: 'approval',
        order: 3,
        status: 'pending',
        description: 'Manual approval for production deployment',
        facilitator: 'orchestrator',
        question: DEMO_QUESTIONS.confirm,
      }),
      createPhase({
        name: 'deploy',
        order: 4,
        status: 'pending',
        description: 'Deploy to production environment',
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-001',
    status: 'active',
    startedAt: TWO_HOURS_AGO.toISOString(),
    currentPhase: 'test',
    triggeredBy: 'github-actions',
  })
);

/**
 * Blocked run awaiting approval
 */
export const DEMO_BLOCKED_RUN = createRunDetail(
  createWorkflow({
    slug: 'deploy-to-prod',
    description: 'Production deployment workflow with approval gate',
    phases: [
      createPhase({
        name: 'prepare',
        order: 0,
        status: 'complete',
        description: 'Prepare deployment artifacts',
        startedAt: HOUR_AGO.toISOString(),
        completedAt: new Date(HOUR_AGO.getTime() + 60000).toISOString(),
        duration: 60,
      }),
      createPhase({
        name: 'review',
        order: 1,
        status: 'blocked',
        description: 'Awaiting deployment approval',
        facilitator: 'orchestrator',
        startedAt: new Date(HOUR_AGO.getTime() + 60000).toISOString(),
        question: DEMO_QUESTIONS.confirm,
      }),
      createPhase({
        name: 'deploy',
        order: 2,
        status: 'pending',
        description: 'Execute deployment',
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-002',
    status: 'active',
    startedAt: HOUR_AGO.toISOString(),
    currentPhase: 'review',
    triggeredBy: 'user@example.com',
  })
);

/**
 * Run with single choice question (environment selection)
 */
export const DEMO_SINGLE_CHOICE_RUN = createRunDetail(
  createWorkflow({
    slug: 'deploy-to-prod',
    description: 'Production deployment workflow with environment selection',
    phases: [
      createPhase({
        name: 'build',
        order: 0,
        status: 'complete',
        description: 'Build application artifacts',
        startedAt: HOUR_AGO.toISOString(),
        completedAt: new Date(HOUR_AGO.getTime() + 120000).toISOString(),
        duration: 120,
      }),
      createPhase({
        name: 'select-env',
        order: 1,
        status: 'blocked',
        description: 'Select target deployment environment',
        facilitator: 'orchestrator',
        startedAt: new Date(HOUR_AGO.getTime() + 120000).toISOString(),
        question: DEMO_QUESTIONS.single_choice,
      }),
      createPhase({
        name: 'deploy',
        order: 2,
        status: 'pending',
        description: 'Execute deployment to selected environment',
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-005',
    status: 'active',
    startedAt: HOUR_AGO.toISOString(),
    currentPhase: 'select-env',
    triggeredBy: 'user@example.com',
  })
);

/**
 * Run with multi choice question (notification channels)
 */
export const DEMO_MULTI_CHOICE_RUN = createRunDetail(
  createWorkflow({
    slug: 'deploy-to-prod',
    description: 'Production deployment with notification setup',
    phases: [
      createPhase({
        name: 'deploy',
        order: 0,
        status: 'complete',
        description: 'Deploy application',
        startedAt: HOUR_AGO.toISOString(),
        completedAt: new Date(HOUR_AGO.getTime() + 180000).toISOString(),
        duration: 180,
      }),
      createPhase({
        name: 'notify-setup',
        order: 1,
        status: 'blocked',
        description: 'Configure notification channels for deployment status',
        facilitator: 'orchestrator',
        startedAt: new Date(HOUR_AGO.getTime() + 180000).toISOString(),
        question: DEMO_QUESTIONS.multi_choice,
      }),
      createPhase({
        name: 'notify',
        order: 2,
        status: 'pending',
        description: 'Send deployment notifications',
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-006',
    status: 'active',
    startedAt: HOUR_AGO.toISOString(),
    currentPhase: 'notify-setup',
    triggeredBy: 'scheduled',
  })
);

/**
 * Run with free text question (release notes)
 */
export const DEMO_FREE_TEXT_RUN = createRunDetail(
  createWorkflow({
    slug: 'deploy-to-prod',
    description: 'Production deployment with release notes',
    phases: [
      createPhase({
        name: 'test',
        order: 0,
        status: 'complete',
        description: 'Run all tests',
        startedAt: HOUR_AGO.toISOString(),
        completedAt: new Date(HOUR_AGO.getTime() + 300000).toISOString(),
        duration: 300,
      }),
      createPhase({
        name: 'release-notes',
        order: 1,
        status: 'blocked',
        description: 'Enter release notes for this deployment',
        facilitator: 'orchestrator',
        startedAt: new Date(HOUR_AGO.getTime() + 300000).toISOString(),
        question: DEMO_QUESTIONS.free_text,
      }),
      createPhase({
        name: 'publish',
        order: 2,
        status: 'pending',
        description: 'Publish release with notes',
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-007',
    status: 'active',
    startedAt: HOUR_AGO.toISOString(),
    currentPhase: 'release-notes',
    triggeredBy: 'github-actions',
  })
);

/**
 * Completed successful run
 */
export const DEMO_COMPLETE_RUN = createRunDetail(
  createWorkflow({
    slug: 'data-processing',
    description: 'ETL pipeline for data transformation',
    phases: [
      createPhase({
        name: 'extract',
        order: 0,
        status: 'complete',
        description: 'Extract data from source systems',
        startedAt: YESTERDAY.toISOString(),
        completedAt: new Date(YESTERDAY.getTime() + 300000).toISOString(),
        duration: 300,
      }),
      createPhase({
        name: 'transform',
        order: 1,
        status: 'complete',
        description: 'Transform and clean data',
        startedAt: new Date(YESTERDAY.getTime() + 300000).toISOString(),
        completedAt: new Date(YESTERDAY.getTime() + 600000).toISOString(),
        duration: 300,
      }),
      createPhase({
        name: 'validate',
        order: 2,
        status: 'complete',
        description: 'Validate data quality',
        startedAt: new Date(YESTERDAY.getTime() + 600000).toISOString(),
        completedAt: new Date(YESTERDAY.getTime() + 660000).toISOString(),
        duration: 60,
      }),
      createPhase({
        name: 'load',
        order: 3,
        status: 'complete',
        description: 'Load data to destination',
        startedAt: new Date(YESTERDAY.getTime() + 660000).toISOString(),
        completedAt: new Date(YESTERDAY.getTime() + 720000).toISOString(),
        duration: 60,
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-003',
    status: 'complete',
    startedAt: YESTERDAY.toISOString(),
    completedAt: new Date(YESTERDAY.getTime() + 720000).toISOString(),
    duration: 720,
    currentPhase: null,
    triggeredBy: 'scheduled',
  })
);

/**
 * Failed run
 */
export const DEMO_FAILED_RUN = createRunDetail(
  createWorkflow({
    slug: 'backup-restore',
    description: 'Database backup and restore workflow',
    phases: [
      createPhase({
        name: 'backup',
        order: 0,
        status: 'complete',
        description: 'Create database backup',
        startedAt: YESTERDAY.toISOString(),
        completedAt: new Date(YESTERDAY.getTime() + 180000).toISOString(),
        duration: 180,
      }),
      createPhase({
        name: 'verify',
        order: 1,
        status: 'failed',
        description: 'Verify backup integrity - checksum mismatch detected',
        startedAt: new Date(YESTERDAY.getTime() + 180000).toISOString(),
        completedAt: new Date(YESTERDAY.getTime() + 200000).toISOString(),
        duration: 20,
      }),
      createPhase({
        name: 'restore',
        order: 2,
        status: 'pending',
        description: 'Restore to target database',
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-004',
    status: 'failed',
    startedAt: YESTERDAY.toISOString(),
    completedAt: new Date(YESTERDAY.getTime() + 200000).toISOString(),
    duration: 200,
    currentPhase: 'verify',
    triggeredBy: 'manual',
  })
);

// ============ Manual Test Workflow Runs ============

/**
 * Manual test run: Process phase blocked with multi-choice question
 * Based on the actual manual test from phase-6-documentation-rollout
 */
export const DEMO_MANUAL_TEST_PROCESS_RUN = createRunDetail(
  createWorkflow({
    slug: 'manual-test-workflow',
    description: 'Workflow validation test: gather → process → report',
    phases: [
      createPhase({
        name: 'gather',
        order: 0,
        status: 'complete',
        description: 'Gather initial user request and produce response demonstrating understanding',
        facilitator: 'agent',
        startedAt: new Date(NOW.getTime() - 3600000).toISOString(),
        completedAt: new Date(NOW.getTime() - 3300000).toISOString(),
        duration: 300,
      }),
      createPhase({
        name: 'process',
        order: 1,
        status: 'blocked',
        description: 'Process gathered data - awaiting orchestrator input on output format',
        facilitator: 'agent',
        startedAt: new Date(NOW.getTime() - 3300000).toISOString(),
        question: PROCESS_FORMAT_QUESTION,
      }),
      createPhase({
        name: 'report',
        order: 2,
        status: 'pending',
        description: 'Generate final report from processed data with test coverage summary',
        facilitator: 'agent',
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-mt-001',
    status: 'active',
    startedAt: new Date(NOW.getTime() - 3600000).toISOString(),
    currentPhase: 'process',
    triggeredBy: 'orchestrator',
  })
);

/**
 * Manual test run: Gather phase blocked with free text clarification question
 */
export const DEMO_MANUAL_TEST_GATHER_RUN = createRunDetail(
  createWorkflow({
    slug: 'manual-test-workflow',
    description: 'Workflow validation test: gather → process → report',
    phases: [
      createPhase({
        name: 'gather',
        order: 0,
        status: 'blocked',
        description: 'Gather initial request - agent needs clarification on scope',
        facilitator: 'agent',
        startedAt: new Date(NOW.getTime() - 600000).toISOString(),
        question: GATHER_CLARIFICATION_QUESTION,
      }),
      createPhase({
        name: 'process',
        order: 1,
        status: 'pending',
        description: 'Process gathered data with format selection',
        facilitator: 'agent',
      }),
      createPhase({
        name: 'report',
        order: 2,
        status: 'pending',
        description: 'Generate final report from processed data',
        facilitator: 'agent',
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-mt-002',
    status: 'active',
    startedAt: new Date(NOW.getTime() - 600000).toISOString(),
    currentPhase: 'gather',
    triggeredBy: 'manual',
  })
);

/**
 * Manual test run: Report phase blocked with confirmation question
 */
export const DEMO_MANUAL_TEST_REPORT_RUN = createRunDetail(
  createWorkflow({
    slug: 'manual-test-workflow',
    description: 'Workflow validation test: gather → process → report',
    phases: [
      createPhase({
        name: 'gather',
        order: 0,
        status: 'complete',
        description: 'Gather initial user request and produce response',
        facilitator: 'agent',
        startedAt: new Date(NOW.getTime() - 7200000).toISOString(),
        completedAt: new Date(NOW.getTime() - 6900000).toISOString(),
        duration: 300,
      }),
      createPhase({
        name: 'process',
        order: 1,
        status: 'complete',
        description: 'Process gathered data - selected "Both" format per orchestrator',
        facilitator: 'agent',
        startedAt: new Date(NOW.getTime() - 6900000).toISOString(),
        completedAt: new Date(NOW.getTime() - 6000000).toISOString(),
        duration: 900,
      }),
      createPhase({
        name: 'report',
        order: 2,
        status: 'blocked',
        description: 'Ready to generate final report - awaiting confirmation',
        facilitator: 'agent',
        startedAt: new Date(NOW.getTime() - 6000000).toISOString(),
        question: REPORT_CONFIRM_QUESTION,
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-mt-003',
    status: 'active',
    startedAt: new Date(NOW.getTime() - 7200000).toISOString(),
    currentPhase: 'report',
    triggeredBy: 'scheduled',
  })
);

/**
 * Manual test run: Completed successfully
 */
export const DEMO_MANUAL_TEST_COMPLETE_RUN = createRunDetail(
  createWorkflow({
    slug: 'manual-test-workflow',
    description: 'Workflow validation test: gather → process → report',
    phases: [
      createPhase({
        name: 'gather',
        order: 0,
        status: 'complete',
        description: 'Gather initial user request and produce response',
        facilitator: 'agent',
        startedAt: new Date(YESTERDAY.getTime()).toISOString(),
        completedAt: new Date(YESTERDAY.getTime() + 300000).toISOString(),
        duration: 300,
      }),
      createPhase({
        name: 'process',
        order: 1,
        status: 'complete',
        description: 'Processed data with "Both" format (summary + detailed)',
        facilitator: 'agent',
        startedAt: new Date(YESTERDAY.getTime() + 300000).toISOString(),
        completedAt: new Date(YESTERDAY.getTime() + 1200000).toISOString(),
        duration: 900,
      }),
      createPhase({
        name: 'report',
        order: 2,
        status: 'complete',
        description: 'Final report generated with test coverage and recommendations',
        facilitator: 'agent',
        startedAt: new Date(YESTERDAY.getTime() + 1200000).toISOString(),
        completedAt: new Date(YESTERDAY.getTime() + 1500000).toISOString(),
        duration: 300,
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-mt-004',
    status: 'complete',
    startedAt: new Date(YESTERDAY.getTime()).toISOString(),
    completedAt: new Date(YESTERDAY.getTime() + 1500000).toISOString(),
    duration: 1500,
    currentPhase: null,
    triggeredBy: 'github-actions',
  })
);

/**
 * All demo runs for the runs list
 */
export const DEMO_RUNS: RunDetail[] = [
  DEMO_BLOCKED_RUN, // run-002: confirm question
  DEMO_SINGLE_CHOICE_RUN, // run-005: single choice question
  DEMO_MULTI_CHOICE_RUN, // run-006: multi choice question
  DEMO_FREE_TEXT_RUN, // run-007: free text question
  DEMO_ACTIVE_RUN, // run-001: active, no question yet
  DEMO_COMPLETE_RUN, // run-003: complete
  DEMO_FAILED_RUN, // run-004: failed
  // Manual test workflow runs
  DEMO_MANUAL_TEST_PROCESS_RUN, // run-mt-001: process blocked with multi-choice
  DEMO_MANUAL_TEST_GATHER_RUN, // run-mt-002: gather blocked with free text
  DEMO_MANUAL_TEST_REPORT_RUN, // run-mt-003: report blocked with confirm
  DEMO_MANUAL_TEST_COMPLETE_RUN, // run-mt-004: all phases complete
];

/**
 * Run summaries for list views
 */
export const DEMO_RUN_SUMMARIES: RunSummary[] = DEMO_RUNS.map((r) => r.runSummary);

// ============ Checkpoint Fixtures ============

/**
 * Demo checkpoints for a workflow
 */
export const DEMO_CHECKPOINTS: CheckpointMetadataJSON[] = [
  createCheckpointMetadata({
    version: 'v003-def5678',
    createdAt: new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    comment: 'Added notification phase',
  }),
  createCheckpointMetadata({
    version: 'v002-abc1234',
    createdAt: new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    comment: 'Fixed approval timeout',
  }),
  createCheckpointMetadata({
    version: 'v001-9876543',
    createdAt: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    comment: 'Initial version',
  }),
];

// ============ Lookup Helpers ============

/**
 * Get runs for a specific workflow
 */
export function getRunsForWorkflow(workflowSlug: string): RunDetail[] {
  return DEMO_RUNS.filter((r) => r.slug === workflowSlug);
}

/**
 * Get a specific run by ID
 */
export function getRunById(runId: string): RunDetail | undefined {
  return DEMO_RUNS.find((r) => r.run?.runId === runId);
}

/**
 * Get run summaries for a specific workflow
 */
export function getRunSummariesForWorkflow(workflowSlug: string): RunSummary[] {
  return DEMO_RUN_SUMMARIES.filter((r) => r.workflowSlug === workflowSlug);
}
