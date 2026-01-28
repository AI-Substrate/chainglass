#!/usr/bin/env npx tsx
/**
 * E2E Sample Flow Test Harness
 *
 * Tests the complete WorkGraph lifecycle with a 3-node code generation pipeline.
 *
 * Usage:
 *   npx tsx e2e-sample-flow.ts           # Mock mode (fast, no real agents)
 *   npx tsx e2e-sample-flow.ts --with-agent  # Real agent mode (requires API keys)
 *
 * This script validates:
 * - Graph creation and node addition
 * - Direct output pattern (PENDING -> COMPLETE without start)
 * - Agent question/answer handover
 * - Cross-node data and file flow
 * - Pipeline completion and result reading
 */

import {
  assert,
  getLatestQuestionId,
  logError,
  logStep,
  logSuccess,
  pollForStatus,
  runCli,
  sleep,
} from './lib/cli-runner.js';
import type {
  AddNodeData,
  AnswerData,
  AskData,
  CanEndData,
  CanRunData,
  EndData,
  GetOutputDataData,
  GraphCreateData,
  GraphStatusData,
  SaveOutputDataData,
} from './lib/types.js';

const GRAPH_SLUG = 'sample-e2e';

// Store generated node IDs (populated by addNodes)
const nodeIds = {
  node1: '', // sample-input
  node2: '', // sample-coder
  node3: '', // sample-tester
};

// Parse command line args
const args = process.argv.slice(2);
const withAgent = args.includes('--with-agent');
const verbose = !args.includes('--quiet');

async function main(): Promise<void> {
  console.log('='.repeat(65));
  console.log('           E2E Test: Sample Code Generation Flow');
  console.log('='.repeat(65));
  console.log(`Mode: ${withAgent ? 'Real Agent' : 'Mock (no real agents)'}`);
  console.log('');

  try {
    // Cleanup any existing graph from previous runs
    await cleanup();

    // Step 1: Create graph
    await createGraph();

    // Step 2: Add nodes
    await addNodes();

    // Step 3: Execute Node 1 - Direct Output Pattern
    await executeNode1DirectOutput();

    // Step 4: Execute Node 2 - Agent with Question (or Mock)
    await executeNode2AgentWithQuestion();

    // Step 5: Execute Node 3 - Agent Runs Script (or Mock)
    await executeNode3AgentRunsScript();

    // Step 6: Read pipeline result
    const success = await readPipelineResult();

    // Step 7: Validate final state
    await validateFinalState();

    // Report result
    console.log('');
    console.log('='.repeat(65));
    if (success) {
      console.log('                    TEST PASSED');
    } else {
      console.log('                    TEST FAILED');
    }
    console.log('='.repeat(65));

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('');
    console.error('='.repeat(65));
    console.error('                    TEST ERROR');
    console.error('='.repeat(65));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function cleanup(): Promise<void> {
  // Try to delete existing graph (ignore errors if it doesn't exist)
  await runCli(['wg', 'delete', GRAPH_SLUG, '--force']);
}

async function createGraph(): Promise<void> {
  logStep('STEP 1', 'Create Graph');

  const result = await runCli<GraphCreateData>(['wg', 'create', GRAPH_SLUG]);
  assert(result.success, `Failed to create graph: ${JSON.stringify(result.data.errors)}`);
  logSuccess(`Created graph: ${GRAPH_SLUG}`);
}

async function addNodes(): Promise<void> {
  logStep('STEP 2', 'Add Nodes');

  // Node 1: sample-input (after start node, which is auto-created)
  // Units are in .chainglass/units/ so just use the slug
  const node1 = await runCli<AddNodeData>([
    'wg',
    'node',
    'add-after',
    GRAPH_SLUG,
    'start',
    'sample-input',
  ]);
  assert(node1.success, `Failed to add sample-input: ${JSON.stringify(node1.data.errors)}`);
  const node1Id = node1.data.nodeId;
  logSuccess(`Added node: ${node1Id} (sample-input)`);

  // Node 2: sample-coder - after node1, with input mapping
  const node2 = await runCli<AddNodeData>([
    'wg',
    'node',
    'add-after',
    GRAPH_SLUG,
    node1Id,
    'sample-coder',
    '-i',
    `spec:${node1Id}.spec`,
  ]);
  assert(node2.success, `Failed to add sample-coder: ${JSON.stringify(node2.data.errors)}`);
  const node2Id = node2.data.nodeId;
  logSuccess(`Added node: ${node2Id} (sample-coder) -> after ${node1Id}`);

  // Node 3: sample-tester - after node2, with input mappings
  const node3 = await runCli<AddNodeData>([
    'wg',
    'node',
    'add-after',
    GRAPH_SLUG,
    node2Id,
    'sample-tester',
    '-i',
    `language:${node2Id}.language`,
    '-i',
    `script:${node2Id}.script`,
  ]);
  assert(node3.success, `Failed to add sample-tester: ${JSON.stringify(node3.data.errors)}`);
  const node3Id = node3.data.nodeId;
  logSuccess(`Added node: ${node3Id} (sample-tester) -> after ${node2Id}`);

  // Store node IDs for later use
  nodeIds.node1 = node1Id;
  nodeIds.node2 = node2Id;
  nodeIds.node3 = node3Id;
}

async function executeNode1DirectOutput(): Promise<void> {
  logStep('STEP 3', 'Execute get-spec (Direct Output)');

  // Check can-run
  const canRun = await runCli<CanRunData>(['wg', 'node', 'can-run', GRAPH_SLUG, nodeIds.node1]);
  assert(canRun.success && canRun.data.canRun, 'get-spec should be runnable (no upstream deps)');
  logSuccess('can-run: true (no upstream dependencies)');

  // Save output directly (no start needed!)
  const spec = 'Write a function add(a, b) that returns the sum of two numbers';
  const saveResult = await runCli<SaveOutputDataData>([
    'wg',
    'node',
    'save-output-data',
    GRAPH_SLUG,
    nodeIds.node1,
    'spec',
    JSON.stringify(spec),
  ]);
  assert(saveResult.success && saveResult.data.saved, 'Failed to save spec output');
  logSuccess(`Saved output: spec = "${spec}"`);

  // Check can-end
  const canEnd = await runCli<CanEndData>(['wg', 'node', 'can-end', GRAPH_SLUG, nodeIds.node1]);
  assert(canEnd.success && canEnd.data.canEnd, 'get-spec should be able to end');
  logSuccess('can-end: true (spec output present)');

  // End the node (PENDING -> COMPLETE, no start needed!)
  const endResult = await runCli<EndData>(['wg', 'node', 'end', GRAPH_SLUG, nodeIds.node1]);
  assert(endResult.success && endResult.data.status === 'complete', 'Failed to end get-spec');
  logSuccess('Completed: get-spec -> complete (no start needed!)');
}

async function executeNode2AgentWithQuestion(): Promise<void> {
  logStep('STEP 4', 'Execute generate-code (Agent with Question)');

  // Check can-run
  const canRun = await runCli<CanRunData>(['wg', 'node', 'can-run', GRAPH_SLUG, nodeIds.node2]);
  assert(
    canRun.success && canRun.data.canRun,
    `generate-code should be runnable: ${JSON.stringify(canRun.data)}`
  );
  logSuccess('can-run: true (get-spec is complete)');

  if (withAgent) {
    // Real agent mode - invoke actual agent
    await executeNode2WithRealAgent();
  } else {
    // Mock mode - simulate agent behavior
    await executeNode2Mock();
  }
}

async function executeNode2Mock(): Promise<void> {
  // Start the node
  await runCli(['wg', 'node', 'start', GRAPH_SLUG, nodeIds.node2]);
  logSuccess('Started: generate-code -> running');

  // Mock: Ask the language question using real CLI (per didyouknow insight #3)
  const askResult = await runCli<AskData>([
    'wg',
    'node',
    'ask',
    GRAPH_SLUG,
    nodeIds.node2,
    '--type',
    'single',
    '--text',
    'Which programming language should I use?',
    '--options',
    'typescript',
    'javascript',
    'python',
    'bash',
  ]);
  assert(askResult.success, `Failed to ask question: ${JSON.stringify(askResult.data.errors)}`);
  logSuccess(`Asked question: "${askResult.data.question.text}"`);

  // Mock: Answer with "bash" (auto-answer)
  const questionId = askResult.data.questionId;
  const answerResult = await runCli<AnswerData>([
    'wg',
    'node',
    'answer',
    GRAPH_SLUG,
    nodeIds.node2,
    questionId,
    '"bash"',
  ]);
  assert(answerResult.success, `Failed to answer: ${JSON.stringify(answerResult.data.errors)}`);
  logSuccess('Auto-answered: "bash"');

  // Mock: Generate a simple add function script
  const fs = await import('node:fs/promises');
  const scriptContent = `#!/bin/bash
# add.sh - adds two numbers
add() {
  echo $(($1 + $2))
}
add 2 3
`;
  const scriptPath = '/tmp/add.sh';
  await fs.writeFile(scriptPath, scriptContent);
  logSuccess('Generated mock script: add.sh');

  // Save outputs
  await runCli(['wg', 'node', 'save-output-data', GRAPH_SLUG, nodeIds.node2, 'language', '"bash"']);
  logSuccess('Saved output: language = "bash"');

  await runCli(['wg', 'node', 'save-output-file', GRAPH_SLUG, nodeIds.node2, 'script', scriptPath]);
  logSuccess('Saved output: script = add.sh');

  // End the node
  const endResult = await runCli<EndData>(['wg', 'node', 'end', GRAPH_SLUG, nodeIds.node2]);
  assert(endResult.success && endResult.data.status === 'complete', 'Failed to end generate-code');
  logSuccess('Completed: generate-code -> complete');
}

async function executeNode2WithRealAgent(): Promise<void> {
  // Start the node
  await runCli(['wg', 'node', 'start', GRAPH_SLUG, nodeIds.node2]);
  logSuccess('Started: generate-code -> running');

  // TODO: Invoke real agent with cg agent run
  // For now, use mock implementation
  console.log('  (Real agent mode not yet implemented - using mock)');
  await executeNode2Mock();
}

async function executeNode3AgentRunsScript(): Promise<void> {
  logStep('STEP 5', 'Execute run-verify (Agent Runs Script)');

  // Check can-run
  const canRun = await runCli<CanRunData>(['wg', 'node', 'can-run', GRAPH_SLUG, nodeIds.node3]);
  assert(
    canRun.success && canRun.data.canRun,
    `run-verify should be runnable: ${JSON.stringify(canRun.data)}`
  );
  logSuccess('can-run: true (generate-code is complete)');

  if (withAgent) {
    await executeNode3WithRealAgent();
  } else {
    await executeNode3Mock();
  }
}

async function executeNode3Mock(): Promise<void> {
  // Start the node
  await runCli(['wg', 'node', 'start', GRAPH_SLUG, nodeIds.node3]);
  logSuccess('Started: run-verify -> running');

  // Get inputs (for validation)
  const langResult = await runCli<{ value?: string }>([
    'wg',
    'node',
    'get-input-data',
    GRAPH_SLUG,
    nodeIds.node3,
    'language',
  ]);
  logSuccess(`Got input: language = "${langResult.data.value}"`);

  const scriptResult = await runCli<{ filePath?: string }>([
    'wg',
    'node',
    'get-input-file',
    GRAPH_SLUG,
    nodeIds.node3,
    'script',
  ]);
  logSuccess(`Got input: script = "${scriptResult.data.filePath}"`);

  // Mock: Execute the script and capture output
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  let success = true;
  let output = '';

  try {
    const scriptPath = scriptResult.data.filePath;
    if (scriptPath) {
      const result = await execAsync(`bash "${scriptPath}"`);
      output = result.stdout.trim();
      logSuccess(`Executed script, output: "${output}"`);
    } else {
      throw new Error('Script path not available');
    }
  } catch (error) {
    success = false;
    output = error instanceof Error ? error.message : String(error);
    logError(`Script execution failed: ${output}`);
  }

  // Save outputs
  await runCli([
    'wg',
    'node',
    'save-output-data',
    GRAPH_SLUG,
    nodeIds.node3,
    'success',
    success.toString(),
  ]);
  logSuccess(`Saved output: success = ${success}`);

  await runCli([
    'wg',
    'node',
    'save-output-data',
    GRAPH_SLUG,
    nodeIds.node3,
    'output',
    JSON.stringify(output),
  ]);
  logSuccess(`Saved output: output = "${output}"`);

  // End the node
  const endResult = await runCli<EndData>(['wg', 'node', 'end', GRAPH_SLUG, nodeIds.node3]);
  assert(endResult.success && endResult.data.status === 'complete', 'Failed to end run-verify');
  logSuccess('Completed: run-verify -> complete');
}

async function executeNode3WithRealAgent(): Promise<void> {
  // Start the node
  await runCli(['wg', 'node', 'start', GRAPH_SLUG, nodeIds.node3]);
  logSuccess('Started: run-verify -> running');

  // TODO: Invoke real agent
  console.log('  (Real agent mode not yet implemented - using mock)');
  await executeNode3Mock();
}

async function readPipelineResult(): Promise<boolean> {
  logStep('STEP 6', 'Read Pipeline Result');

  // Read success output
  const successResult = await runCli<GetOutputDataData>([
    'wg',
    'node',
    'get-output-data',
    GRAPH_SLUG,
    nodeIds.node3,
    'success',
  ]);
  const pipelineSuccess = successResult.data.value === true || successResult.data.value === 'true';
  logSuccess(`success = ${pipelineSuccess}`);

  // Read output
  const outputResult = await runCli<GetOutputDataData>([
    'wg',
    'node',
    'get-output-data',
    GRAPH_SLUG,
    nodeIds.node3,
    'output',
  ]);
  const scriptOutput = outputResult.data.value as string;
  logSuccess(`output = "${scriptOutput}"`);

  return pipelineSuccess;
}

async function validateFinalState(): Promise<void> {
  logStep('STEP 7', 'Validate Final State');

  const status = await runCli<GraphStatusData>(['wg', 'status', GRAPH_SLUG]);
  assert(status.success, `Failed to get status: ${JSON.stringify(status.data.errors)}`);

  const allComplete = status.data.nodes.every((n) => n.status === 'complete');
  assert(allComplete, `Not all nodes complete: ${JSON.stringify(status.data.nodes)}`);

  logSuccess('All nodes complete');
  for (const node of status.data.nodes) {
    logSuccess(`  ${node.id}: ${node.status}`);
  }
}

// Run
main().catch(console.error);
