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
 * Phase-level status (7 values) - for RUN views only
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
 * Phase template status - for TEMPLATE views (no run state)
 */
export type PhaseTemplateStatus = 'defined';

/**
 * Combined status type
 */
export type PhaseStatus = PhaseRunStatus | PhaseTemplateStatus;

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
 * Input/Output definition for phase templates
 */
export interface PhaseIODefinition {
  name: string;
  description: string;
  required?: boolean;
  /** File type */
  type?: 'file' | 'directory' | 'json' | 'markdown' | 'message';
  /** Who creates/provides this artifact */
  from?: 'user' | 'agent' | 'workflow';
  /** For messages: what kind of input */
  messageType?: 'request' | 'question' | 'answer';
  /** Sample content for mockup display */
  content?: string;
}

/**
 * Phase command/prompt definition
 */
export interface PhaseCommandDefinition {
  /** Prompt filename, e.g. "main.md" */
  name: string;
  /** Short description of what this prompt does */
  description?: string;
  /** Path within phase directory, e.g. "commands/main.md" */
  path: string;
  /** Commands are part of the workflow template definition */
  from: 'workflow';
  /** Markdown content of the prompt */
  content?: string;
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
  status: PhaseStatus;
  facilitator: Facilitator;
  startedAt: string | null;
  completedAt: string | null;
  duration: number | null;
  // Computed booleans (only meaningful for run status)
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
  // Template definitions (for workflow view, not run view)
  inputs?: PhaseIODefinition[];
  outputs?: PhaseIODefinition[];
  /** Phase prompts/commands (for workflow template view) */
  commands?: PhaseCommandDefinition[];
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

// ============ Realistic Manual Test Workflow ============

/**
 * Question from agent asking about output format (from 003-wf-basics manual test)
 * This is a multi_choice question the agent asks during the process phase.
 */
export const PROCESS_FORMAT_QUESTION: PhaseQuestion = {
  id: 'm-001',
  type: 'multi_choice',
  prompt:
    'The gathered data contains both summary and detailed records. How should I structure the processed output?',
  choices: [
    'A: Summary only - Aggregate metrics, no individual records',
    'B: Detailed only - All records with full details',
    'C: Both - Summary section plus detailed appendix',
  ],
  required: true,
};

/**
 * Question from agent asking for user request clarification
 */
export const GATHER_CLARIFICATION_QUESTION: PhaseQuestion = {
  id: 'm-002',
  type: 'free_text',
  prompt:
    'I noticed your request mentions "workflow system" but could mean several things. Could you clarify which aspect you want me to focus on?\n\n• Phase execution lifecycle\n• Checkpoint versioning\n• Message/question flow\n• All of the above',
  required: true,
};

/**
 * Confirmation question before generating final report
 */
export const REPORT_CONFIRM_QUESTION: PhaseQuestion = {
  id: 'm-001',
  type: 'confirm',
  prompt:
    'I have processed all inputs and am ready to generate the final report. The report will include:\n\n• Executive summary\n• Test coverage results\n• Key observations\n• Recommendations\n\nProceed with report generation?',
  required: true,
  defaultValue: true,
};

/**
 * Demo workflow: Manual Test Workflow (gather → process → report)
 * Based on the actual manual test from phase-6-documentation-rollout
 *
 * This is the TEMPLATE view - shows phase definitions with inputs/outputs.
 * The runs (run-mt-001, etc.) have the actual execution status with questions.
 */
export const DEMO_MANUAL_TEST_WORKFLOW = createWorkflow({
  slug: 'manual-test-workflow',
  description: 'Workflow validation test: gather → process → report with agent questions',
  phases: [
    createPhase({
      name: 'gather',
      order: 0,
      status: 'defined',
      description: 'Gather initial user request and produce response demonstrating understanding',
      facilitator: 'agent',
      commands: [
        {
          name: 'main.md',
          description: 'Primary agent prompt for gathering user requirements',
          path: 'commands/main.md',
          from: 'workflow',
          content: `# Gather Phase - Manual Test Workflow

## Objective

Process the user's initial request and provide a helpful response demonstrating understanding.

## Directory Structure

\`\`\`
run/
├── messages/           # User ↔ Agent communication
│   └── m-001.json      # User's request
├── outputs/            # Your output files
│   └── response.md     # Your response
└── wf-data/            # Workflow metadata
    └── wf-phase.json   # Phase state tracking
\`\`\`

## Input

Read the user's request from \`inputs/request.md\`.

## Required Output

**\`outputs/response.md\`** - Your response demonstrating understanding

Write a clear summary showing you understand:
1. What the user is asking for
2. Key requirements or constraints
3. Any assumptions you're making

## Workflow

1. Read \`inputs/request.md\` to understand the request
2. Write your response to \`outputs/response.md\`
3. Run \`cg phase validate gather --run-dir .\` to verify outputs
4. Run \`cg phase finalize gather --run-dir .\` when complete`,
        },
      ],
      inputs: [
        {
          name: 'request.md',
          description: 'Initial user request describing what they need',
          required: true,
          type: 'markdown',
          from: 'user',
          content: `# User Request

Please analyze the test coverage for the Chainglass workflow system.

I need:
- Summary of which components have tests
- Coverage percentage estimates
- Recommendations for improving coverage

Focus on the CLI and workflow packages.`,
        },
      ],
      outputs: [
        {
          name: 'response.md',
          description: 'Agent response demonstrating understanding of the request',
          required: true,
          type: 'markdown',
          from: 'agent',
        },
      ],
    }),
    createPhase({
      name: 'process',
      order: 1,
      status: 'defined',
      description: 'Process gathered data - may ask clarifying questions about output format',
      facilitator: 'agent',
      commands: [
        {
          name: 'main.md',
          description: 'Processing instructions with format selection prompts',
          path: 'commands/main.md',
          from: 'workflow',
          content: `# Process Phase - Manual Test Workflow

## Objective

Process the gathered response and produce structured analysis data.

## Input

Read the agent's understanding from \`inputs/response.md\`.

## Clarification

If the output format is unclear, you MAY ask the user a clarifying question:

\`\`\`json
{
  "type": "multi_choice",
  "subject": "Output Format Preference",
  "body": "What format would you prefer for the analysis results?",
  "options": ["Detailed Report", "Executive Summary", "Both"]
}
\`\`\`

Write this to \`messages/m-001.json\` and wait for response.

## Required Outputs

1. **\`outputs/result.md\`** - Processing result summary
2. **\`outputs/process-data.json\`** - Structured metrics

## Workflow

1. Read \`inputs/response.md\`
2. (Optional) Ask clarifying question via messages
3. Produce outputs
4. Validate and finalize`,
        },
      ],
      inputs: [
        {
          name: 'response.md',
          description: 'Response from gather phase',
          required: true,
          type: 'markdown',
          from: 'agent',
        },
      ],
      outputs: [
        {
          name: 'result.md',
          description: 'Processing result summary',
          required: true,
          type: 'markdown',
          from: 'agent',
        },
        {
          name: 'process-data.json',
          description: 'Structured processing output with metrics',
          required: true,
          type: 'json',
          from: 'agent',
        },
      ],
    }),
    createPhase({
      name: 'report',
      order: 2,
      status: 'defined',
      description: 'Generate final report from processed data with test coverage summary',
      facilitator: 'agent',
      commands: [
        {
          name: 'main.md',
          description: 'Report generation template with coverage requirements',
          path: 'commands/main.md',
          from: 'workflow',
          content: `# Report Phase - Manual Test Workflow

## Objective

Generate a comprehensive final report from the processed data.

## Inputs

1. **\`inputs/result.md\`** - Processing summary
2. **\`inputs/process-data.json\`** - Structured metrics

## Required Output

**\`outputs/final-report.md\`** - Complete analysis report

The report MUST include:
- Executive summary
- Detailed findings from process-data.json
- Recommendations section
- Next steps

## Format Requirements

Use proper markdown formatting:
- Headers for sections
- Tables for metrics
- Code blocks for examples
- Bullet points for lists

## Workflow

1. Read both input files
2. Synthesize into comprehensive report
3. Write to \`outputs/final-report.md\`
4. Validate and finalize`,
        },
      ],
      inputs: [
        {
          name: 'result.md',
          description: 'Processing result from process phase',
          required: true,
          type: 'markdown',
          from: 'agent',
        },
        {
          name: 'process-data.json',
          description: 'Structured data from process phase',
          required: true,
          type: 'json',
          from: 'agent',
        },
      ],
      outputs: [
        {
          name: 'final-report.md',
          description: 'Final workflow report with coverage and recommendations',
          required: true,
          type: 'markdown',
          from: 'agent',
        },
      ],
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
  DEMO_MANUAL_TEST_WORKFLOW,
];
