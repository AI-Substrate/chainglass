/**
 * Workflow Fixtures - Demo data for workflow UI mockups
 *
 * Factory functions produce valid WorkflowJSON/PhaseJSON structures
 * aligned with Plan 010 entity types.
 *
 * @see Plan 010: Entity Upgrade
 * @see Plan 011: UI Mockups
 */

// ============ Status Enums ============

/**
 * Run-level status (4 values)
 */
export type RunStatus = 'pending' | 'active' | 'complete' | 'failed';

/**
 * Phase-level status (7 values)
 * Used for status color mapping in StatusBadge and PhaseNode components.
 */
export type PhaseRunStatus =
  | 'pending'
  | 'ready'
  | 'active'
  | 'blocked'
  | 'accepted'
  | 'complete'
  | 'failed';

/**
 * Phase facilitator type
 */
export type Facilitator = 'agent' | 'orchestrator';

/**
 * Question types for human input
 */
export type QuestionType = 'single_choice' | 'multi_choice' | 'free_text' | 'confirm';

// ============ Phase Types ============

/**
 * Question requiring human input (for blocked phases)
 */
export interface PhaseQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  choices?: string[];
  required?: boolean;
  defaultValue?: string | string[] | boolean;
}

/**
 * Phase status history entry
 */
export interface PhaseStatusEntry {
  status: PhaseRunStatus;
  timestamp: string;
  reason?: string;
}

/**
 * Phase JSON structure - aligned with Plan 010
 */
export interface PhaseJSON {
  name: string;
  phaseDir: string;
  runDir: string;
  description: string;
  order: number;
  status: PhaseRunStatus;
  facilitator: Facilitator;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  // Computed booleans
  isPending: boolean;
  isReady: boolean;
  isActive: boolean;
  isBlocked: boolean;
  isAccepted: boolean;
  isComplete: boolean;
  isFailed: boolean;
  isDone: boolean;
  // Optional question for blocked phases
  question?: PhaseQuestion;
  // Status history
  statusHistory: PhaseStatusEntry[];
}

// ============ Run Metadata Types ============

/**
 * Run metadata structure
 */
export interface RunMetadataJSON {
  runId: string;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  currentPhase: string | null;
  triggeredBy: string;
}

// ============ Checkpoint Metadata Types ============

/**
 * Checkpoint metadata structure
 */
export interface CheckpointMetadataJSON {
  version: string;
  createdAt: string;
  commitHash: string;
  comment: string | null;
}

// ============ Workflow Types ============

/**
 * Workflow JSON structure - aligned with Plan 010
 */
export interface WorkflowJSON {
  slug: string;
  workflowDir: string;
  version: string;
  description: string | null;
  isCurrent: boolean;
  isCheckpoint: boolean;
  isRun: boolean;
  isTemplate: boolean;
  source: 'current' | 'checkpoint' | 'run';
  checkpoint: CheckpointMetadataJSON | null;
  run: RunMetadataJSON | null;
  phases: PhaseJSON[];
}

// ============ Factory Functions ============

/**
 * Compute status booleans from PhaseRunStatus
 */
function computeStatusBooleans(status: PhaseRunStatus) {
  return {
    isPending: status === 'pending',
    isReady: status === 'ready',
    isActive: status === 'active',
    isBlocked: status === 'blocked',
    isAccepted: status === 'accepted',
    isComplete: status === 'complete',
    isFailed: status === 'failed',
    isDone: status === 'complete' || status === 'failed',
  };
}

/**
 * Create a phase fixture
 */
export function createPhase(
  overrides: Partial<PhaseJSON> & { name: string; order: number }
): PhaseJSON {
  const status = overrides.status ?? 'pending';
  const now = new Date().toISOString();

  return {
    phaseDir: `/workflows/${overrides.name}`,
    runDir: `/runs/current/${overrides.name}`,
    description: `Phase ${overrides.order + 1}: ${overrides.name}`,
    facilitator: 'agent',
    startedAt: null,
    completedAt: null,
    duration: null,
    statusHistory: [{ status, timestamp: now }],
    ...overrides,
    status,
    ...computeStatusBooleans(status),
  };
}

/**
 * Create a run metadata fixture
 */
export function createRunMetadata(
  overrides: Partial<RunMetadataJSON> & { runId: string }
): RunMetadataJSON {
  return {
    status: 'pending',
    startedAt: new Date().toISOString(),
    completedAt: null,
    duration: null,
    currentPhase: null,
    triggeredBy: 'user',
    ...overrides,
  };
}

/**
 * Create a checkpoint metadata fixture
 */
export function createCheckpointMetadata(
  overrides: Partial<CheckpointMetadataJSON> & { version: string }
): CheckpointMetadataJSON {
  return {
    createdAt: new Date().toISOString(),
    commitHash: overrides.version.split('-')[1] ?? 'abc1234',
    comment: null,
    ...overrides,
  };
}

/**
 * Create a workflow fixture
 */
export function createWorkflow(overrides: Partial<WorkflowJSON> & { slug: string }): WorkflowJSON {
  return {
    workflowDir: `/workflows/${overrides.slug}`,
    version: '1.0.0',
    description: null,
    isCurrent: true,
    isCheckpoint: false,
    isRun: false,
    isTemplate: true,
    source: 'current',
    checkpoint: null,
    run: null,
    phases: [],
    ...overrides,
  };
}

// ============ Demo Fixtures ============

/**
 * Demo question fixtures for testing QuestionInput
 */
export const DEMO_QUESTIONS: Record<QuestionType, PhaseQuestion> = {
  single_choice: {
    id: 'q-deploy-env',
    type: 'single_choice',
    prompt: 'Which environment should we deploy to?',
    choices: ['staging', 'production', 'development'],
    required: true,
  },
  multi_choice: {
    id: 'q-notify-channels',
    type: 'multi_choice',
    prompt: 'Select notification channels:',
    choices: ['Slack', 'Email', 'PagerDuty', 'SMS'],
    required: false,
    defaultValue: ['Slack'],
  },
  free_text: {
    id: 'q-release-notes',
    type: 'free_text',
    prompt: 'Enter release notes for this deployment:',
    required: true,
  },
  confirm: {
    id: 'q-approve-deploy',
    type: 'confirm',
    prompt: 'Approve deployment to production?',
    required: true,
    defaultValue: false,
  },
};

/**
 * Demo workflow: CI/CD Pipeline
 */
export const DEMO_CICD_WORKFLOW = createWorkflow({
  slug: 'ci-cd-pipeline',
  description: 'Continuous integration and deployment pipeline',
  phases: [
    createPhase({
      name: 'checkout',
      order: 0,
      status: 'complete',
      description: 'Clone repository and checkout branch',
    }),
    createPhase({
      name: 'build',
      order: 1,
      status: 'complete',
      description: 'Compile and bundle application',
    }),
    createPhase({
      name: 'test',
      order: 2,
      status: 'active',
      description: 'Run unit and integration tests',
      facilitator: 'agent',
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
});

/**
 * Demo workflow with blocked phase
 */
export const DEMO_BLOCKED_WORKFLOW = createWorkflow({
  slug: 'deploy-to-prod',
  description: 'Production deployment workflow with approval gate',
  phases: [
    createPhase({
      name: 'prepare',
      order: 0,
      status: 'complete',
      description: 'Prepare deployment artifacts',
    }),
    createPhase({
      name: 'review',
      order: 1,
      status: 'blocked',
      description: 'Awaiting deployment approval',
      facilitator: 'orchestrator',
      question: DEMO_QUESTIONS.confirm,
    }),
    createPhase({
      name: 'deploy',
      order: 2,
      status: 'pending',
      description: 'Execute deployment',
    }),
  ],
});

/**
 * Demo workflow: Data Processing
 */
export const DEMO_DATA_WORKFLOW = createWorkflow({
  slug: 'data-processing',
  description: 'ETL pipeline for data transformation',
  phases: [
    createPhase({
      name: 'extract',
      order: 0,
      status: 'complete',
      description: 'Extract data from source systems',
    }),
    createPhase({
      name: 'transform',
      order: 1,
      status: 'complete',
      description: 'Transform and clean data',
    }),
    createPhase({
      name: 'validate',
      order: 2,
      status: 'complete',
      description: 'Validate data quality',
    }),
    createPhase({
      name: 'load',
      order: 3,
      status: 'complete',
      description: 'Load data to destination',
    }),
  ],
});

/**
 * Demo workflow: Failed workflow
 */
export const DEMO_FAILED_WORKFLOW = createWorkflow({
  slug: 'backup-restore',
  description: 'Database backup and restore workflow',
  phases: [
    createPhase({
      name: 'backup',
      order: 0,
      status: 'complete',
      description: 'Create database backup',
    }),
    createPhase({
      name: 'verify',
      order: 1,
      status: 'failed',
      description: 'Verify backup integrity',
    }),
    createPhase({
      name: 'restore',
      order: 2,
      status: 'pending',
      description: 'Restore to target database',
    }),
  ],
});

/**
 * All demo workflows for the workflows list page
 */
export const DEMO_WORKFLOWS: WorkflowJSON[] = [
  DEMO_CICD_WORKFLOW,
  DEMO_BLOCKED_WORKFLOW,
  DEMO_DATA_WORKFLOW,
  DEMO_FAILED_WORKFLOW,
];
