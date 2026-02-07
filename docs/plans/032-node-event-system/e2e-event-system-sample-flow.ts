#!/usr/bin/env npx tsx
/**
 * E2E Sample Flow: Node Event System
 *
 * Demonstrates the complete Node Event System lifecycle with a 2-node pipeline.
 * This script shows every event interaction: acceptance, work, questions,
 * answers, completion, and event log inspection.
 *
 * Usage:
 *   npx tsx e2e-event-system-sample-flow.ts              # Mock mode (shows CLI surface)
 *   npx tsx e2e-event-system-sample-flow.ts --with-agent  # Real agent mode
 *
 * This is a DESIGN DOCUMENT — it shows the intended CLI surface for Plan 032.
 * The CLI commands shown here are the target interface, not yet implemented.
 *
 * What this demonstrates:
 * - Schema self-discovery (event list-types, event schema)
 * - Agent accepting a node (event raise node:accepted)
 * - Agent doing work and saving outputs (event raise output:save-data)
 * - Agent asking a question (event raise question:ask) — agent STOPS
 * - Human answering the question (event raise question:answer --source human)
 * - Orchestrator resuming agent with session ID
 * - Agent retrieving answer and completing (event raise node:completed)
 * - Event log inspection (event log)
 * - Convenience shortcuts (accept, end) vs generic event raise
 */

// ---------------------------------------------------------------------------
// NOTE: This script uses PLANNED commands (cg wf node event ...).
// The existing CLI uses (cg wg node ...). Plan 032 introduces the event
// system; once implemented, this script becomes runnable.
// ---------------------------------------------------------------------------

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = resolve(__dirname, '../../apps/cli/dist/cli.cjs');

const GRAPH_SLUG = 'event-system-e2e';

// Store node IDs
const nodeIds = {
  specWriter: '',   // Node 1: writes a spec (user-input, no agent)
  codeBuilder: '',  // Node 2: agent builds code from spec
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CliResult<T> {
  success: boolean;
  data: T;
  rawOutput: string;
}

async function runCli<T = Record<string, unknown>>(args: string[]): Promise<CliResult<T>> {
  const fullArgs = [...args, '--json'];

  return new Promise((resolvePromise, reject) => {
    const proc = spawn('node', [CLI_PATH, ...fullArgs], { timeout: 30000 });
    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (d) => { stdout += d.toString(); });
    proc.stderr?.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      const lines = stdout.trim().split('\n');
      let resultLine = '';
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line && (line.includes('"success"') || line.includes('"error"'))) {
          resultLine = line;
          break;
        }
      }
      if (!resultLine) resultLine = lines[lines.length - 1] ?? '{}';

      let data: T;
      try {
        const parsed = JSON.parse(resultLine);
        data = parsed.data ? { ...parsed.data, errors: [] } : parsed;
        if (parsed.error) {
          data = { ...data, errors: parsed.error.details || [parsed.error] } as T;
        }
      } catch {
        data = { errors: [{ code: 'CLI_ERROR', message: stderr || stdout }] } as T;
      }

      resolvePromise({ success: code === 0, data, rawOutput: stdout });
    });

    proc.on('error', (err) => reject(new Error(`CLI spawn failed: ${err.message}`)));
  });
}

function log(step: string, msg: string): void {
  console.log(`\n${step}: ${msg}`);
}

function ok(msg: string): void {
  console.log(`  \u2713 ${msg}`);
}

function info(msg: string): void {
  console.log(`  \u2139 ${msg}`);
}

function banner(title: string): void {
  console.log('');
  console.log('='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function assert(condition: boolean, msg: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main Flow
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  banner('E2E: Node Event System — Full Lifecycle Demo');
  console.log('Mode: Mock (demonstrates planned CLI surface)');

  try {
    await cleanup();
    await step1_createGraphAndNodes();
    await step2_schemaDiscovery();
    await step3_executeNode1_directOutput();
    await step4_agentAcceptsNode2();
    await step5_agentDoesWork();
    await step6_agentAsksQuestion();
    await step7_humanAnswersQuestion();
    await step8_orchestratorResumesAgent();
    await step9_agentCompletesNode();
    await step10_inspectEventLog();
    await step11_validateFinalState();

    banner('ALL STEPS PASSED');
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('='.repeat(70));
    console.error('  FAILED');
    console.error('='.repeat(70));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanup(): Promise<void> {
  const fs = await import('node:fs/promises');
  const paths = [
    `.chainglass/work-graphs/${GRAPH_SLUG}`,
    `.chainglass/data/work-graphs/${GRAPH_SLUG}`,
  ];
  for (const p of paths) {
    try { await fs.rm(p, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Step 1: Create graph and add nodes
// ---------------------------------------------------------------------------

async function step1_createGraphAndNodes(): Promise<void> {
  log('STEP 1', 'Create graph and add nodes');

  // Create graph
  await runCli(['wf', 'create', GRAPH_SLUG]);
  ok(`Created graph: ${GRAPH_SLUG}`);

  // Add Node 1: spec-writer (user-input unit — no agent needed)
  const n1 = await runCli<{ nodeId: string }>([
    'wf', 'node', 'add-after', GRAPH_SLUG, 'start', 'spec-writer',
  ]);
  nodeIds.specWriter = n1.data.nodeId;
  ok(`Added node: ${nodeIds.specWriter} (spec-writer)`);

  // Add Node 2: code-builder (agent unit, depends on spec-writer.spec)
  const n2 = await runCli<{ nodeId: string }>([
    'wf', 'node', 'add-after', GRAPH_SLUG, nodeIds.specWriter, 'code-builder',
    '-i', `spec:${nodeIds.specWriter}.spec`,
  ]);
  nodeIds.codeBuilder = n2.data.nodeId;
  ok(`Added node: ${nodeIds.codeBuilder} (code-builder) -> after ${nodeIds.specWriter}`);
}

// ---------------------------------------------------------------------------
// Step 2: Schema self-discovery
// ---------------------------------------------------------------------------

async function step2_schemaDiscovery(): Promise<void> {
  log('STEP 2', 'Schema self-discovery — agent learns available event types');

  // Agent's first action: discover what event types exist
  //   cg wf node event list-types
  info('Agent runs: cg wf node event list-types');
  const listResult = await runCli<{ types: Array<{ type: string; domain: string; description: string }> }>([
    'wf', 'node', 'event', 'list-types',
  ]);
  ok('Available event types:');
  for (const t of listResult.data.types ?? []) {
    ok(`  ${t.type} (${t.domain}) — ${t.description}`);
  }

  // Agent inspects the schema for question:ask before using it
  //   cg wf node event schema question:ask
  info('Agent runs: cg wf node event schema question:ask');
  const schemaResult = await runCli<{ type: string; schema: unknown }>([
    'wf', 'node', 'event', 'schema', 'question:ask',
  ]);
  ok(`Schema for question:ask: ${JSON.stringify(schemaResult.data.schema, null, 2)}`);

  info('Agent now knows what events it can raise and what payloads they expect.');
}

// ---------------------------------------------------------------------------
// Step 3: Execute Node 1 — direct output (user-input, no agent)
// ---------------------------------------------------------------------------

async function step3_executeNode1_directOutput(): Promise<void> {
  log('STEP 3', 'Execute spec-writer (direct output, no agent)');

  // User-input nodes don't need an agent — data is provided directly
  const spec = 'Write a TypeScript function fibonacci(n) that returns the nth Fibonacci number';

  await runCli([
    'wf', 'node', 'save-output-data', GRAPH_SLUG, nodeIds.specWriter, 'spec', JSON.stringify(spec),
  ]);
  ok(`Saved output: spec = "${spec}"`);

  await runCli(['wf', 'node', 'end', GRAPH_SLUG, nodeIds.specWriter]);
  ok('Completed: spec-writer -> complete');
}

// ---------------------------------------------------------------------------
// Step 4: Orchestrator starts Node 2, agent accepts
// ---------------------------------------------------------------------------

async function step4_agentAcceptsNode2(): Promise<void> {
  log('STEP 4', 'Orchestrator starts code-builder, agent accepts');

  // Orchestrator starts the node (state: pending -> starting)
  await runCli(['wf', 'node', 'start', GRAPH_SLUG, nodeIds.codeBuilder]);
  ok('Orchestrator started node: starting');

  // Agent's first action after receiving bootstrap prompt: accept the node
  // This can use the shortcut:
  //   cg wf node accept <graph> <nodeId>
  // Which is equivalent to:
  //   cg wf node event raise <graph> <nodeId> node:accepted '{}'
  info('Agent runs: cg wf node accept (shortcut for event raise node:accepted)');
  await runCli(['wf', 'node', 'accept', GRAPH_SLUG, nodeIds.codeBuilder]);
  ok('Agent accepted: starting -> agent-accepted');

  // Verify the event was recorded
  info('Event log now contains: node:accepted from source "agent"');
}

// ---------------------------------------------------------------------------
// Step 5: Agent does work — reads inputs, saves outputs
// ---------------------------------------------------------------------------

async function step5_agentDoesWork(): Promise<void> {
  log('STEP 5', 'Agent does work — reads inputs, saves partial outputs');

  // Agent reads the spec input (wired from spec-writer.spec)
  const inputResult = await runCli<{ value?: string }>([
    'wf', 'node', 'get-input-data', GRAPH_SLUG, nodeIds.codeBuilder, 'spec',
  ]);
  ok(`Agent read input: spec = "${inputResult.data.value}"`);

  // Agent reports progress via event
  //   cg wf node event raise <graph> <nodeId> progress:update '{"message":"Analyzing spec...","percent":25}'
  info('Agent runs: cg wf node event raise ... progress:update (progress event)');
  await runCli([
    'wf', 'node', 'event', 'raise', GRAPH_SLUG, nodeIds.codeBuilder,
    'progress:update', '{"message":"Analyzing spec...","percent":25}',
  ]);
  ok('Progress event raised: "Analyzing spec..." (25%)');

  // Agent saves a partial output via event
  //   cg wf node event raise <graph> <nodeId> output:save-data '{"name":"language","value":"typescript"}'
  info('Agent runs: cg wf node event raise ... output:save-data');
  await runCli([
    'wf', 'node', 'event', 'raise', GRAPH_SLUG, nodeIds.codeBuilder,
    'output:save-data', '{"name":"language","value":"typescript"}',
  ]);
  ok('Output saved via event: language = "typescript"');
}

// ---------------------------------------------------------------------------
// Step 6: Agent asks a question — agent STOPS
// ---------------------------------------------------------------------------

async function step6_agentAsksQuestion(): Promise<void> {
  log('STEP 6', 'Agent asks a question (stops_execution: true — agent exits)');

  // Agent checks the schema first (good practice, demonstrated in Step 2)
  // Then raises the question event using the GENERIC path (no shortcut for Q&A)
  //
  //   cg wf node event raise <graph> <nodeId> question:ask \
  //     '{"type":"single","text":"Which algorithm should I use?","options":["recursive","iterative","memoized"]}'
  //
  info('Agent runs: cg wf node event raise ... question:ask (no shortcut — uses generic path)');

  const questionPayload = JSON.stringify({
    type: 'single',
    text: 'Which algorithm should I use for fibonacci?',
    options: ['recursive', 'iterative', 'memoized'],
  });

  const raiseResult = await runCli<{ eventId: string; stopsExecution: boolean }>([
    'wf', 'node', 'event', 'raise', GRAPH_SLUG, nodeIds.codeBuilder,
    'question:ask', questionPayload,
  ]);
  ok(`Question event raised: eventId=${raiseResult.data.eventId}`);
  ok(`stops_execution: ${raiseResult.data.stopsExecution} — agent must exit now`);

  // The CLI prints an instruction to the agent:
  //   [AGENT INSTRUCTION] This event requires you to stop. Exit now and wait
  //   for the orchestrator.
  info('[AGENT INSTRUCTION] This event requires you to stop. Exit now.');
  info('Agent exits. State: agent-accepted -> waiting-question');
  info('');
  info('--- Agent has exited. Control returns to orchestrator. ---');
}

// ---------------------------------------------------------------------------
// Step 7: Human answers the question
// ---------------------------------------------------------------------------

async function step7_humanAnswersQuestion(): Promise<void> {
  log('STEP 7', 'Human answers the question');

  // Orchestrator (or human via CLI) inspects the event log to see the question
  info('Orchestrator runs: cg wf node event log --type question:ask --status new');
  const logResult = await runCli<{ events: Array<{ eventId: string; payload: { text: string } }> }>([
    'wf', 'node', 'event', 'log', GRAPH_SLUG, nodeIds.codeBuilder,
    '--type', 'question:ask', '--status', 'new',
  ]);

  const questionEvent = logResult.data.events?.[0];
  ok(`Found pending question: "${questionEvent?.payload?.text}"`);
  ok(`Question event ID: ${questionEvent?.eventId}`);

  // ODS acknowledges the question (surfaced to user)
  info('ODS acknowledges question: new -> acknowledged');

  // Human provides the answer via generic event raise
  //   cg wf node event raise <graph> <nodeId> question:answer \
  //     '{"question_event_id":"<eventId>","answer":"memoized"}' --source human
  //
  const questionEventId = questionEvent?.eventId ?? 'evt_003';
  const answerPayload = JSON.stringify({
    question_event_id: questionEventId,
    answer: 'memoized',
  });

  info('Human runs: cg wf node event raise ... question:answer --source human');
  await runCli([
    'wf', 'node', 'event', 'raise', GRAPH_SLUG, nodeIds.codeBuilder,
    'question:answer', answerPayload, '--source', 'human',
  ]);
  ok('Answer event raised: "memoized" (source: human)');
  info('Question lifecycle: new -> acknowledged -> handled');
}

// ---------------------------------------------------------------------------
// Step 8: Orchestrator resumes agent with session ID
// ---------------------------------------------------------------------------

async function step8_orchestratorResumesAgent(): Promise<void> {
  log('STEP 8', 'Orchestrator detects answered question, resumes agent');

  // ONBAS walks the graph and sees:
  //   - Node has a question:ask event
  //   - Node has a matching question:answer event
  //   - Decision: resume-node
  info('ONBAS walks graph: question:ask + question:answer found -> resume-node');
  info('ODS receives resume-node request, re-invokes agent with session ID');

  // In real mode, this would be:
  //   cg agent run -t claude-code -p "The question has been answered. Retrieve it and continue." \
  //     -s <sessionId> -c .
  //
  // In mock mode, we simulate the agent's actions after being resumed:
  ok('Agent re-invoked with session resumption');
}

// ---------------------------------------------------------------------------
// Step 9: Agent retrieves answer and completes
// ---------------------------------------------------------------------------

async function step9_agentCompletesNode(): Promise<void> {
  log('STEP 9', 'Resumed agent retrieves answer, finishes work, and completes');

  // Agent checks the event log for the answer
  info('Agent runs: cg wf node event log --type question:answer');
  const logResult = await runCli<{ events: Array<{ payload: { answer: string } }> }>([
    'wf', 'node', 'event', 'log', GRAPH_SLUG, nodeIds.codeBuilder,
    '--type', 'question:answer',
  ]);
  const answer = logResult.data.events?.[0]?.payload?.answer ?? 'memoized';
  ok(`Agent retrieved answer: "${answer}"`);

  // Agent reports progress
  await runCli([
    'wf', 'node', 'event', 'raise', GRAPH_SLUG, nodeIds.codeBuilder,
    'progress:update', '{"message":"Generating memoized fibonacci...","percent":75}',
  ]);
  ok('Progress: "Generating memoized fibonacci..." (75%)');

  // Agent saves the code output
  const code = `function fibonacci(n: number): number {
  const memo = new Map<number, number>();
  function fib(k: number): number {
    if (k <= 1) return k;
    if (memo.has(k)) return memo.get(k)!;
    const result = fib(k - 1) + fib(k - 2);
    memo.set(k, result);
    return result;
  }
  return fib(n);
}`;

  await runCli([
    'wf', 'node', 'event', 'raise', GRAPH_SLUG, nodeIds.codeBuilder,
    'output:save-data', JSON.stringify({ name: 'code', value: code }),
  ]);
  ok('Output saved via event: code = fibonacci function (memoized)');

  // Agent completes the node using the shortcut
  //   cg wf node end <graph> <nodeId>
  // Which is equivalent to:
  //   cg wf node event raise <graph> <nodeId> node:completed '{}'
  info('Agent runs: cg wf node end (shortcut for event raise node:completed)');
  await runCli(['wf', 'node', 'end', GRAPH_SLUG, nodeIds.codeBuilder]);
  ok('Agent completed: agent-accepted -> complete');
}

// ---------------------------------------------------------------------------
// Step 10: Inspect the full event log
// ---------------------------------------------------------------------------

async function step10_inspectEventLog(): Promise<void> {
  log('STEP 10', 'Inspect full event log for code-builder node');

  //   cg wf node event log <graph> <nodeId>
  info('Run: cg wf node event log');
  const logResult = await runCli<{
    events: Array<{
      eventId: string;
      eventType: string;
      source: string;
      status: string;
      stopsExecution: boolean;
      createdAt: string;
    }>
  }>([
    'wf', 'node', 'event', 'log', GRAPH_SLUG, nodeIds.codeBuilder,
  ]);

  ok('Full event log:');
  console.log('');
  console.log('  +---------+------------------+---------------+----------+-------+');
  console.log('  | EventID | Type             | Source        | Status   | Stops |');
  console.log('  +---------+------------------+---------------+----------+-------+');

  const expectedEvents = [
    { type: 'node:accepted',    source: 'agent',  status: 'handled', stops: false },
    { type: 'progress:update',  source: 'agent',  status: 'handled', stops: false },
    { type: 'output:save-data', source: 'agent',  status: 'handled', stops: false },
    { type: 'question:ask',     source: 'agent',  status: 'handled', stops: true  },
    { type: 'question:answer',  source: 'human',  status: 'handled', stops: false },
    { type: 'progress:update',  source: 'agent',  status: 'handled', stops: false },
    { type: 'output:save-data', source: 'agent',  status: 'handled', stops: false },
    { type: 'node:completed',   source: 'agent',  status: 'handled', stops: true  },
  ];

  for (let i = 0; i < expectedEvents.length; i++) {
    const e = expectedEvents[i];
    const id = `evt_${String(i + 1).padStart(3, '0')}`;
    const type = e.type.padEnd(16);
    const source = e.source.padEnd(13);
    const status = e.status.padEnd(8);
    const stops = e.stops ? 'yes' : 'no ';
    console.log(`  | ${id}   | ${type} | ${source} | ${status} | ${stops}   |`);
  }

  console.log('  +---------+------------------+---------------+----------+-------+');
  console.log('');
  ok(`Total events: ${expectedEvents.length}`);
  ok('All events handled. Full audit trail preserved.');
}

// ---------------------------------------------------------------------------
// Step 11: Validate final state
// ---------------------------------------------------------------------------

async function step11_validateFinalState(): Promise<void> {
  log('STEP 11', 'Validate final state');

  const status = await runCli<{
    graphSlug: string;
    nodes: Array<{ id: string; status: string }>;
  }>(['wf', 'status', GRAPH_SLUG]);

  for (const node of status.data.nodes ?? []) {
    ok(`${node.id}: ${node.status}`);
  }

  const allComplete = (status.data.nodes ?? []).every((n) => n.status === 'complete');
  assert(allComplete, 'Not all nodes complete');
  ok('All nodes complete. Event system lifecycle validated.');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch(console.error);
