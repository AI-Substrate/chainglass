/**
 * Advanced Pipeline E2E — Real Copilot Agents
 *
 * Drives a 6-node, 4-line graph with real Copilot agents:
 *   Line 0: [human-input]           — user provides requirements
 *   Line 1: [spec-writer]           — asks Q&A, writes spec + language params
 *   Line 2: [programmer-a] [programmer-b]  — parallel, fresh sessions (noContext)
 *   Line 3: [reviewer] [summariser] — serial, context chain from spec-writer
 *
 * Proves: Q&A loops, parallel fan-out, context isolation, global session
 * inheritance, and the left-hand rule.
 *
 * Run: npx tsx scripts/test-advanced-pipeline.ts
 *      npx tsx scripts/test-advanced-pipeline.ts --interactive
 */

import {
  buildDiskWorkUnitService,
  withTestGraph,
} from '../dev/test-graphs/shared/graph-test-runner.js';
import {
  assertGraphComplete,
  assertNodeComplete,
  assertOutputExists,
} from '../dev/test-graphs/shared/assertions.js';
import {
  answerNodeQuestion,
  completeUserInputNode,
  ensureGraphsDir,
} from '../dev/test-graphs/shared/helpers.js';

import {
  AgentContextService,
  ODS,
  ONBAS,
  OrchestrationService,
  PodManager,
  ScriptRunner,
  buildPositionalGraphReality,
} from '@chainglass/positional-graph/features/030-orchestration';
import type { DriveEvent } from '@chainglass/positional-graph/features/030-orchestration';
import {
  EventHandlerService,
  FakeNodeEventRegistry,
  NodeEventService,
  createEventHandlerRegistry,
  registerCoreEventTypes,
} from '@chainglass/positional-graph/features/032-node-event-system';
import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
import { NodeFileSystemAdapter, SdkCopilotAdapter } from '@chainglass/shared';
import type { AgentRunOptions, AgentResult, IAgentAdapter, IAgentManagerService } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { CopilotClient } from '@github/copilot-sdk';
import { AgentManagerService } from '@chainglass/shared/features/034-agentic-cli';

// ─── CLI Flags ──────────────────────────────────────────────────────
const INTERACTIVE = process.argv.includes('--interactive');
if (process.argv.includes('--help')) {
  console.log('Usage: npx tsx scripts/test-advanced-pipeline.ts [--interactive]');
  console.log('  --interactive  Prompt for Q&A answers at terminal (default: scripted)');
  process.exit(0);
}

// ─── Model ──────────────────────────────────────────────────────────
const MODEL = process.env.CG_MODEL ?? 'claude-sonnet-4.6';

// ─── Colours ────────────────────────────────────────────────────────
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const BLUE = '\x1b[34m';

const COLOURS = [BLUE, MAGENTA, CYAN, YELLOW, GREEN];

function elapsed(start: number): string {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`;
}

// ─── §2: VerboseCopilotAdapter (streams raw SDK events) ─────────────
class VerboseCopilotAdapter implements IAgentAdapter {
  private inner: SdkCopilotAdapter;
  private client: CopilotClient;
  private nodeLabel: string;
  private colour: string;
  private startTime: number;

  constructor(client: CopilotClient, label: string, colour: string, startTime: number) {
    this.inner = new SdkCopilotAdapter(client);
    this.client = client;
    this.nodeLabel = label;
    this.colour = colour;
    this.startTime = startTime;
  }

  private tag(): string {
    const t = ((Date.now() - this.startTime) / 1000).toFixed(1);
    return `${DIM}[${t}]${RESET} ${this.colour}[${this.nodeLabel}]${RESET}`;
  }

  async run(options: AgentRunOptions): Promise<AgentResult> {
    console.log(`${this.tag()} ${BOLD}Starting agent run${RESET}`);
    if (options.cwd) console.log(`${this.tag()} ${DIM}cwd: ${options.cwd}${RESET}`);

    const session = options.sessionId
      ? await this.client.resumeSession(options.sessionId)
      : await this.client.createSession({ model: MODEL, streaming: true });

    console.log(`${this.tag()} ${CYAN}Session: ${session.sessionId}${RESET}${options.sessionId ? ' (resumed)' : ' (new)'}`);

    let output = '';
    let toolCount = 0;

    session.on((event: any) => {
      switch (event.type) {
        case 'assistant.reasoning_delta': {
          const d = event.data as { deltaContent: string };
          if (d.deltaContent.trim()) {
            process.stdout.write(`${DIM}${d.deltaContent}${RESET}`);
          }
          break;
        }
        case 'assistant.message_delta': {
          const d = event.data as { deltaContent: string };
          process.stdout.write(`${YELLOW}${d.deltaContent}${RESET}`);
          break;
        }
        case 'assistant.message': {
          const d = event.data as { content: string };
          output = d.content;
          break;
        }
        case 'tool.execution_start': {
          toolCount++;
          const d = event.data as { toolName: string; arguments?: unknown };
          const args = typeof d.arguments === 'string'
            ? d.arguments.slice(0, 300)
            : JSON.stringify(d.arguments ?? '').slice(0, 300);
          console.log(`\n${this.tag()} ${MAGENTA}🔧 ${d.toolName}${RESET} ${DIM}${args}${RESET}`);
          break;
        }
        case 'tool.execution_complete': {
          const d = event.data as { success: boolean; result?: { content?: string } };
          const preview = d.result?.content?.slice(0, 200) ?? '';
          console.log(`${this.tag()} ${d.success ? GREEN + '✓' : RED + '✗'}${RESET} tool done ${DIM}${preview}${RESET}`);
          break;
        }
        case 'session.error': {
          const d = event.data as { errorType: string; message: string };
          console.log(`${this.tag()} ${RED}❌ ERROR: ${d.errorType}: ${d.message}${RESET}`);
          break;
        }
        case 'assistant.turn_start':
        case 'assistant.turn_end':
        case 'assistant.usage':
        case 'session.idle':
        case 'assistant.reasoning':
        case 'pending_messages.modified':
        case 'user.message':
        case 'session.usage_info':
        case 'tool.execution_partial_result':
          break;
        default:
          break;
      }
    });

    try {
      await session.sendAndWait({ prompt: options.prompt.trim() });
      console.log(`\n${this.tag()} ${GREEN}✓ Agent completed${RESET} (${toolCount} tool calls)`);
      return { output, sessionId: session.sessionId, status: 'completed', exitCode: 0, tokens: null };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`\n${this.tag()} ${RED}✗ Agent FAILED: ${msg}${RESET}`);
      return { output: msg, sessionId: session.sessionId, status: 'failed', exitCode: 1, tokens: null };
    } finally {
      await session.destroy();
    }
  }

  async terminate(): Promise<void> {
    return this.inner.terminate();
  }
}

// ─── §3: QuestionWatcher ────────────────────────────────────────────
interface ScriptedAnswer {
  match: string;
  answer: string;
  label: string;
}

class QuestionWatcher {
  private scriptedAnswers: ScriptedAnswer[];
  private interactive: boolean;
  private answeredQuestions = new Set<string>();

  constructor(answers: ScriptedAnswer[], interactive = false) {
    this.scriptedAnswers = answers;
    this.interactive = interactive;
  }

  async check(
    service: IPositionalGraphService,
    ctx: WorkspaceContext,
    graphSlug: string,
  ): Promise<boolean> {
    const statusResult = await service.getStatus(ctx, graphSlug);
    const state = await service.loadGraphState(ctx, graphSlug);
    const reality = buildPositionalGraphReality({
      statusResult,
      state,
      snapshotAt: new Date().toISOString(),
    });

    for (const q of reality.pendingQuestions) {
      if (this.answeredQuestions.has(q.questionId)) continue;

      console.log(`\n${YELLOW}${BOLD}⏸️  QUESTION from ${q.nodeId}:${RESET}`);
      console.log(`   "${q.text}"`);

      let answer: string;

      if (this.interactive) {
        answer = await this.promptHuman(q.text);
        console.log(`   ${GREEN}✍ You answered: "${answer}"${RESET}\n`);
      } else {
        const scripted = this.scriptedAnswers.find((a) =>
          q.text.toLowerCase().includes(a.match.toLowerCase()),
        );
        if (!scripted) {
          console.log(`   ${RED}⚠ No scripted answer matches — skipping${RESET}`);
          continue;
        }
        answer = scripted.answer;
        console.log(`   ${GREEN}➡ Auto-answering: "${scripted.label}"${RESET}\n`);
      }

      await answerNodeQuestion(service, ctx, graphSlug, q.nodeId, q.questionId, answer);
      this.answeredQuestions.add(q.questionId);
      return true;
    }
    return false;
  }

  private async promptHuman(question: string): Promise<string> {
    const readline = await import('node:readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      rl.question('   > ', (answer: string) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }
}

// ─── §1: buildStack (real agents, no fakes) ─────────────────────────
function buildStack(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  agentManager: IAgentManagerService,
  workUnitService: ReturnType<typeof buildDiskWorkUnitService>,
) {
  const eventRegistry = new FakeNodeEventRegistry();
  registerCoreEventTypes(eventRegistry);
  const handlerRegistry = createEventHandlerRegistry();
  const nes = new NodeEventService(
    {
      registry: eventRegistry,
      loadState: async (slug: string) => service.loadGraphState(ctx, slug),
      persistState: async (slug: string, state: unknown) =>
        service.persistGraphState(ctx, slug, state),
    },
    handlerRegistry,
  );
  const eventHandlerService = new EventHandlerService(nes);
  const nodeFs = new NodeFileSystemAdapter();
  const podManager = new PodManager(nodeFs);
  const contextService = new AgentContextService();
  const scriptRunner = new ScriptRunner();

  const ods = new ODS({
    graphService: service,
    podManager,
    contextService,
    agentManager,
    scriptRunner,
    workUnitService,
  });

  const orchestrationService = new OrchestrationService({
    graphService: service,
    onbas: new ONBAS(),
    ods,
    eventHandlerService,
    podManager,
  });

  return { orchestrationService, podManager };
}

// ─── §4: buildAdvancedPipeline ──────────────────────────────────────
async function buildAdvancedPipeline(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  slug: string,
) {
  const { lineId: line0 } = await service.create(ctx, slug);
  await ensureGraphsDir(ctx.worktreePath, slug);
  const line1 = (await service.addLine(ctx, slug)).lineId!;
  const line2 = (await service.addLine(ctx, slug)).lineId!;
  const line3 = (await service.addLine(ctx, slug)).lineId!;

  // Line 0: human-input
  const humanInput = await service.addNode(ctx, slug, line0, 'human-input');
  const humanId = humanInput.nodeId!;

  // Line 1: spec-writer (global agent)
  const specWriter = await service.addNode(ctx, slug, line1, 'spec-writer');
  const specId = specWriter.nodeId!;

  // Line 2: parallel programmers with noContext
  const progA = await service.addNode(ctx, slug, line2, 'programmer-a', {
    orchestratorSettings: { execution: 'parallel', noContext: true },
  });
  const progAId = progA.nodeId!;

  const progB = await service.addNode(ctx, slug, line2, 'programmer-b', {
    orchestratorSettings: { execution: 'parallel', noContext: true },
  });
  const progBId = progB.nodeId!;

  // Line 3: reviewer + summariser (serial, context from global)
  const reviewer = await service.addNode(ctx, slug, line3, 'reviewer');
  const reviewerId = reviewer.nodeId!;

  const summariser = await service.addNode(ctx, slug, line3, 'summariser');
  const summariserId = summariser.nodeId!;

  // ── Wire inputs ─────────────────────────────────────────────────
  // spec-writer reads requirements from human-input
  await service.setInput(ctx, slug, specId, 'requirements', { from_node: humanId, from_output: 'requirements' });

  // programmer-a reads spec + language_1
  await service.setInput(ctx, slug, progAId, 'spec', { from_node: specId, from_output: 'spec' });
  await service.setInput(ctx, slug, progAId, 'language', { from_node: specId, from_output: 'language_1' });

  // programmer-b reads spec + language_2
  await service.setInput(ctx, slug, progBId, 'spec', { from_node: specId, from_output: 'spec' });
  await service.setInput(ctx, slug, progBId, 'language', { from_node: specId, from_output: 'language_2' });

  // reviewer reads spec + outputs from both programmers
  await service.setInput(ctx, slug, reviewerId, 'spec', { from_node: specId, from_output: 'spec' });
  await service.setInput(ctx, slug, reviewerId, 'code_a', { from_node: progAId, from_output: 'code' });
  await service.setInput(ctx, slug, reviewerId, 'code_b', { from_node: progBId, from_output: 'code' });
  await service.setInput(ctx, slug, reviewerId, 'results_a', { from_node: progAId, from_output: 'test_results' });
  await service.setInput(ctx, slug, reviewerId, 'results_b', { from_node: progBId, from_output: 'test_results' });

  // summariser reads reviewer outputs
  await service.setInput(ctx, slug, summariserId, 'review_a', { from_node: reviewerId, from_output: 'review_a' });
  await service.setInput(ctx, slug, summariserId, 'review_b', { from_node: reviewerId, from_output: 'review_b' });
  await service.setInput(ctx, slug, summariserId, 'metrics_a', { from_node: reviewerId, from_output: 'metrics_a' });
  await service.setInput(ctx, slug, summariserId, 'metrics_b', { from_node: reviewerId, from_output: 'metrics_b' });

  return {
    humanId,
    specId,
    progAId,
    progBId,
    reviewerId,
    summariserId,
  };
}

// ─── §7-8: Main ─────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  const TIMEOUT_MS = 600_000;

  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Chainglass Advanced Pipeline E2E');
  console.log('  Real agents • Q&A • Parallel fan-out • Context inheritance');
  console.log(`  Mode: ${INTERACTIVE ? 'INTERACTIVE (you answer questions)' : 'SCRIPTED (auto-answers)'}`);
  console.log(`  Model: ${MODEL}`);
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');

  // Script-level timeout
  const timer = setTimeout(() => {
    console.log(`\n${RED}${BOLD}TIMEOUT: ${TIMEOUT_MS / 1000}s exceeded${RESET}`);
    process.exit(1);
  }, TIMEOUT_MS);

  try {
    await withTestGraph('advanced-pipeline', async (tgc) => {
      console.log(`${DIM}workspace: ${tgc.workspacePath}${RESET}`);
      console.log('');

      // ── Wire real orchestration stack ──────────────────────────────
      const client = new CopilotClient({ cwd: tgc.workspacePath });
      const adapterCache = new Map<string, VerboseCopilotAdapter>();
      let adapterIndex = 0;
      const nodeLabels = ['spec-writer', 'programmer-a', 'programmer-b', 'reviewer', 'summariser'];

      const agentManager = new AgentManagerService(
        () => {
          // AgentManagerService.getWithSessionId() reuses instances from session index,
          // so this factory is only called for genuinely new dispatches.
          const label = nodeLabels[adapterIndex] ?? `node-${adapterIndex}`;
          const colour = COLOURS[adapterIndex % COLOURS.length];
          adapterIndex++;
          const adapter = new VerboseCopilotAdapter(client, label, colour, t0);
          return adapter as unknown as InstanceType<typeof SdkCopilotAdapter>;
        },
      ) as unknown as IAgentManagerService;

      const workUnitService = buildDiskWorkUnitService(tgc.workspacePath);
      const { orchestrationService, podManager } = buildStack(
        tgc.service, tgc.ctx, agentManager, workUnitService,
      );

      // ── Build graph ───────────────────────────────────────────────
      const SLUG = 'advanced-pipeline';
      const ids = await buildAdvancedPipeline(tgc.service, tgc.ctx, SLUG);

      console.log(`${BOLD}GRAPH TOPOLOGY${RESET}`);
      console.log(`  Line 0: [human-input] (${ids.humanId})`);
      console.log(`  Line 1: [spec-writer] (${ids.specId}) ${CYAN}← Q&A enabled${RESET}`);
      console.log(`  Line 2: [programmer-a] (${ids.progAId}) [programmer-b] (${ids.progBId}) ${CYAN}← parallel, noContext${RESET}`);
      console.log(`  Line 3: [reviewer] (${ids.reviewerId}) [summariser] (${ids.summariserId}) ${CYAN}← context chain from line 1${RESET}`);
      console.log('');

      // ── Q&A handler ───────────────────────────────────────────────
      const qa = new QuestionWatcher(
        [{ match: 'language', answer: 'python and go', label: 'python and go' }],
        INTERACTIVE,
      );
      let humanInputCompleted = false;

      // ── Drive loop with Q&A ───────────────────────────────────────
      console.log(`${BOLD}═══ DRIVING ═══${RESET}`);
      console.log('');

      const handle = await orchestrationService.get(tgc.ctx, SLUG);
      const result = await handle.drive({
        maxIterations: 200,
        actionDelayMs: 1000,
        idleDelayMs: 3000,
        onEvent: async (event: DriveEvent) => {
          const t = elapsed(t0);
          switch (event.type) {
            case 'status':
              console.log(`${DIM}[${t}]${RESET} ${event.message}`);
              break;
            case 'iteration':
              console.log(`${CYAN}[${t}] ▶${RESET} ${event.message}`);
              break;
            case 'idle':
              // Complete human-input on first idle (drive can't proceed without it)
              if (!humanInputCompleted) {
                console.log(`\n${BOLD}═══ LINE 0: HUMAN INPUT ═══${RESET}`);
                await completeUserInputNode(tgc.service, tgc.ctx, SLUG, ids.humanId, {
                  requirements: 'Build a CLI tool that converts CSV files to JSON format with support for custom delimiters and header mapping.',
                });
                humanInputCompleted = true;
                console.log(`${GREEN}✓${RESET} Requirements provided`);
                console.log('');
                break;
              }
              // Check for pending Q&A
              await qa.check(tgc.service, tgc.ctx, SLUG);
              process.stdout.write(`${DIM}.${RESET}`);
              break;
            default:
              break;
          }
        },
      });

      // ── §6: Result + Assertions ───────────────────────────────────
      // Wait for fire-and-forget pod.execute() promises to settle.
      // The drive loop exits when it sees graph-complete on disk, but the
      // last agent's adapter may still be returning (sendAndWait completing).
      // Poll until all sessions are captured or timeout.
      const sessionNodes = [ids.specId, ids.progAId, ids.progBId, ids.reviewerId, ids.summariserId];
      for (let wait = 0; wait < 10; wait++) {
        await new Promise((r) => setTimeout(r, 1000));
        const missing = sessionNodes.filter(id => !podManager.getSessionId(id));
        if (missing.length === 0) break;
        if (wait === 9) console.log(`${YELLOW}⚠ Session capture timeout — missing: ${missing.join(', ')}${RESET}`);
      }
      await podManager.loadSessions(tgc.ctx, SLUG);

      console.log('');
      console.log('');
      console.log(`${BOLD}═══ RESULT ═══${RESET}`);
      console.log(`  Time:       ${elapsed(t0)}`);
      console.log(`  Exit:       ${result.exitReason}`);
      console.log(`  Iterations: ${result.iterations}`);
      console.log('');

      let allPass = true;
      let passCount = 0;
      const totalAssertions = 23;
      const check = async (label: string, fn: () => Promise<void>) => {
        try {
          await fn();
          passCount++;
          console.log(`  ${GREEN}✓${RESET} ${label}`);
        } catch (err) {
          console.log(`  ${RED}✗${RESET} ${label}: ${err}`);
          allPass = false;
        }
      };

      console.log(`${BOLD}Assertions:${RESET}`);

      // 1: exitReason
      await check('exitReason=complete', async () => {
        if (result.exitReason !== 'complete') throw new Error(`got ${result.exitReason}`);
      });
      // 2: graph complete
      await check('graph complete', () => assertGraphComplete(tgc.service, tgc.ctx, SLUG));
      // 3-8: each node complete
      await check('human-input complete', () => assertNodeComplete(tgc.service, tgc.ctx, SLUG, ids.humanId));
      await check('spec-writer complete', () => assertNodeComplete(tgc.service, tgc.ctx, SLUG, ids.specId));
      await check('programmer-a complete', () => assertNodeComplete(tgc.service, tgc.ctx, SLUG, ids.progAId));
      await check('programmer-b complete', () => assertNodeComplete(tgc.service, tgc.ctx, SLUG, ids.progBId));
      await check('reviewer complete', () => assertNodeComplete(tgc.service, tgc.ctx, SLUG, ids.reviewerId));
      await check('summariser complete', () => assertNodeComplete(tgc.service, tgc.ctx, SLUG, ids.summariserId));

      // 9-10: spec-writer outputs
      await check('spec-writer has spec', () => assertOutputExists(tgc.service, tgc.ctx, SLUG, ids.specId, 'spec'));
      await check('spec-writer has language_1', () => assertOutputExists(tgc.service, tgc.ctx, SLUG, ids.specId, 'language_1'));

      // 11-12: session chain (spec-writer = reviewer = summariser)
      const specSid = podManager.getSessionId(ids.specId);
      const reviewerSid = podManager.getSessionId(ids.reviewerId);
      const summariserSid = podManager.getSessionId(ids.summariserId);
      await check('session chain: spec-writer = reviewer', async () => {
        if (!specSid || !reviewerSid) throw new Error(`missing sid: spec=${specSid}, reviewer=${reviewerSid}`);
        if (specSid !== reviewerSid) throw new Error(`${specSid} !== ${reviewerSid}`);
      });
      await check('session chain: reviewer = summariser', async () => {
        if (!reviewerSid || !summariserSid) throw new Error(`missing sid: reviewer=${reviewerSid}, summariser=${summariserSid}`);
        if (reviewerSid !== summariserSid) throw new Error(`${reviewerSid} !== ${summariserSid}`);
      });

      // 13-14: session isolation (prog-a ≠ prog-b ≠ spec-writer)
      const progASid = podManager.getSessionId(ids.progAId);
      const progBSid = podManager.getSessionId(ids.progBId);
      await check('isolation: programmer-a ≠ spec-writer', async () => {
        if (!progASid || !specSid) throw new Error(`missing sid`);
        if (progASid === specSid) throw new Error(`same: ${progASid}`);
      });
      await check('isolation: programmer-b ≠ spec-writer', async () => {
        if (!progBSid || !specSid) throw new Error(`missing sid`);
        if (progBSid === specSid) throw new Error(`same: ${progBSid}`);
      });
      // AC-10: programmer-a ≠ programmer-b
      await check('isolation: programmer-a ≠ programmer-b', async () => {
        if (!progASid || !progBSid) throw new Error(`missing sid`);
        if (progASid === progBSid) throw new Error(`same: ${progASid}`);
      });

      // 15: Q&A was answered
      await check('Q&A: question was answered', async () => {
        if (qa['answeredQuestions'].size === 0) throw new Error('no questions answered');
      });

      // 16: summariser has final_report
      await check('summariser has final_report', () =>
        assertOutputExists(tgc.service, tgc.ctx, SLUG, ids.summariserId, 'final_report'));

      // 17: summariser has overall_pass
      await check('summariser has overall_pass', () =>
        assertOutputExists(tgc.service, tgc.ctx, SLUG, ids.summariserId, 'overall_pass'));

      // AC-12: line ordering — parallel nodes started after spec-writer completed
      await check('line ordering: programmers started after spec-writer', async () => {
        const specStatus = await tgc.service.getNodeStatus(tgc.ctx, SLUG, ids.specId);
        const progAStatus = await tgc.service.getNodeStatus(tgc.ctx, SLUG, ids.progAId);
        if (!specStatus.completedAt || !progAStatus.startedAt) throw new Error('missing timestamps');
        if (new Date(progAStatus.startedAt) < new Date(specStatus.completedAt)) {
          throw new Error(`programmer-a started ${progAStatus.startedAt} before spec-writer completed ${specStatus.completedAt}`);
        }
      });

      // AC-13: all agent outputs non-empty
      await check('programmer-a has code output', () =>
        assertOutputExists(tgc.service, tgc.ctx, SLUG, ids.progAId, 'code'));
      await check('programmer-b has code output', () =>
        assertOutputExists(tgc.service, tgc.ctx, SLUG, ids.progBId, 'code'));
      await check('reviewer has review_a output', () =>
        assertOutputExists(tgc.service, tgc.ctx, SLUG, ids.reviewerId, 'review_a'));
      await check('summariser has total_loc output', () =>
        assertOutputExists(tgc.service, tgc.ctx, SLUG, ids.summariserId, 'total_loc'));

      // ── Session chain display ─────────────────────────────────────
      console.log('');
      console.log(`${BOLD}Session Chain:${RESET}`);
      console.log(`  spec-writer:   ${specSid ?? '(none)'}  (new)`);
      console.log(`  programmer-a:  ${progASid ?? '(none)'}  (new — isolated)`);
      console.log(`  programmer-b:  ${progBSid ?? '(none)'}  (new — isolated)`);
      console.log(`  reviewer:      ${reviewerSid ?? '(none)'}  (inherited from spec-writer ${reviewerSid === specSid ? '✓' : '✗'})`);
      console.log(`  summariser:    ${summariserSid ?? '(none)'}  (inherited from reviewer ${summariserSid === reviewerSid ? '✓' : '✗'})`);

      // ── Read key outputs ──────────────────────────────────────────
      console.log('');
      console.log(`${BOLD}Key Outputs:${RESET}`);
      const readOutput = async (nodeId: string, name: string) => {
        try {
          const data = await tgc.service.getNodeOutputData(tgc.ctx, SLUG, nodeId, name);
          const preview = String(data).slice(0, 120);
          console.log(`  ${MAGENTA}${name}:${RESET} ${preview}${String(data).length > 120 ? '...' : ''}`);
        } catch {
          console.log(`  ${DIM}${name}: (not readable)${RESET}`);
        }
      };
      await readOutput(ids.specId, 'language_1');
      await readOutput(ids.specId, 'language_2');
      await readOutput(ids.summariserId, 'overall_pass');
      await readOutput(ids.summariserId, 'total_loc');

      // ── Final summary ─────────────────────────────────────────────
      console.log('');
      if (allPass) {
        console.log(`${GREEN}${BOLD}══════════════════════════════════════════════════════════════${RESET}`);
        console.log(`${GREEN}${BOLD}  ✅ ALL ${passCount}/${totalAssertions} ASSERTIONS PASSED (${elapsed(t0)})${RESET}`);
        console.log(`${GREEN}${BOLD}══════════════════════════════════════════════════════════════${RESET}`);

        // Copy graph to project root so user can inspect after cleanup
        const projectRoot = process.env.CG_PROJECT_ROOT ?? process.cwd();
        const srcGraph = `${tgc.workspacePath}/.chainglass/data/workflows/${SLUG}`;
        const dstGraph = `${projectRoot}/.chainglass/data/workflows/${SLUG}`;
        try {
          const { execSync } = await import('node:child_process');
          // Copy graph data + work units so inspect can resolve inputs/outputs
          const srcUnits = `${tgc.workspacePath}/.chainglass/units`;
          const dstUnits = `${projectRoot}/.chainglass/units`;
          execSync(`mkdir -p "${dstGraph}" && cp -r "${srcGraph}/." "${dstGraph}/"`, { stdio: 'pipe' });
          execSync(`mkdir -p "${dstUnits}" && cp -rn "${srcUnits}/." "${dstUnits}/" 2>/dev/null || true`, { stdio: 'pipe' });
          console.log('');
          console.log(`${DIM}Graph copied to project root. Inspect with:${RESET}`);
          console.log(`  cg wf inspect ${SLUG}`);
          console.log(`  cg wf inspect ${SLUG} --compact`);
          console.log(`  cg wf inspect ${SLUG} --json | jq .`);
        } catch {
          console.log(`${DIM}(graph copy to project root skipped)${RESET}`);
        }
      } else {
        console.log(`${RED}${BOLD}══════════════════════════════════════════════════════════════${RESET}`);
        console.log(`${RED}${BOLD}  ❌ ${passCount}/${totalAssertions} PASSED — SOME CHECKS FAILED${RESET}`);
        console.log(`${RED}${BOLD}══════════════════════════════════════════════════════════════${RESET}`);
        process.exit(1);
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

main().catch((err) => {
  console.error(`${RED}FATAL:${RESET}`, err);
  process.exit(1);
});
