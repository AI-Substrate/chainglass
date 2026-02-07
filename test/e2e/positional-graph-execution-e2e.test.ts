#!/usr/bin/env npx tsx
/**
 * Positional Graph Execution Lifecycle E2E Test
 *
 * Validates the complete execution lifecycle infrastructure implemented in Plan 028
 * Phases 1-5. This test exercises the **data system** — the plumbing that lets nodes
 * start, save outputs, ask questions, retrieve inputs, and complete.
 *
 * Test coverage (3 lines, 7 nodes):
 * - Line 0: Spec Creation (serial) — spec-builder → spec-reviewer
 * - Line 1: Implementation (serial, MANUAL gate) — coder (Q&A) → tester
 * - Line 2: PR Preparation (parallel + serial) — alignment-tester || pr-preparer → PR-creator
 *
 * Key patterns tested:
 * - Serial execution (nodes wait for left neighbor)
 * - Parallel execution (multiple nodes ready simultaneously)
 * - Manual transition gates (human approval required)
 * - Q&A protocol (agent asks question, orchestrator answers)
 * - Code-unit pattern (simple start → save → end, no Q&A)
 * - Input resolution (from_unit, from_node, composite inputs)
 *
 * Usage:
 *   npx tsx test/e2e/positional-graph-execution-e2e.test.ts
 *
 * Exit codes:
 *   0 = all tests passed
 *   1 = test failure or error
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

// ============================================
// Constants
// ============================================

const GRAPH_SLUG = 'e2e-execution-test';

// Node IDs populated during setup
const nodeIds = {
  specBuilder: '',
  specReviewer: '',
  coder: '',
  tester: '',
  alignmentTester: '',
  prPreparer: '',
  prCreator: '',
};

// Line IDs populated during setup
const lineIds = {
  line0: '', // Spec Creation (serial, auto transition)
  line1: '', // Implementation (serial, MANUAL transition to Line 2)
  line2: '', // PR Preparation (parallel + serial)
};

// ============================================
// Types
// ============================================

interface CliResult<T = unknown> {
  ok: boolean;
  data?: T;
  errors: Array<{ code: string; message: string }>;
}

interface GraphCreateResult {
  graphSlug: string;
  lineId: string;
  errors: Array<{ code: string; message: string }>;
}

interface AddLineResult {
  lineId?: string;
  index?: number;
  errors: Array<{ code: string; message: string }>;
}

interface AddNodeResult {
  nodeId?: string;
  position?: number;
  errors: Array<{ code: string; message: string }>;
}

interface StatusResult {
  status?: string;
  ready?: boolean;
  readyDetail?: {
    precedingLinesComplete?: boolean;
    transitionOpen?: boolean;
    serialNeighborComplete?: boolean;
    inputsAvailable?: boolean;
  };
  errors: Array<{ code: string; message: string }>;
}

interface LineStatusResult {
  complete?: boolean;
  canRun?: boolean;
  starterNodes?: string[];
  readyNodes?: string[];
  runningNodes?: string[];
  completedNodes?: string[];
  transitionOpen?: boolean;
  errors: Array<{ code: string; message: string }>;
}

interface GraphStatusResult {
  status?: string;
  totalNodes?: number;
  completedNodes?: number | string[];
  readyNodes?: string[];
  runningNodes?: string[];
  errors: Array<{ code: string; message: string }>;
}

interface AskResult {
  questionId?: string;
  status?: string;
  errors: Array<{ code: string; message: string }>;
}

interface GetAnswerResult {
  answered?: boolean;
  answer?: string;
  answeredAt?: string;
  errors: Array<{ code: string; message: string }>;
}

interface GetInputDataResult {
  value?: unknown;
  sourceNodeId?: string;
  sources?: Array<{ nodeId: string; value: unknown }>;
  errors: Array<{ code: string; message: string }>;
}

interface GetOutputDataResult {
  value?: unknown;
  errors: Array<{ code: string; message: string }>;
}

interface GetInputFileResult {
  /** All resolved file sources (matches service interface) */
  sources?: Array<{ sourceNodeId: string; sourceOutput: string; filePath: string }>;
  /** True when all sources are complete */
  complete?: boolean;
  errors: Array<{ code: string; message: string }>;
}

interface UnitInfoResult {
  unit?: {
    slug?: string;
    type?: 'agent' | 'code' | 'user-input';
    version?: string;
    description?: string;
    agent?: { prompt_template?: string };
    code?: { script?: string };
    user_input?: { question_type?: string; prompt?: string };
  };
  errors: Array<{ code: string; message: string }>;
}

interface GetTemplateResult {
  content?: string;
  templateType?: 'prompt' | 'script';
  errors: Array<{ code: string; message: string }>;
}

// ============================================
// CLI Runner
// ============================================

let workspacePath: string;

/**
 * Run a CLI command and parse the JSON output.
 * All commands are run with --json flag and against the temp workspace.
 */
async function runCli<T>(args: string[]): Promise<CliResult<T>> {
  // Build full command: cg wf --json --workspace-path <path> <args>
  // IMPORTANT: --json and --workspace-path are parent options on 'wf' command,
  // so they must come BEFORE the subcommand (e.g., 'create', 'node', 'line').
  const fullArgs = ['wf', '--json', '--workspace-path', workspacePath, ...args];

  return new Promise((resolve, reject) => {
    const proc = spawn('cg', fullArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      // Parse NDJSON - take the last valid JSON line
      const lines = stdout.trim().split('\n').filter(Boolean);
      let lastJson: unknown = null;

      for (const line of lines) {
        try {
          lastJson = JSON.parse(line);
        } catch {
          // Not JSON, skip
        }
      }

      if (lastJson && typeof lastJson === 'object') {
        const result = lastJson as Record<string, unknown>;
        // Extract errors from error.details or top-level errors
        const errorObj = result.error as Record<string, unknown> | undefined;
        const errors = (errorObj?.details ?? result.errors ?? []) as Array<{
          code: string;
          message: string;
        }>;
        // Extract inner data from CLI response envelope
        const innerData = (result.data ?? result) as T;
        resolve({
          ok: errors.length === 0 && code === 0,
          data: innerData,
          errors,
        });
      } else if (code !== 0) {
        resolve({
          ok: false,
          errors: [
            {
              code: 'CLI_ERROR',
              message: stderr || `Command failed with exit code ${code}`,
            },
          ],
        });
      } else {
        resolve({
          ok: true,
          data: {} as T,
          errors: [],
        });
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn CLI: ${err.message}`));
    });
  });
}

/**
 * Run a workspace command (without wf prefix).
 */
async function runWorkspaceCommand<T>(args: string[]): Promise<CliResult<T>> {
  const fullArgs = ['workspace', ...args, '--json'];

  return new Promise((resolve, reject) => {
    const proc = spawn('cg', fullArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      const lines = stdout.trim().split('\n').filter(Boolean);
      let lastJson: unknown = null;

      for (const line of lines) {
        try {
          lastJson = JSON.parse(line);
        } catch {
          // Not JSON, skip
        }
      }

      if (lastJson && typeof lastJson === 'object') {
        const result = lastJson as Record<string, unknown>;
        // Extract errors from error.details or top-level errors
        const errorObj = result.error as Record<string, unknown> | undefined;
        const errors = (errorObj?.details ?? result.errors ?? []) as Array<{
          code: string;
          message: string;
        }>;
        // Extract inner data from CLI response envelope
        const innerData = (result.data ?? result) as T;
        resolve({
          ok: errors.length === 0 && code === 0,
          data: innerData,
          errors,
        });
      } else if (code !== 0) {
        resolve({
          ok: false,
          errors: [
            {
              code: 'CLI_ERROR',
              message: stderr || `Command failed with exit code ${code}`,
            },
          ],
        });
      } else {
        resolve({
          ok: true,
          data: {} as T,
          errors: [],
        });
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn CLI: ${err.message}`));
    });
  });
}

/**
 * Run CLI expecting an error. Returns the error result.
 */
async function runCliExpectError(args: string[]): Promise<CliResult<unknown>> {
  const result = await runCli(args);
  if (result.ok) {
    throw new Error(`Expected error but command succeeded: cg wf ${args.join(' ')}`);
  }
  return result;
}

// ============================================
// Test Utilities
// ============================================

let stepNum = 0;
let sectionNum = 0;

function section(name: string): void {
  sectionNum++;
  console.log(`\n=== Section ${sectionNum}: ${name} ===\n`);
}

function step(description: string): void {
  stepNum++;
  console.log(`  [${stepNum}] ${description}`);
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

function unwrap<T>(value: T | undefined | null, label: string): T {
  if (value === undefined || value === null) {
    throw new Error(`ASSERTION FAILED: ${label} is ${String(value)}`);
  }
  return value;
}

// ============================================
// SECTION 1: Setup
// ============================================

async function setup(): Promise<void> {
  section('Setup');

  step('1.1: Create temp workspace directory');
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-exec-e2e-'));
  workspacePath = tmpDir;

  // Create .chainglass directory structure
  const chaingleassDir = path.join(workspacePath, '.chainglass', 'data', 'workflows');
  await fs.mkdir(chaingleassDir, { recursive: true });
  console.log(`    Workspace: ${workspacePath}`);

  // Copy units from canonical path to temp workspace
  // WorkUnitAdapter (per Plan 029 Phase 2) looks ONLY at .chainglass/units/
  // Phase 5 consolidated all units to this canonical path
  const projectRoot = path.resolve(import.meta.dirname, '../..');
  const srcUnits = path.join(projectRoot, '.chainglass', 'units');
  const dstUnits = path.join(workspacePath, '.chainglass', 'units');
  await fs.mkdir(dstUnits, { recursive: true });

  // Copy units from canonical .chainglass/units/ path
  try {
    await fs.cp(srcUnits, dstUnits, { recursive: true });
    const unitsCopied = await fs.readdir(dstUnits);
    console.log(`    Units copied: ${unitsCopied.join(', ')}`);
  } catch {
    throw new Error(`Failed to copy units from ${srcUnits} - ensure canonical units exist`);
  }

  step('1.2: Register temp directory as workspace');
  // Use workspace add command (it's a root command, not under wf)
  const registerResult = await runWorkspaceCommand(['add', 'e2e-test', workspacePath]);
  assert(
    registerResult.ok,
    `Workspace registration failed: ${JSON.stringify(registerResult.errors)}`
  );
  console.log('    Workspace registered: e2e-test');

  step('1.3: Cleanup existing graph (ignore errors)');
  await runCli(['delete', GRAPH_SLUG]).catch(() => {});

  step('1.4: Create graph (Line 0 created automatically)');
  const createResult = await runCli<GraphCreateResult>(['create', GRAPH_SLUG]);
  assert(createResult.ok, `Create failed: ${JSON.stringify(createResult.errors)}`);
  lineIds.line0 = unwrap(createResult.data?.lineId, 'createResult.lineId');
  console.log(`    Graph created: ${GRAPH_SLUG}, Line 0: ${lineIds.line0}`);

  step('1.5: Add Line 1 (serial, MANUAL transition to Line 2)');
  const line1Result = await runCli<AddLineResult>(['line', 'add', GRAPH_SLUG]);
  assert(line1Result.ok, `Add Line 1 failed: ${JSON.stringify(line1Result.errors)}`);
  lineIds.line1 = unwrap(line1Result.data?.lineId, 'line1Result.lineId');
  console.log(`    Line 1 added: ${lineIds.line1}`);

  // Set manual transition on Line 1 (gates Line 2)
  const setTransition = await runCli([
    'line',
    'set',
    GRAPH_SLUG,
    lineIds.line1,
    '--orch',
    'transition=manual',
  ]);
  assert(setTransition.ok, `Set transition failed: ${JSON.stringify(setTransition.errors)}`);
  console.log('    Line 1 transition set to: manual');

  step('1.6: Add Line 2 (parallel + serial)');
  const line2Result = await runCli<AddLineResult>(['line', 'add', GRAPH_SLUG]);
  assert(line2Result.ok, `Add Line 2 failed: ${JSON.stringify(line2Result.errors)}`);
  lineIds.line2 = unwrap(line2Result.data?.lineId, 'line2Result.lineId');
  console.log(`    Line 2 added: ${lineIds.line2}`);

  step('1.7: Add nodes to Line 0 (Spec Creation - serial)');
  // spec-builder
  const specBuilderResult = await runCli<AddNodeResult>([
    'node',
    'add',
    GRAPH_SLUG,
    lineIds.line0,
    'sample-spec-builder',
  ]);
  assert(
    specBuilderResult.ok,
    `Add spec-builder failed: ${JSON.stringify(specBuilderResult.errors)}`
  );
  nodeIds.specBuilder = unwrap(specBuilderResult.data?.nodeId, 'specBuilder.nodeId');

  // spec-reviewer
  const specReviewerResult = await runCli<AddNodeResult>([
    'node',
    'add',
    GRAPH_SLUG,
    lineIds.line0,
    'sample-spec-reviewer',
  ]);
  assert(
    specReviewerResult.ok,
    `Add spec-reviewer failed: ${JSON.stringify(specReviewerResult.errors)}`
  );
  nodeIds.specReviewer = unwrap(specReviewerResult.data?.nodeId, 'specReviewer.nodeId');
  console.log(
    `    Line 0 nodes: spec-builder (${nodeIds.specBuilder}), spec-reviewer (${nodeIds.specReviewer})`
  );

  step('1.8: Add nodes to Line 1 (Implementation - serial)');
  // coder
  const coderResult = await runCli<AddNodeResult>([
    'node',
    'add',
    GRAPH_SLUG,
    lineIds.line1,
    'sample-coder',
  ]);
  assert(coderResult.ok, `Add coder failed: ${JSON.stringify(coderResult.errors)}`);
  nodeIds.coder = unwrap(coderResult.data?.nodeId, 'coder.nodeId');

  // tester
  const testerResult = await runCli<AddNodeResult>([
    'node',
    'add',
    GRAPH_SLUG,
    lineIds.line1,
    'sample-tester',
  ]);
  assert(testerResult.ok, `Add tester failed: ${JSON.stringify(testerResult.errors)}`);
  nodeIds.tester = unwrap(testerResult.data?.nodeId, 'tester.nodeId');
  console.log(`    Line 1 nodes: coder (${nodeIds.coder}), tester (${nodeIds.tester})`);

  step('1.9: Add nodes to Line 2 (PR Preparation - parallel + serial)');
  // alignment-tester (PARALLEL)
  const alignmentResult = await runCli<AddNodeResult>([
    'node',
    'add',
    GRAPH_SLUG,
    lineIds.line2,
    'sample-spec-alignment-tester',
  ]);
  assert(
    alignmentResult.ok,
    `Add alignment-tester failed: ${JSON.stringify(alignmentResult.errors)}`
  );
  nodeIds.alignmentTester = unwrap(alignmentResult.data?.nodeId, 'alignmentTester.nodeId');

  // pr-preparer (PARALLEL)
  const prPreparerResult = await runCli<AddNodeResult>([
    'node',
    'add',
    GRAPH_SLUG,
    lineIds.line2,
    'sample-pr-preparer',
  ]);
  assert(prPreparerResult.ok, `Add pr-preparer failed: ${JSON.stringify(prPreparerResult.errors)}`);
  nodeIds.prPreparer = unwrap(prPreparerResult.data?.nodeId, 'prPreparer.nodeId');

  // PR-creator (serial)
  const prCreatorResult = await runCli<AddNodeResult>([
    'node',
    'add',
    GRAPH_SLUG,
    lineIds.line2,
    'sample-pr-creator',
  ]);
  assert(prCreatorResult.ok, `Add PR-creator failed: ${JSON.stringify(prCreatorResult.errors)}`);
  nodeIds.prCreator = unwrap(prCreatorResult.data?.nodeId, 'prCreator.nodeId');
  console.log(
    `    Line 2 nodes: alignment-tester (${nodeIds.alignmentTester}), pr-preparer (${nodeIds.prPreparer}), PR-creator (${nodeIds.prCreator})`
  );

  step('1.10: Set parallel execution on Line 2 parallel nodes');
  await runCli([
    'node',
    'set',
    GRAPH_SLUG,
    nodeIds.alignmentTester,
    '--orch',
    'execution=parallel',
  ]);
  await runCli(['node', 'set', GRAPH_SLUG, nodeIds.prPreparer, '--orch', 'execution=parallel']);
  console.log('    alignment-tester and pr-preparer set to parallel execution');

  step('1.11: Wire inputs');
  // Line 0: spec-reviewer gets spec from spec-builder
  await runCli([
    'node',
    'set-input',
    GRAPH_SLUG,
    nodeIds.specReviewer,
    'spec',
    '--from-node',
    nodeIds.specBuilder,
    '--output',
    'spec',
  ]);

  // Line 1: coder gets spec from spec-reviewer (from_unit)
  await runCli([
    'node',
    'set-input',
    GRAPH_SLUG,
    nodeIds.coder,
    'spec',
    '--from-unit',
    'sample-spec-reviewer',
    '--output',
    'reviewed_spec',
  ]);

  // Line 1: tester gets language and code from coder
  await runCli([
    'node',
    'set-input',
    GRAPH_SLUG,
    nodeIds.tester,
    'language',
    '--from-node',
    nodeIds.coder,
    '--output',
    'language',
  ]);
  await runCli([
    'node',
    'set-input',
    GRAPH_SLUG,
    nodeIds.tester,
    'code',
    '--from-node',
    nodeIds.coder,
    '--output',
    'code',
  ]);

  // Line 2: alignment-tester gets spec, code, test_output (composite inputs)
  await runCli([
    'node',
    'set-input',
    GRAPH_SLUG,
    nodeIds.alignmentTester,
    'spec',
    '--from-unit',
    'sample-spec-reviewer',
    '--output',
    'reviewed_spec',
  ]);
  await runCli([
    'node',
    'set-input',
    GRAPH_SLUG,
    nodeIds.alignmentTester,
    'code',
    '--from-node',
    nodeIds.coder,
    '--output',
    'code',
  ]);
  await runCli([
    'node',
    'set-input',
    GRAPH_SLUG,
    nodeIds.alignmentTester,
    'test_output',
    '--from-node',
    nodeIds.tester,
    '--output',
    'test_output',
  ]);

  // Line 2: pr-preparer gets spec and test_output
  await runCli([
    'node',
    'set-input',
    GRAPH_SLUG,
    nodeIds.prPreparer,
    'spec',
    '--from-unit',
    'sample-spec-reviewer',
    '--output',
    'reviewed_spec',
  ]);
  await runCli([
    'node',
    'set-input',
    GRAPH_SLUG,
    nodeIds.prPreparer,
    'test_output',
    '--from-node',
    nodeIds.tester,
    '--output',
    'test_output',
  ]);

  // Line 2: PR-creator gets pr_title and pr_body from pr-preparer
  await runCli([
    'node',
    'set-input',
    GRAPH_SLUG,
    nodeIds.prCreator,
    'pr_title',
    '--from-node',
    nodeIds.prPreparer,
    '--output',
    'pr_title',
  ]);
  await runCli([
    'node',
    'set-input',
    GRAPH_SLUG,
    nodeIds.prCreator,
    'pr_body',
    '--from-node',
    nodeIds.prPreparer,
    '--output',
    'pr_body',
  ]);
  console.log('    All inputs wired');
}

// ============================================
// SECTION 2: Readiness Detection Tests
// ============================================

async function testReadinessDetection(): Promise<void> {
  section('Readiness Detection Tests');

  step('2.1: Verify spec-builder is ready (entry point)');
  const specBuilderStatus = await runCli<StatusResult>([
    'status',
    GRAPH_SLUG,
    '--node',
    nodeIds.specBuilder,
  ]);
  assert(specBuilderStatus.ok, `Status failed: ${JSON.stringify(specBuilderStatus.errors)}`);
  assert(specBuilderStatus.data?.ready === true, 'spec-builder should be ready');
  console.log('    spec-builder ready: true');

  step('2.2: Verify spec-reviewer blocked by serial gate');
  const specReviewerStatus = await runCli<StatusResult>([
    'status',
    GRAPH_SLUG,
    '--node',
    nodeIds.specReviewer,
  ]);
  assert(specReviewerStatus.data?.ready === false, 'spec-reviewer should NOT be ready');
  assert(
    specReviewerStatus.data?.readyDetail?.serialNeighborComplete === false,
    'spec-reviewer blocked by serial neighbor'
  );
  console.log('    spec-reviewer ready: false (serial gate)');

  step('2.3: Verify coder blocked by preceding lines');
  const coderStatus = await runCli<StatusResult>(['status', GRAPH_SLUG, '--node', nodeIds.coder]);
  assert(coderStatus.data?.ready === false, 'coder should NOT be ready');
  assert(
    coderStatus.data?.readyDetail?.precedingLinesComplete === false,
    'coder blocked by preceding lines'
  );
  console.log('    coder ready: false (preceding lines)');
}

// ============================================
// SECTION 3: Error Code Tests
// ============================================

async function testErrorCodes(): Promise<void> {
  section('Error Code Tests');

  step('3.1: E176 - Save output on pending node');
  const e176Result = await runCliExpectError([
    'node',
    'save-output-data',
    GRAPH_SLUG,
    nodeIds.specBuilder,
    'spec',
    '"test"',
  ]);
  assert(e176Result.errors[0]?.code === 'E176', `Expected E176, got ${e176Result.errors[0]?.code}`);
  console.log('    E176 NodeNotRunning: verified');

  step('3.2: E172 - End on pending node');
  const e172Result = await runCliExpectError(['node', 'end', GRAPH_SLUG, nodeIds.specBuilder]);
  assert(e172Result.errors[0]?.code === 'E172', `Expected E172, got ${e172Result.errors[0]?.code}`);
  console.log('    E172 InvalidStateTransition: verified');

  step('3.3: E176 - Ask question on pending node');
  const e176AskResult = await runCliExpectError([
    'node',
    'ask',
    GRAPH_SLUG,
    nodeIds.specBuilder,
    '--type',
    'text',
    '--text',
    'Question?',
  ]);
  assert(
    e176AskResult.errors[0]?.code === 'E176',
    `Expected E176, got ${e176AskResult.errors[0]?.code}`
  );
  console.log('    E176 NodeNotRunning (ask): verified');
}

// ============================================
// SECTION 4: Execute Line 0 (Spec Creation - Serial)
// ============================================

async function executeLine0(): Promise<void> {
  section('Execute Line 0 (Spec Creation - Serial)');

  step('4.1: Start spec-builder');
  const startResult = await runCli(['node', 'start', GRAPH_SLUG, nodeIds.specBuilder]);
  assert(startResult.ok, `Start spec-builder failed: ${JSON.stringify(startResult.errors)}`);
  console.log('    spec-builder started');

  step('4.2: Verify spec-reviewer still blocked');
  const reviewerStatus = await runCli<StatusResult>([
    'status',
    GRAPH_SLUG,
    '--node',
    nodeIds.specReviewer,
  ]);
  assert(reviewerStatus.data?.ready === false, 'spec-reviewer should still be blocked');
  console.log('    spec-reviewer still blocked (builder running, not complete)');

  step('4.3: Save output and complete spec-builder');
  await runCli([
    'node',
    'save-output-data',
    GRAPH_SLUG,
    nodeIds.specBuilder,
    'spec',
    '"Create a function that checks if a number is prime"',
  ]);
  const endBuilderResult = await runCli(['node', 'end', GRAPH_SLUG, nodeIds.specBuilder]);
  assert(
    endBuilderResult.ok,
    `End spec-builder failed: ${JSON.stringify(endBuilderResult.errors)}`
  );
  console.log('    spec-builder completed');

  step('4.4: Verify spec-reviewer now ready');
  const reviewerStatus2 = await runCli<StatusResult>([
    'status',
    GRAPH_SLUG,
    '--node',
    nodeIds.specReviewer,
  ]);
  assert(reviewerStatus2.data?.ready === true, 'spec-reviewer should be ready now');
  console.log('    spec-reviewer ready: true');

  step('4.5: Complete spec-reviewer');
  await runCli(['node', 'start', GRAPH_SLUG, nodeIds.specReviewer]);
  await runCli([
    'node',
    'save-output-data',
    GRAPH_SLUG,
    nodeIds.specReviewer,
    'reviewed_spec',
    '"APPROVED: Create isPrime function with edge cases for 0, 1, 2, negative numbers"',
  ]);
  const endReviewerResult = await runCli(['node', 'end', GRAPH_SLUG, nodeIds.specReviewer]);
  assert(
    endReviewerResult.ok,
    `End spec-reviewer failed: ${JSON.stringify(endReviewerResult.errors)}`
  );
  console.log('    spec-reviewer completed');

  step('4.6: Verify Line 0 complete');
  const line0Status = await runCli<LineStatusResult>([
    'status',
    GRAPH_SLUG,
    '--line',
    lineIds.line0,
  ]);
  assert(line0Status.data?.complete === true, 'Line 0 should be complete');
  console.log('    Line 0 complete: true');
}

// ============================================
// SECTION 5-8: Execute Line 1 (Implementation + Q&A)
// ============================================

async function executeLine1WithQA(): Promise<void> {
  section('Execute Line 1 (Implementation + Q&A)');

  step('5.1: Verify coder is ready (Line 0 complete, auto transition)');
  const coderStatus = await runCli<StatusResult>(['status', GRAPH_SLUG, '--node', nodeIds.coder]);
  assert(coderStatus.data?.ready === true, 'coder should be ready');
  console.log('    coder ready: true');

  step('6.1: Start coder');
  await runCli(['node', 'start', GRAPH_SLUG, nodeIds.coder]);
  console.log('    coder started');

  step('6.2: Coder asks "Which language?"');
  const askResult = await runCli<AskResult>([
    'node',
    'ask',
    GRAPH_SLUG,
    nodeIds.coder,
    '--type',
    'single',
    '--text',
    'Which programming language should I use?',
    '--options',
    'TypeScript',
    'Python',
    'Go',
    'Rust',
  ]);
  assert(askResult.ok, `Ask failed: ${JSON.stringify(askResult.errors)}`);
  const questionId = unwrap(askResult.data?.questionId, 'questionId');
  assert(askResult.data?.status === 'waiting-question', 'Should be waiting-question');
  console.log(`    Question asked, ID: ${questionId}`);

  step('6.3: E176 - Cannot save output while waiting');
  const e176WaitResult = await runCliExpectError([
    'node',
    'save-output-data',
    GRAPH_SLUG,
    nodeIds.coder,
    'language',
    '"TypeScript"',
  ]);
  assert(
    e176WaitResult.errors[0]?.code === 'E176',
    `Expected E176, got ${e176WaitResult.errors[0]?.code}`
  );
  console.log('    E176 while waiting: verified');

  step('6.4: Orchestrator answers question');
  const answerResult = await runCli([
    'node',
    'answer',
    GRAPH_SLUG,
    nodeIds.coder,
    questionId,
    '"TypeScript"',
  ]);
  assert(answerResult.ok, `Answer failed: ${JSON.stringify(answerResult.errors)}`);
  console.log('    Question answered: TypeScript');

  step('6.5: Verify coder back to starting');
  const coderStatus2 = await runCli<StatusResult>(['status', GRAPH_SLUG, '--node', nodeIds.coder]);
  assert(coderStatus2.data?.status === 'starting', 'Should be back to starting');
  console.log('    coder status: starting');

  step('6.6: Get answer (agent retrieves after resume)');
  const getAnswerResult = await runCli<GetAnswerResult>([
    'node',
    'get-answer',
    GRAPH_SLUG,
    nodeIds.coder,
    questionId,
  ]);
  assert(getAnswerResult.data?.answered === true, 'Should be answered');
  assert(getAnswerResult.data?.answer === 'TypeScript', 'Answer should be TypeScript');
  console.log('    Answer retrieved: TypeScript');

  step('6.7: E173 - Get answer for fake question');
  const e173Result = await runCliExpectError([
    'node',
    'get-answer',
    GRAPH_SLUG,
    nodeIds.coder,
    'fake-question-id',
  ]);
  assert(e173Result.errors[0]?.code === 'E173', `Expected E173, got ${e173Result.errors[0]?.code}`);
  console.log('    E173 QuestionNotFound: verified');

  step('7.1: Coder gets spec input (from_unit)');
  const specInput = await runCli<GetInputDataResult>([
    'node',
    'get-input-data',
    GRAPH_SLUG,
    nodeIds.coder,
    'spec',
  ]);
  assert(specInput.ok, `Get input failed: ${JSON.stringify(specInput.errors)}`);
  const specValue = String(specInput.data?.value ?? specInput.data?.sources?.[0]?.value ?? '');
  assert(specValue.includes('APPROVED'), `Should get reviewed spec, got: ${specValue}`);
  console.log('    spec input received (from_unit)');

  step('7.2: Complete coder (code as file output)');
  await runCli(['node', 'save-output-data', GRAPH_SLUG, nodeIds.coder, 'language', '"TypeScript"']);

  // Create temp file for code output (file type per WorkUnit definition)
  const codeContent = `function isPrime(n: number): boolean {
  if (n <= 1) return false;
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false;
  }
  return true;
}`;
  const codeTempPath = path.join(workspacePath, 'temp-code.ts');
  await fs.writeFile(codeTempPath, codeContent);

  // Save code as file output
  await runCli(['node', 'save-output-file', GRAPH_SLUG, nodeIds.coder, 'code', codeTempPath]);
  await runCli(['node', 'end', GRAPH_SLUG, nodeIds.coder]);
  console.log('    coder completed (code saved as file)');

  step('8.1: Verify tester now ready');
  const testerStatus = await runCli<StatusResult>(['status', GRAPH_SLUG, '--node', nodeIds.tester]);
  assert(testerStatus.data?.ready === true, 'tester should be ready');
  console.log('    tester ready: true');

  step('8.2: Start tester and get inputs (from_node, code as file)');
  await runCli(['node', 'start', GRAPH_SLUG, nodeIds.tester]);
  const languageInput = await runCli<GetInputDataResult>([
    'node',
    'get-input-data',
    GRAPH_SLUG,
    nodeIds.tester,
    'language',
  ]);
  assert(languageInput.ok, `Get language input failed: ${JSON.stringify(languageInput.errors)}`);

  // Get code as file input (matches WorkUnit file type declaration)
  const codeFileInput = await runCli<GetInputFileResult>([
    'node',
    'get-input-file',
    GRAPH_SLUG,
    nodeIds.tester,
    'code',
  ]);
  assert(codeFileInput.ok, `Get code file input failed: ${JSON.stringify(codeFileInput.errors)}`);
  assert(!!codeFileInput.data?.sources?.[0]?.filePath, 'Code file path should be returned');
  console.log('    tester started, inputs received (code as file)');

  step('8.3: Complete tester');
  await runCli(['node', 'save-output-data', GRAPH_SLUG, nodeIds.tester, 'test_passed', 'true']);
  await runCli([
    'node',
    'save-output-data',
    GRAPH_SLUG,
    nodeIds.tester,
    'test_output',
    '"All 5 test cases passed: isPrime(2)=true, isPrime(4)=false, isPrime(17)=true, isPrime(1)=false, isPrime(0)=false"',
  ]);
  await runCli(['node', 'end', GRAPH_SLUG, nodeIds.tester]);
  console.log('    tester completed');

  step('8.4: Verify Line 1 complete');
  const line1Status = await runCli<LineStatusResult>([
    'status',
    GRAPH_SLUG,
    '--line',
    lineIds.line1,
  ]);
  assert(line1Status.data?.complete === true, 'Line 1 should be complete');
  console.log('    Line 1 complete: true');
}

// ============================================
// SECTION 9: Manual Transition Test
// ============================================

async function testManualTransition(): Promise<void> {
  section('Manual Transition Test');

  step('9.1: Line 2 blocked (manual transition on Line 1 not triggered)');
  const line2Status = await runCli<LineStatusResult>([
    'status',
    GRAPH_SLUG,
    '--line',
    lineIds.line2,
  ]);
  assert(line2Status.data?.canRun === false, 'Line 2 should be blocked');
  console.log('    Line 2 blocked by transition gate');

  const alignmentStatus = await runCli<StatusResult>([
    'status',
    GRAPH_SLUG,
    '--node',
    nodeIds.alignmentTester,
  ]);
  assert(
    alignmentStatus.data?.readyDetail?.transitionOpen === false,
    'Transition gate should be closed'
  );
  console.log('    alignment-tester transitionOpen: false');

  step('9.2: Trigger transition on Line 1');
  const triggerResult = await runCli(['trigger', GRAPH_SLUG, lineIds.line1]);
  assert(triggerResult.ok, `Trigger failed: ${JSON.stringify(triggerResult.errors)}`);
  console.log('    Transition triggered');

  step('9.3: Line 2 now runnable');
  const line2Status2 = await runCli<LineStatusResult>([
    'status',
    GRAPH_SLUG,
    '--line',
    lineIds.line2,
  ]);
  assert(line2Status2.data?.canRun === true, 'Line 2 should be runnable');
  console.log('    Line 2 canRun: true');
}

// ============================================
// SECTION 10: Parallel Execution (Line 2)
// ============================================

async function testParallelExecution(): Promise<void> {
  section('Parallel Execution (Line 2)');

  step('10.1: Verify BOTH parallel nodes are ready simultaneously');
  const alignmentStatus = await runCli<StatusResult>([
    'status',
    GRAPH_SLUG,
    '--node',
    nodeIds.alignmentTester,
  ]);
  const prPreparerStatus = await runCli<StatusResult>([
    'status',
    GRAPH_SLUG,
    '--node',
    nodeIds.prPreparer,
  ]);
  assert(alignmentStatus.data?.ready === true, 'alignment-tester should be ready');
  assert(prPreparerStatus.data?.ready === true, 'pr-preparer should be ready');
  console.log('    alignment-tester ready: true');
  console.log('    pr-preparer ready: true');

  step('10.2: Verify PR-creator NOT ready yet (serial, waits for pr-preparer)');
  const prCreatorStatus = await runCli<StatusResult>([
    'status',
    GRAPH_SLUG,
    '--node',
    nodeIds.prCreator,
  ]);
  assert(prCreatorStatus.data?.ready === false, 'PR-creator should NOT be ready');
  assert(
    prCreatorStatus.data?.readyDetail?.serialNeighborComplete === false,
    'PR-creator waiting for serial neighbor'
  );
  console.log('    PR-creator ready: false (waiting for pr-preparer)');

  step('10.3: Start BOTH parallel nodes simultaneously');
  await runCli(['node', 'start', GRAPH_SLUG, nodeIds.alignmentTester]);
  await runCli(['node', 'start', GRAPH_SLUG, nodeIds.prPreparer]);
  console.log('    Both parallel nodes started');

  step('10.4: Complete alignment-tester (composite inputs, code as file)');
  // Get composite inputs from multiple upstream nodes
  const specInput = await runCli<GetInputDataResult>([
    'node',
    'get-input-data',
    GRAPH_SLUG,
    nodeIds.alignmentTester,
    'spec',
  ]);
  assert(specInput.ok, `Get spec input failed: ${JSON.stringify(specInput.errors)}`);

  // Get code as file input (matches WorkUnit file type declaration)
  const alignmentCodeFile = await runCli<GetInputFileResult>([
    'node',
    'get-input-file',
    GRAPH_SLUG,
    nodeIds.alignmentTester,
    'code',
  ]);
  assert(
    alignmentCodeFile.ok,
    `Get alignment code file failed: ${JSON.stringify(alignmentCodeFile.errors)}`
  );

  await runCli([
    'node',
    'save-output-data',
    GRAPH_SLUG,
    nodeIds.alignmentTester,
    'alignment_score',
    '"95"',
  ]);
  await runCli([
    'node',
    'save-output-data',
    GRAPH_SLUG,
    nodeIds.alignmentTester,
    'alignment_notes',
    '"Code fully implements the spec requirements"',
  ]);
  await runCli(['node', 'end', GRAPH_SLUG, nodeIds.alignmentTester]);
  console.log('    alignment-tester completed');

  step('10.5: Complete pr-preparer');
  await runCli([
    'node',
    'save-output-data',
    GRAPH_SLUG,
    nodeIds.prPreparer,
    'pr_title',
    '"Add isPrime function implementation"',
  ]);
  await runCli([
    'node',
    'save-output-data',
    GRAPH_SLUG,
    nodeIds.prPreparer,
    'pr_body',
    '"## Summary\\nImplements isPrime function with edge case handling."',
  ]);
  await runCli(['node', 'end', GRAPH_SLUG, nodeIds.prPreparer]);
  console.log('    pr-preparer completed');

  step('10.6: Verify PR-creator now ready');
  const prCreatorStatus2 = await runCli<StatusResult>([
    'status',
    GRAPH_SLUG,
    '--node',
    nodeIds.prCreator,
  ]);
  assert(prCreatorStatus2.data?.ready === true, 'PR-creator should be ready now');
  console.log('    PR-creator ready: true');
}

// ============================================
// SECTION 11: PR-creator (Code-unit Pattern)
// ============================================

async function completePRCreator(): Promise<void> {
  section('PR-creator (Code-unit Pattern)');

  step('11.1: Start PR-creator (code-unit: no Q&A)');
  await runCli(['node', 'start', GRAPH_SLUG, nodeIds.prCreator]);
  console.log('    PR-creator started');

  step('11.2: Get inputs from pr-preparer');
  const titleInput = await runCli<GetInputDataResult>([
    'node',
    'get-input-data',
    GRAPH_SLUG,
    nodeIds.prCreator,
    'pr_title',
  ]);
  assert(titleInput.ok, `Get pr_title failed: ${JSON.stringify(titleInput.errors)}`);
  console.log('    Inputs received from pr-preparer');

  step('11.3: Save outputs and end (code-unit pattern)');
  await runCli([
    'node',
    'save-output-data',
    GRAPH_SLUG,
    nodeIds.prCreator,
    'pr_url',
    '"https://github.com/example/repo/pull/42"',
  ]);
  await runCli(['node', 'save-output-data', GRAPH_SLUG, nodeIds.prCreator, 'pr_number', '"42"']);
  await runCli(['node', 'end', GRAPH_SLUG, nodeIds.prCreator]);
  console.log('    PR-creator completed (code-unit pattern: start→save→end)');

  step('11.4: Verify Line 2 complete');
  const line2Status = await runCli<LineStatusResult>([
    'status',
    GRAPH_SLUG,
    '--line',
    lineIds.line2,
  ]);
  assert(line2Status.data?.complete === true, 'Line 2 should be complete');
  console.log('    Line 2 complete: true');
}

// ============================================
// SECTION 12: Final Validation
// ============================================

async function validateFinalState(): Promise<void> {
  section('Final Validation');

  step('12.1: Verify graph complete');
  const graphStatus = await runCli<GraphStatusResult>(['status', GRAPH_SLUG]);
  assert(graphStatus.data?.status === 'complete', 'Graph should be complete');
  const completedCount =
    typeof graphStatus.data?.completedNodes === 'number'
      ? graphStatus.data.completedNodes
      : (graphStatus.data?.completedNodes?.length ?? 0);
  assert(completedCount === 7, `Expected 7 nodes complete, got ${completedCount}`);
  console.log('    Graph status: complete');
  console.log(`    Completed nodes: ${completedCount}/7`);

  step('12.2: Verify PR-creator output');
  const prUrl = await runCli<GetOutputDataResult>([
    'node',
    'get-output-data',
    GRAPH_SLUG,
    nodeIds.prCreator,
    'pr_url',
  ]);
  assert(prUrl.ok, `Get pr_url failed: ${JSON.stringify(prUrl.errors)}`);
  const urlValue = String(prUrl.data?.value ?? '');
  assert(urlValue.includes('github.com'), `PR URL should contain github.com, got: ${urlValue}`);
  console.log(`    PR URL: ${urlValue}`);

  step('12.3: Verify all 3 lines complete');
  for (const [name, lineId] of Object.entries(lineIds)) {
    const status = await runCli<LineStatusResult>(['status', GRAPH_SLUG, '--line', lineId]);
    assert(status.data?.complete === true, `${name} should be complete`);
  }
  console.log('    All 3 lines complete: true');
}

// ============================================
// SECTION 13: Unit Type Verification (Phase 4)
// ============================================

/**
 * Verifies that CLI returns correct unit types for agent, code, and user-input units.
 * Per spec AC-8: E2E Section 13 (Unit Type Verification)
 */
async function testUnitTypeVerification(): Promise<void> {
  section('Unit Type Verification (Phase 4)');

  step('13.1: Verify sample-coder is AgenticWorkUnit (type=agent)');
  const coderInfo = await runCli<UnitInfoResult>(['unit', 'info', 'sample-coder']);
  assert(coderInfo.ok, `Unit info failed: ${JSON.stringify(coderInfo.errors)}`);
  assert(
    coderInfo.data?.unit?.type === 'agent',
    `Expected type='agent', got ${coderInfo.data?.unit?.type}`
  );
  assert(
    !!coderInfo.data?.unit?.agent?.prompt_template,
    'Agent should have prompt_template config'
  );
  console.log(`    sample-coder: type=${coderInfo.data?.unit?.type}, has prompt_template`);

  step('13.2: Verify sample-pr-creator is CodeUnit (type=code)');
  const prCreatorInfo = await runCli<UnitInfoResult>(['unit', 'info', 'sample-pr-creator']);
  assert(prCreatorInfo.ok, `Unit info failed: ${JSON.stringify(prCreatorInfo.errors)}`);
  assert(
    prCreatorInfo.data?.unit?.type === 'code',
    `Expected type='code', got ${prCreatorInfo.data?.unit?.type}`
  );
  assert(!!prCreatorInfo.data?.unit?.code?.script, 'Code unit should have script config');
  console.log(`    sample-pr-creator: type=${prCreatorInfo.data?.unit?.type}, has script`);

  step('13.3: Verify sample-input is UserInputUnit (type=user-input)');
  const inputInfo = await runCli<UnitInfoResult>(['unit', 'info', 'sample-input']);
  assert(inputInfo.ok, `Unit info failed: ${JSON.stringify(inputInfo.errors)}`);
  assert(
    inputInfo.data?.unit?.type === 'user-input',
    `Expected type='user-input', got ${inputInfo.data?.unit?.type}`
  );
  assert(!!inputInfo.data?.unit?.user_input?.question_type, 'UserInput should have question_type');
  console.log(`    sample-input: type=${inputInfo.data?.unit?.type}, has question_type`);
}

// ============================================
// SECTION 14: Reserved Parameter Routing (Phase 4)
// ============================================

/**
 * Verifies reserved parameter routing for main-prompt and main-script.
 * Per spec AC-9: E2E Section 14 (Reserved Parameter Routing)
 *
 * Design note: Reserved parameters access STATIC template content, not runtime data.
 * They work regardless of node state (pending, running, completed).
 */
async function testReservedParameterRouting(): Promise<void> {
  section('Reserved Parameter Routing (Phase 4)');

  // Note: This section runs after Line 1 completes but before Line 2.
  // Tests verify reserved params work on both completed and pending nodes.

  step('14.1: Get main-prompt for AgenticWorkUnit (coder node completed)');
  const promptResult = await runCli<GetInputDataResult>([
    'node',
    'get-input-data',
    GRAPH_SLUG,
    nodeIds.coder,
    'main-prompt',
  ]);
  assert(promptResult.ok, `Get main-prompt failed: ${JSON.stringify(promptResult.errors)}`);
  const promptValue = String(promptResult.data?.value ?? '');
  assert(promptValue.length > 0, 'main-prompt should return non-empty content');
  console.log(
    `    main-prompt on completed coder: ${promptValue.length} chars (works post-completion)`
  );

  step('14.2: Get main-script for CodeUnit (pr-creator node pending)');
  // PR-creator hasn't started yet — verifies reserved params work on pending nodes
  const scriptResult = await runCli<GetInputDataResult>([
    'node',
    'get-input-data',
    GRAPH_SLUG,
    nodeIds.prCreator,
    'main-script',
  ]);
  assert(scriptResult.ok, `Get main-script failed: ${JSON.stringify(scriptResult.errors)}`);
  const scriptValue = String(scriptResult.data?.value ?? '');
  assert(scriptValue.length > 0, 'main-script should return non-empty content');
  console.log(
    `    main-script on pending pr-creator: ${scriptValue.length} chars (works pre-execution)`
  );

  step('14.3: E186 - main-prompt on CodeUnit should fail (type mismatch)');
  const e186Result = await runCli<GetInputDataResult>([
    'node',
    'get-input-data',
    GRAPH_SLUG,
    nodeIds.prCreator,
    'main-prompt',
  ]);
  assert(!e186Result.ok, 'Expected error for main-prompt on CodeUnit');
  const e186Error = e186Result.errors.find((e) => e.code === 'E186');
  assert(!!e186Error, `Expected E186 error, got: ${JSON.stringify(e186Result.errors)}`);
  console.log('    E186 UnitTypeMismatch: main-prompt on CodeUnit correctly rejected');

  step('14.4: E183 - get-template on UserInputUnit should fail');
  // UserInputUnit has no template (no prompt or script)
  const e183Result = await runCli<GetTemplateResult>(['unit', 'get-template', 'sample-input']);
  assert(!e183Result.ok, 'Expected error for get-template on UserInputUnit');
  const e183Error = e183Result.errors.find((e) => e.code === 'E183');
  assert(!!e183Error, `Expected E183 error, got: ${JSON.stringify(e183Result.errors)}`);
  console.log('    E183 NoTemplate: UserInputUnit has no template');
}

// ============================================
// SECTION 15: Row 0 UserInputUnit (Phase 4)
// ============================================

/**
 * Verifies UserInputUnit on Line 0 is immediately ready as workflow entry point.
 * Per spec AC-10: E2E Section 15 (Row 0 UserInputUnit)
 *
 * Uses a separate test graph to avoid interfering with the main E2E flow.
 */
async function testRow0UserInput(): Promise<void> {
  section('Row 0 UserInputUnit Entry Point (Phase 4)');

  const altGraphSlug = 'e2e-user-input-test';

  step('15.1: Create alternate graph for UserInputUnit test');
  // Clean up any existing test graph
  await runCli(['delete', altGraphSlug]).catch(() => {});

  const createResult = await runCli<GraphCreateResult>(['create', altGraphSlug]);
  assert(createResult.ok, `Create failed: ${JSON.stringify(createResult.errors)}`);
  const altLine0 = unwrap(createResult.data?.lineId, 'altGraphResult.lineId');
  console.log(`    Alt graph created: ${altGraphSlug}, Line 0: ${altLine0}`);

  step('15.2: Add UserInputUnit (sample-input) to Line 0');
  const addResult = await runCli<AddNodeResult>([
    'node',
    'add',
    altGraphSlug,
    altLine0,
    'sample-input',
  ]);
  assert(addResult.ok, `Add node failed: ${JSON.stringify(addResult.errors)}`);
  const userInputNodeId = unwrap(addResult.data?.nodeId, 'addResult.nodeId');
  console.log(`    UserInputUnit node added: ${userInputNodeId}`);

  step('15.3: Verify UserInputUnit is immediately ready (Line 0 entry point)');
  const status = await runCli<StatusResult>(['status', altGraphSlug, '--node', userInputNodeId]);
  assert(status.data?.ready === true, 'UserInputUnit on Line 0 should be immediately ready');
  console.log(`    UserInputUnit ready: ${status.data?.ready} (entry point semantics verified)`);

  step('15.4: Complete UserInputUnit and verify outputs available');
  // Start the node
  const startResult = await runCli(['node', 'start', altGraphSlug, userInputNodeId]);
  assert(startResult.ok, `Start failed: ${JSON.stringify(startResult.errors)}`);

  // Save output (simulating user providing requirements)
  const saveResult = await runCli([
    'node',
    'save-output-data',
    altGraphSlug,
    userInputNodeId,
    'spec',
    '"Build a function that validates email addresses"',
  ]);
  assert(saveResult.ok, `Save output failed: ${JSON.stringify(saveResult.errors)}`);

  // Complete the node
  const endResult = await runCli(['node', 'end', altGraphSlug, userInputNodeId]);
  assert(endResult.ok, `End failed: ${JSON.stringify(endResult.errors)}`);

  // Verify output is available
  const outputResult = await runCli<GetOutputDataResult>([
    'node',
    'get-output-data',
    altGraphSlug,
    userInputNodeId,
    'spec',
  ]);
  assert(outputResult.ok, `Get output failed: ${JSON.stringify(outputResult.errors)}`);
  const outputValue = String(outputResult.data?.value ?? '');
  assert(outputValue.includes('email'), 'Output should contain the user-provided requirements');
  console.log(`    UserInputUnit output: "${outputValue.substring(0, 50)}..."`);

  step('15.5: Cleanup alternate test graph');
  await runCli(['delete', altGraphSlug]);
  console.log(`    Alt graph deleted: ${altGraphSlug}`);
}

// ============================================
// Cleanup
// ============================================

async function cleanup(): Promise<void> {
  step('Cleanup: Delete graph');
  await runCli(['delete', GRAPH_SLUG]).catch(() => {});

  step('Cleanup: Unregister workspace');
  await runWorkspaceCommand(['remove', 'e2e-test', '--force']).catch(() => {});
  console.log('    Workspace unregistered: e2e-test');

  step('Cleanup: Remove temp directory');
  if (workspacePath) {
    await fs.rm(workspacePath, { recursive: true, force: true });
    console.log(`    Temp directory removed: ${workspacePath}`);
  }
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  console.log('=== Positional Graph Execution Lifecycle E2E Test ===\n');
  console.log('Graph: 3 lines, 7 nodes');
  console.log('  Line 0: spec-builder [agent], spec-reviewer [agent] (serial)');
  console.log('  Line 1: coder [agent+Q&A], tester [agent] (serial, MANUAL gate to Line 2)');
  console.log(
    '  Line 2: alignment-tester, pr-preparer [agent] (PARALLEL) + PR-creator [code] (serial)'
  );
  console.log(
    '\nPhase 4 additions: Sections 13-15 verify unit types, reserved params, and Row 0 entry\n'
  );

  try {
    await setup();
    await testReadinessDetection();
    await testErrorCodes();
    await testUnitTypeVerification(); // Section 13: Unit type discrimination (Phase 4)
    await executeLine0();
    await executeLine1WithQA();
    await testReservedParameterRouting(); // Section 14: Reserved params (Phase 4)
    await testManualTransition();
    await testParallelExecution();
    await completePRCreator();
    await validateFinalState();
    await testRow0UserInput(); // Section 15: Row 0 UserInputUnit (Phase 4)

    console.log('\n=== ALL TESTS PASSED ===');
    console.log(`Total steps: ${stepNum}`);
    console.log('7 nodes complete across 3 lines:');
    console.log('  - spec-builder, spec-reviewer (serial) [agent]');
    console.log('  - coder (with Q&A), tester (serial) [agent]');
    console.log('  - alignment-tester, pr-preparer (parallel) [agent], PR-creator (serial) [code]');
    console.log('\nPhase 4 verified:');
    console.log('  - Section 13: Unit type discrimination (agent/code/user-input)');
    console.log('  - Section 14: Reserved parameter routing (main-prompt/main-script)');
    console.log('  - Section 15: Row 0 UserInputUnit entry point semantics');
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error('\n=== TEST FAILED ===');
  console.error(err instanceof Error ? err.message : String(err));
  cleanup().finally(() => process.exit(1));
});
