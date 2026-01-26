/**
 * Run Fixtures - Demo data for workflow run UI mockups
 *
 * All runs are for the manual-test-workflow (gather → process → report).
 * Demonstrates different question types and run states.
 *
 * @see Plan 010: Entity Upgrade
 * @see Plan 011: UI Mockups
 */

import {
  type CheckpointMetadataJSON,
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
    // Safe cast: blockedPhase/activePhase lookups filter by run statuses, never 'defined'
    currentPhaseStatus: (currentPhase?.status as PhaseRunStatus) ?? null,
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

// ============ Time Constants ============

const NOW = new Date();
const THIRTY_MIN_AGO = new Date(NOW.getTime() - 30 * 60 * 1000);
const HOUR_AGO = new Date(NOW.getTime() - 60 * 60 * 1000);
const TWO_HOURS_AGO = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
const YESTERDAY = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
const TWO_DAYS_AGO = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);

// ============ Content Templates ============

/**
 * Sample content for agent-generated artifacts in runs.
 * These represent what the agent actually produced during execution.
 */

const AGENT_GATHER_RESPONSE = `# Understanding of Request

I understand you're asking for an analysis of test coverage for the Chainglass workflow system.

## Key Requirements
1. Summary of which components have tests
2. Coverage percentage estimates  
3. Recommendations for improving coverage

## Scope
Focus areas:
- CLI package (\`apps/cli/\`)
- Workflow package (\`packages/workflow/\`)

## Assumptions
- Coverage estimates based on file inspection (no actual coverage tool run)
- Focus on unit tests, not integration tests
- Using current main branch state

I will proceed with analyzing the test files and producing a comprehensive response.`;

const AGENT_PROCESS_RESULT = `# Processing Results Summary

## Analysis Complete

Based on my review of the codebase, I've identified the following test coverage patterns:

### CLI Package
- **Commands**: 85% coverage (init, workflow, phase commands)
- **Adapters**: 70% coverage (output adapters well tested)
- **Services**: 60% coverage (some services lack edge case tests)

### Workflow Package  
- **Services**: 90% coverage (PhaseService, RunService comprehensive)
- **Schemas**: 100% coverage (Zod schemas validated)
- **Utilities**: 75% coverage (file operations tested)

## Format Selected
User chose: **Both** (Detailed Report + Executive Summary)

Proceeding to generate final report with both formats.`;

const AGENT_PROCESS_DATA = `{
  "analyzedAt": "2026-01-26T06:30:00Z",
  "packages": {
    "cli": {
      "totalFiles": 24,
      "testedFiles": 18,
      "coverage": 75,
      "categories": {
        "commands": { "total": 8, "tested": 7, "coverage": 87 },
        "adapters": { "total": 6, "tested": 4, "coverage": 67 },
        "services": { "total": 10, "tested": 7, "coverage": 70 }
      }
    },
    "workflow": {
      "totalFiles": 32,
      "testedFiles": 28,
      "coverage": 87,
      "categories": {
        "services": { "total": 12, "tested": 11, "coverage": 92 },
        "schemas": { "total": 8, "tested": 8, "coverage": 100 },
        "utilities": { "total": 12, "tested": 9, "coverage": 75 }
      }
    }
  },
  "recommendations": [
    "Add edge case tests for CLI service layer",
    "Improve adapter error handling coverage",
    "Add integration tests for workflow composition"
  ]
}`;

const AGENT_FINAL_REPORT = `# Test Coverage Analysis Report

## Executive Summary

The Chainglass workflow system demonstrates **solid test coverage** overall, with an estimated **81% average** across the CLI and workflow packages. The workflow package shows particularly strong coverage at 87%, while the CLI package is at 75%.

### Key Findings
- ✅ Schema validation is 100% covered
- ✅ Core services have comprehensive tests
- ⚠️ CLI adapters need additional coverage
- ⚠️ Edge cases in service layer need attention

---

## Detailed Analysis

### CLI Package (75% coverage)

| Category | Files | Tested | Coverage |
|----------|-------|--------|----------|
| Commands | 8 | 7 | 87% |
| Adapters | 6 | 4 | 67% |
| Services | 10 | 7 | 70% |

**Strengths:**
- Command handlers well tested
- Output formatting thoroughly verified

**Gaps:**
- \`init.command.ts\` missing error path tests
- Adapter edge cases (malformed input) not covered

### Workflow Package (87% coverage)

| Category | Files | Tested | Coverage |
|----------|-------|--------|----------|
| Services | 12 | 11 | 92% |
| Schemas | 8 | 8 | 100% |
| Utilities | 12 | 9 | 75% |

**Strengths:**
- PhaseService has excellent coverage
- All Zod schemas validated
- RunService handles all state transitions

**Gaps:**
- File operation utilities need more tests
- Message serialization edge cases

---

## Recommendations

### High Priority
1. **Add CLI adapter error tests** - Cover malformed JSON, network failures
2. **Test init command failures** - Directory permission errors, existing files

### Medium Priority  
3. **Workflow utility coverage** - File read/write error handling
4. **Integration tests** - End-to-end workflow composition

### Low Priority
5. **Performance tests** - Large workflow handling
6. **Concurrency tests** - Parallel phase execution

---

## Next Steps

1. Create test plan document with specific test cases
2. Prioritize high-impact gaps (adapters, init command)
3. Set up coverage reporting in CI pipeline
4. Target 90% coverage within 2 sprints

---

*Report generated by Chainglass Agent*
*Analysis date: 2026-01-26*`;

/**
 * Input content provided by user when starting the run
 */
const USER_REQUEST_CONTENT = `# User Request

Please analyze the test coverage for the Chainglass workflow system.

I need:
- Summary of which components have tests
- Coverage percentage estimates
- Recommendations for improving coverage

Focus on the CLI and workflow packages.`;

/**
 * Command prompts from workflow template
 */
const GATHER_MAIN_MD = `# Gather Phase - Manual Test Workflow

## Objective

Process the user's initial request and provide a helpful response demonstrating understanding.

## Input

Read the user's request from \`inputs/request.md\`.

## Required Output

**\`outputs/response.md\`** - Your response demonstrating understanding

Write a clear summary showing you understand:
1. What the user is asking for
2. Key requirements or constraints
3. Any assumptions you're making`;

const PROCESS_MAIN_MD = `# Process Phase - Manual Test Workflow

## Objective

Process the gathered response and produce structured analysis data.

## Input

Read the agent's understanding from \`inputs/response.md\`.

## Clarification

If the output format is unclear, you MAY ask the user a clarifying question.

## Required Outputs

1. **\`outputs/result.md\`** - Processing result summary
2. **\`outputs/process-data.json\`** - Structured metrics`;

const REPORT_MAIN_MD = `# Report Phase - Manual Test Workflow

## Objective

Generate a comprehensive final report from the processed data.

## Inputs

1. **\`inputs/result.md\`** - Processing summary
2. **\`inputs/process-data.json\`** - Structured metrics

## Required Output

**\`outputs/final-report.md\`** - Complete analysis report`;

// ============ Manual Test Workflow Runs ============

/**
 * Run 1: Gather phase blocked with FREE_TEXT question (clarification)
 * Agent needs more info about scope
 */
export const DEMO_RUN_GATHER_BLOCKED = createRunDetail(
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
        startedAt: THIRTY_MIN_AGO.toISOString(),
        question: GATHER_CLARIFICATION_QUESTION,
        commands: [
          {
            name: 'main.md',
            description: 'Primary agent prompt for gathering',
            path: 'commands/main.md',
            from: 'workflow',
            content: GATHER_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'request.md',
            description: 'Initial user request',
            required: true,
            type: 'markdown',
            from: 'user',
            content: USER_REQUEST_CONTENT,
          },
        ],
        outputs: [
          {
            name: 'response.md',
            description: 'Agent response demonstrating understanding',
            required: true,
            type: 'markdown',
            from: 'agent',
            // No content yet - phase is blocked
          },
        ],
      }),
      createPhase({
        name: 'process',
        order: 1,
        status: 'pending',
        description: 'Process gathered data with format selection',
        facilitator: 'agent',
        commands: [
          {
            name: 'main.md',
            description: 'Processing instructions',
            path: 'commands/main.md',
            from: 'workflow',
            content: PROCESS_MAIN_MD,
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
            description: 'Structured processing output',
            required: true,
            type: 'json',
            from: 'agent',
          },
        ],
      }),
      createPhase({
        name: 'report',
        order: 2,
        status: 'pending',
        description: 'Generate final report from processed data',
        facilitator: 'agent',
        commands: [
          {
            name: 'main.md',
            description: 'Report generation template',
            path: 'commands/main.md',
            from: 'workflow',
            content: REPORT_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'result.md',
            description: 'Processing result',
            required: true,
            type: 'markdown',
            from: 'agent',
          },
          {
            name: 'process-data.json',
            description: 'Structured data',
            required: true,
            type: 'json',
            from: 'agent',
          },
        ],
        outputs: [
          {
            name: 'final-report.md',
            description: 'Final workflow report',
            required: true,
            type: 'markdown',
            from: 'agent',
          },
        ],
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-mt-001',
    status: 'active',
    startedAt: THIRTY_MIN_AGO.toISOString(),
    currentPhase: 'gather',
    triggeredBy: 'manual',
  })
);

/**
 * Run 2: Process phase blocked with MULTI_CHOICE question (format selection)
 * Gather complete, agent asking about output format
 */
export const DEMO_RUN_PROCESS_BLOCKED = createRunDetail(
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
        startedAt: HOUR_AGO.toISOString(),
        completedAt: new Date(HOUR_AGO.getTime() + 300000).toISOString(),
        duration: 300,
        commands: [
          {
            name: 'main.md',
            description: 'Primary agent prompt for gathering',
            path: 'commands/main.md',
            from: 'workflow',
            content: GATHER_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'request.md',
            description: 'Initial user request',
            required: true,
            type: 'markdown',
            from: 'user',
            content: USER_REQUEST_CONTENT,
          },
        ],
        outputs: [
          {
            name: 'response.md',
            description: 'Agent response demonstrating understanding',
            required: true,
            type: 'markdown',
            from: 'agent',
            content: AGENT_GATHER_RESPONSE,
          },
        ],
      }),
      createPhase({
        name: 'process',
        order: 1,
        status: 'blocked',
        description: 'Process gathered data - awaiting orchestrator input on output format',
        facilitator: 'agent',
        startedAt: new Date(HOUR_AGO.getTime() + 300000).toISOString(),
        question: PROCESS_FORMAT_QUESTION,
        commands: [
          {
            name: 'main.md',
            description: 'Processing instructions',
            path: 'commands/main.md',
            from: 'workflow',
            content: PROCESS_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'response.md',
            description: 'Response from gather phase',
            required: true,
            type: 'markdown',
            from: 'agent',
            content: AGENT_GATHER_RESPONSE,
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
            description: 'Structured processing output',
            required: true,
            type: 'json',
            from: 'agent',
          },
        ],
      }),
      createPhase({
        name: 'report',
        order: 2,
        status: 'pending',
        description: 'Generate final report from processed data with test coverage summary',
        facilitator: 'agent',
        commands: [
          {
            name: 'main.md',
            description: 'Report generation template',
            path: 'commands/main.md',
            from: 'workflow',
            content: REPORT_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'result.md',
            description: 'Processing result',
            required: true,
            type: 'markdown',
            from: 'agent',
          },
          {
            name: 'process-data.json',
            description: 'Structured data',
            required: true,
            type: 'json',
            from: 'agent',
          },
        ],
        outputs: [
          {
            name: 'final-report.md',
            description: 'Final workflow report',
            required: true,
            type: 'markdown',
            from: 'agent',
          },
        ],
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-mt-002',
    status: 'active',
    startedAt: HOUR_AGO.toISOString(),
    currentPhase: 'process',
    triggeredBy: 'orchestrator',
  })
);

/**
 * Run 3: Report phase blocked with CONFIRM question
 * Gather and process complete, awaiting confirmation to generate final report
 */
export const DEMO_RUN_REPORT_BLOCKED = createRunDetail(
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
        startedAt: TWO_HOURS_AGO.toISOString(),
        completedAt: new Date(TWO_HOURS_AGO.getTime() + 300000).toISOString(),
        duration: 300,
        commands: [
          {
            name: 'main.md',
            description: 'Primary agent prompt for gathering',
            path: 'commands/main.md',
            from: 'workflow',
            content: GATHER_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'request.md',
            description: 'Initial user request',
            required: true,
            type: 'markdown',
            from: 'user',
            content: USER_REQUEST_CONTENT,
          },
        ],
        outputs: [
          {
            name: 'response.md',
            description: 'Agent response demonstrating understanding',
            required: true,
            type: 'markdown',
            from: 'agent',
            content: AGENT_GATHER_RESPONSE,
          },
        ],
      }),
      createPhase({
        name: 'process',
        order: 1,
        status: 'complete',
        description: 'Process gathered data - selected "Both" format per orchestrator',
        facilitator: 'agent',
        startedAt: new Date(TWO_HOURS_AGO.getTime() + 300000).toISOString(),
        completedAt: new Date(TWO_HOURS_AGO.getTime() + 1200000).toISOString(),
        duration: 900,
        commands: [
          {
            name: 'main.md',
            description: 'Processing instructions',
            path: 'commands/main.md',
            from: 'workflow',
            content: PROCESS_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'response.md',
            description: 'Response from gather phase',
            required: true,
            type: 'markdown',
            from: 'agent',
            content: AGENT_GATHER_RESPONSE,
          },
        ],
        outputs: [
          {
            name: 'result.md',
            description: 'Processing result summary',
            required: true,
            type: 'markdown',
            from: 'agent',
            content: AGENT_PROCESS_RESULT,
          },
          {
            name: 'process-data.json',
            description: 'Structured processing output',
            required: true,
            type: 'json',
            from: 'agent',
            content: AGENT_PROCESS_DATA,
          },
        ],
      }),
      createPhase({
        name: 'report',
        order: 2,
        status: 'blocked',
        description: 'Ready to generate final report - awaiting confirmation',
        facilitator: 'agent',
        startedAt: new Date(TWO_HOURS_AGO.getTime() + 1200000).toISOString(),
        question: REPORT_CONFIRM_QUESTION,
        commands: [
          {
            name: 'main.md',
            description: 'Report generation template',
            path: 'commands/main.md',
            from: 'workflow',
            content: REPORT_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'result.md',
            description: 'Processing result',
            required: true,
            type: 'markdown',
            from: 'agent',
            content: AGENT_PROCESS_RESULT,
          },
          {
            name: 'process-data.json',
            description: 'Structured data',
            required: true,
            type: 'json',
            from: 'agent',
            content: AGENT_PROCESS_DATA,
          },
        ],
        outputs: [
          {
            name: 'final-report.md',
            description: 'Final workflow report',
            required: true,
            type: 'markdown',
            from: 'agent',
          },
        ],
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-mt-003',
    status: 'active',
    startedAt: TWO_HOURS_AGO.toISOString(),
    currentPhase: 'report',
    triggeredBy: 'scheduled',
  })
);

/**
 * Run 4: Gather phase ACTIVE (agent working, no question yet)
 * Just started, agent is processing the initial request
 */
export const DEMO_RUN_GATHER_ACTIVE = createRunDetail(
  createWorkflow({
    slug: 'manual-test-workflow',
    description: 'Workflow validation test: gather → process → report',
    phases: [
      createPhase({
        name: 'gather',
        order: 0,
        status: 'active',
        description: 'Gather initial request - agent is processing',
        facilitator: 'agent',
        startedAt: new Date(NOW.getTime() - 60000).toISOString(), // 1 minute ago
        commands: [
          {
            name: 'main.md',
            description: 'Primary agent prompt for gathering',
            path: 'commands/main.md',
            from: 'workflow',
            content: GATHER_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'request.md',
            description: 'Initial user request',
            required: true,
            type: 'markdown',
            from: 'user',
            content: USER_REQUEST_CONTENT,
          },
        ],
        outputs: [
          {
            name: 'response.md',
            description: 'Agent response demonstrating understanding',
            required: true,
            type: 'markdown',
            from: 'agent',
          },
        ],
      }),
      createPhase({
        name: 'process',
        order: 1,
        status: 'pending',
        description: 'Process gathered data with format selection',
        facilitator: 'agent',
        commands: [
          {
            name: 'main.md',
            description: 'Processing instructions',
            path: 'commands/main.md',
            from: 'workflow',
            content: PROCESS_MAIN_MD,
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
            description: 'Structured processing output',
            required: true,
            type: 'json',
            from: 'agent',
          },
        ],
      }),
      createPhase({
        name: 'report',
        order: 2,
        status: 'pending',
        description: 'Generate final report from processed data',
        facilitator: 'agent',
        commands: [
          {
            name: 'main.md',
            description: 'Report generation template',
            path: 'commands/main.md',
            from: 'workflow',
            content: REPORT_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'result.md',
            description: 'Processing result',
            required: true,
            type: 'markdown',
            from: 'agent',
          },
          {
            name: 'process-data.json',
            description: 'Structured data',
            required: true,
            type: 'json',
            from: 'agent',
          },
        ],
        outputs: [
          {
            name: 'final-report.md',
            description: 'Final workflow report',
            required: true,
            type: 'markdown',
            from: 'agent',
          },
        ],
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-mt-004',
    status: 'active',
    startedAt: new Date(NOW.getTime() - 60000).toISOString(),
    currentPhase: 'gather',
    triggeredBy: 'github-actions',
  })
);

/**
 * Run 5: Completed successfully - all phases done with content
 */
export const DEMO_RUN_COMPLETE = createRunDetail(
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
        startedAt: YESTERDAY.toISOString(),
        completedAt: new Date(YESTERDAY.getTime() + 300000).toISOString(),
        duration: 300,
        commands: [
          {
            name: 'main.md',
            description: 'Primary agent prompt for gathering',
            path: 'commands/main.md',
            from: 'workflow',
            content: GATHER_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'request.md',
            description: 'Initial user request',
            required: true,
            type: 'markdown',
            from: 'user',
            content: USER_REQUEST_CONTENT,
          },
        ],
        outputs: [
          {
            name: 'response.md',
            description: 'Agent response demonstrating understanding',
            required: true,
            type: 'markdown',
            from: 'agent',
            content: AGENT_GATHER_RESPONSE,
          },
        ],
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
        commands: [
          {
            name: 'main.md',
            description: 'Processing instructions',
            path: 'commands/main.md',
            from: 'workflow',
            content: PROCESS_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'response.md',
            description: 'Response from gather phase',
            required: true,
            type: 'markdown',
            from: 'agent',
            content: AGENT_GATHER_RESPONSE,
          },
        ],
        outputs: [
          {
            name: 'result.md',
            description: 'Processing result summary',
            required: true,
            type: 'markdown',
            from: 'agent',
            content: AGENT_PROCESS_RESULT,
          },
          {
            name: 'process-data.json',
            description: 'Structured processing output',
            required: true,
            type: 'json',
            from: 'agent',
            content: AGENT_PROCESS_DATA,
          },
        ],
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
        commands: [
          {
            name: 'main.md',
            description: 'Report generation template',
            path: 'commands/main.md',
            from: 'workflow',
            content: REPORT_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'result.md',
            description: 'Processing result',
            required: true,
            type: 'markdown',
            from: 'agent',
            content: AGENT_PROCESS_RESULT,
          },
          {
            name: 'process-data.json',
            description: 'Structured data',
            required: true,
            type: 'json',
            from: 'agent',
            content: AGENT_PROCESS_DATA,
          },
        ],
        outputs: [
          {
            name: 'final-report.md',
            description: 'Final workflow report',
            required: true,
            type: 'markdown',
            from: 'agent',
            content: AGENT_FINAL_REPORT,
          },
        ],
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-mt-005',
    status: 'complete',
    startedAt: YESTERDAY.toISOString(),
    completedAt: new Date(YESTERDAY.getTime() + 1500000).toISOString(),
    duration: 1500,
    currentPhase: null,
    triggeredBy: 'github-actions',
  })
);

/**
 * Run 6: Failed - process phase failed during execution
 */
export const DEMO_RUN_FAILED = createRunDetail(
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
        startedAt: TWO_DAYS_AGO.toISOString(),
        completedAt: new Date(TWO_DAYS_AGO.getTime() + 300000).toISOString(),
        duration: 300,
        commands: [
          {
            name: 'main.md',
            description: 'Primary agent prompt for gathering',
            path: 'commands/main.md',
            from: 'workflow',
            content: GATHER_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'request.md',
            description: 'Initial user request',
            required: true,
            type: 'markdown',
            from: 'user',
            content: USER_REQUEST_CONTENT,
          },
        ],
        outputs: [
          {
            name: 'response.md',
            description: 'Agent response demonstrating understanding',
            required: true,
            type: 'markdown',
            from: 'agent',
            content: AGENT_GATHER_RESPONSE,
          },
        ],
      }),
      createPhase({
        name: 'process',
        order: 1,
        status: 'failed',
        description: 'Process phase failed - agent encountered validation error',
        facilitator: 'agent',
        startedAt: new Date(TWO_DAYS_AGO.getTime() + 300000).toISOString(),
        completedAt: new Date(TWO_DAYS_AGO.getTime() + 420000).toISOString(),
        duration: 120,
        commands: [
          {
            name: 'main.md',
            description: 'Processing instructions',
            path: 'commands/main.md',
            from: 'workflow',
            content: PROCESS_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'response.md',
            description: 'Response from gather phase',
            required: true,
            type: 'markdown',
            from: 'agent',
            content: AGENT_GATHER_RESPONSE,
          },
        ],
        outputs: [
          {
            name: 'result.md',
            description: 'Processing result summary',
            required: true,
            type: 'markdown',
            from: 'agent',
            // Partial/incomplete output
            content:
              '# Processing Error\n\nAgent encountered a validation error during processing.',
          },
          {
            name: 'process-data.json',
            description: 'Structured processing output',
            required: true,
            type: 'json',
            from: 'agent',
            // Missing - validation failed
          },
        ],
      }),
      createPhase({
        name: 'report',
        order: 2,
        status: 'pending',
        description: 'Generate final report - blocked by failed process phase',
        facilitator: 'agent',
        commands: [
          {
            name: 'main.md',
            description: 'Report generation template',
            path: 'commands/main.md',
            from: 'workflow',
            content: REPORT_MAIN_MD,
          },
        ],
        inputs: [
          {
            name: 'result.md',
            description: 'Processing result',
            required: true,
            type: 'markdown',
            from: 'agent',
          },
          {
            name: 'process-data.json',
            description: 'Structured data',
            required: true,
            type: 'json',
            from: 'agent',
          },
        ],
        outputs: [
          {
            name: 'final-report.md',
            description: 'Final workflow report',
            required: true,
            type: 'markdown',
            from: 'agent',
          },
        ],
      }),
    ],
  }),
  createRunMetadata({
    runId: 'run-mt-006',
    status: 'failed',
    startedAt: TWO_DAYS_AGO.toISOString(),
    completedAt: new Date(TWO_DAYS_AGO.getTime() + 420000).toISOString(),
    duration: 420,
    currentPhase: 'process',
    triggeredBy: 'manual',
  })
);

/**
 * All demo runs for manual-test-workflow
 *
 * Run coverage:
 * - run-mt-001: gather blocked (free_text question)
 * - run-mt-002: process blocked (multi_choice question)
 * - run-mt-003: report blocked (confirm question)
 * - run-mt-004: gather active (no question, agent working)
 * - run-mt-005: complete (all phases done)
 * - run-mt-006: failed (process phase failed)
 */
export const DEMO_RUNS: RunDetail[] = [
  DEMO_RUN_GATHER_BLOCKED, // run-mt-001: free_text question in gather
  DEMO_RUN_PROCESS_BLOCKED, // run-mt-002: multi_choice question in process
  DEMO_RUN_REPORT_BLOCKED, // run-mt-003: confirm question in report
  DEMO_RUN_GATHER_ACTIVE, // run-mt-004: active, no question
  DEMO_RUN_COMPLETE, // run-mt-005: complete
  DEMO_RUN_FAILED, // run-mt-006: failed
];

/**
 * Run summaries for list views
 */
export const DEMO_RUN_SUMMARIES: RunSummary[] = DEMO_RUNS.map((r) => r.runSummary);

// ============ Checkpoint Fixtures ============

/**
 * Demo checkpoints for manual-test-workflow
 */
export const DEMO_CHECKPOINTS: CheckpointMetadataJSON[] = [
  createCheckpointMetadata({
    version: 'v003-def5678',
    createdAt: new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    comment: 'Added process phase clarification question',
  }),
  createCheckpointMetadata({
    version: 'v002-abc1234',
    createdAt: new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    comment: 'Added report confirmation step',
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
