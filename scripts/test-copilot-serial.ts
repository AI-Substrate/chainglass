/**
 * Real Agent E2E — Copilot Serial Pipeline
 *
 * Drives a 3-node graph (get-spec → spec-writer → reviewer) with a real
 * Copilot agent. Streams ALL SDK events so you can see exactly what the
 * agent is doing: thinking, tool calls, outputs, completions.
 *
 * Run: npx tsx scripts/test-copilot-serial.ts
 * Or:  just test-copilot-serial
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
import { completeUserInputNode, ensureGraphsDir } from '../dev/test-graphs/shared/helpers.js';

import {
  AgentContextService,
  ODS,
  ONBAS,
  OrchestrationService,
  PodManager,
  ScriptRunner,
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
import { NodeFileSystemAdapter } from '@chainglass/shared';
import type { IAgentManagerService } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { CopilotClient, CopilotSession } from '@github/copilot-sdk';
import type { SessionEvent } from '@github/copilot-sdk';
import { AgentManagerService } from '@chainglass/shared/features/034-agentic-cli';
import { SdkCopilotAdapter } from '@chainglass/shared';
import type { AgentRunOptions, AgentResult, IAgentAdapter } from '@chainglass/shared';

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

function elapsed(start: number): string {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`;
}

// ─── Transparent Adapter Wrapper (dumps raw SDK events) ─────────────
class VerboseCopilotAdapter implements IAgentAdapter {
  private inner: SdkCopilotAdapter;
  private client: CopilotClient;
  private nodeLabel: string;
  private startTime: number;

  constructor(client: CopilotClient, label: string, startTime: number) {
    this.inner = new SdkCopilotAdapter(client);
    this.client = client;
    this.nodeLabel = label;
    this.startTime = startTime;
  }

  private tag(): string {
    const t = ((Date.now() - this.startTime) / 1000).toFixed(1);
    return `${DIM}[${t}]${RESET} ${BLUE}[${this.nodeLabel}]${RESET}`;
  }

  async run(options: AgentRunOptions): Promise<AgentResult> {
    console.log(`${this.tag()} ${BOLD}Starting agent run${RESET}`);
    if (options.cwd) console.log(`${this.tag()} ${DIM}cwd: ${options.cwd}${RESET}`);
    console.log(`${this.tag()} ${DIM}prompt (first 200 chars): ${options.prompt?.slice(0, 200)}...${RESET}`);

    // Create session manually so we can hook raw events
    const session = options.sessionId
      ? await this.client.resumeSession(options.sessionId)
      : await this.client.createSession({ streaming: true });

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
          const d = event.data as { toolName: string; arguments?: unknown; toolCallId?: string };
          const args = typeof d.arguments === 'string'
            ? d.arguments.slice(0, 300)
            : JSON.stringify(d.arguments ?? '').slice(0, 300);
          console.log(`\n${this.tag()} ${MAGENTA}🔧 ${d.toolName}${RESET} ${DIM}${args}${RESET}`);
          break;
        }
        case 'tool.execution_complete': {
          const d = event.data as { toolCallId?: string; success: boolean; result?: { content?: string } };
          const preview = d.result?.content?.slice(0, 200) ?? '';
          console.log(`${this.tag()} ${d.success ? GREEN + '✓' : RED + '✗'}${RESET} tool done ${DIM}${preview}${RESET}`);
          break;
        }
        case 'tool.execution_partial_result': {
          const d = event.data as { partialOutput?: string };
          const preview = (d.partialOutput ?? '').slice(0, 150);
          if (preview.trim()) {
            console.log(`${this.tag()} ${DIM}⋯ ${preview}${RESET}`);
          }
          break;
        }
        case 'session.error': {
          const d = event.data as { errorType: string; message: string };
          console.log(`${this.tag()} ${RED}❌ SESSION ERROR: ${d.errorType}: ${d.message}${RESET}`);
          break;
        }
        case 'assistant.turn_start':
          console.log(`${this.tag()} ${DIM}── turn start ──${RESET}`);
          break;
        case 'assistant.turn_end':
          console.log(`${this.tag()} ${DIM}── turn end ──${RESET}`);
          break;
        case 'assistant.usage': {
          const d = event.data as { inputTokens?: number; outputTokens?: number };
          console.log(`${this.tag()} ${DIM}tokens: in=${d.inputTokens ?? '?'} out=${d.outputTokens ?? '?'}${RESET}`);
          break;
        }
        case 'session.idle':
          break; // quiet
        case 'assistant.reasoning':
        case 'pending_messages.modified':
        case 'user.message':
        case 'session.usage_info':
          break; // skip consolidated duplicates and internal events
        default:
          console.log(`${this.tag()} ${DIM}[${event.type}]${RESET}`);
      }
    });

    try {
      await session.sendAndWait({ prompt: options.prompt.trim() });

      console.log(`\n${this.tag()} ${GREEN}✓ Agent completed${RESET} (${toolCount} tool calls)`);

      return {
        output,
        sessionId: session.sessionId,
        status: 'completed',
        exitCode: 0,
        tokens: null,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`\n${this.tag()} ${RED}✗ Agent FAILED: ${msg}${RESET}`);
      return {
        output: msg,
        sessionId: session.sessionId,
        status: 'failed',
        exitCode: 1,
        tokens: null,
      };
    } finally {
      await session.destroy();
    }
  }

  async terminate(): Promise<void> {
    return this.inner.terminate();
  }
}

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

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();

  console.log('');
  console.log('══════════════════════════════════════════════════');
  console.log('  Real Agent E2E — Copilot Serial Pipeline');
  console.log('══════════════════════════════════════════════════');
  console.log('');

  await withTestGraph('real-agent-serial', async (tgc) => {
    console.log(`${DIM}workspace: ${tgc.workspacePath}${RESET}`);
    console.log('');

    // ── Wire the orchestration stack with a real Copilot adapter ──
    const client = new CopilotClient({ cwd: tgc.workspacePath });

    // Build adapter with full event streaming
    let nodeCounter = 0;
    const nodeLabels = ['spec-writer', 'reviewer', 'node-3', 'node-4'];
    const agentManager = new AgentManagerService(
      () => {
        const label = nodeLabels[nodeCounter++] ?? `node-${nodeCounter}`;
        return new VerboseCopilotAdapter(client, label, t0) as unknown as InstanceType<typeof SdkCopilotAdapter>;
      },
    ) as unknown as IAgentManagerService;

    const workUnitService = buildDiskWorkUnitService(tgc.workspacePath);
    const { orchestrationService, podManager } = buildStack(
      tgc.service,
      tgc.ctx,
      agentManager,
      workUnitService,
    );

    // ── Build graph ─────────────────────────────────────────────────
    const SLUG = 'copilot-serial';
    const { lineId: line0 } = await tgc.service.create(tgc.ctx, SLUG);
    await ensureGraphsDir(tgc.workspacePath, SLUG);

    const line1 = await tgc.service.addLine(tgc.ctx, SLUG);
    const getSpec = await tgc.service.addNode(tgc.ctx, SLUG, line0, 'get-spec');
    const specWriter = await tgc.service.addNode(
      tgc.ctx, SLUG, line1.lineId as string, 'spec-writer',
    );
    const reviewer = await tgc.service.addNode(
      tgc.ctx, SLUG, line1.lineId as string, 'reviewer',
    );

    await tgc.service.setInput(tgc.ctx, SLUG, specWriter.nodeId as string, 'spec', {
      from_node: getSpec.nodeId as string,
      from_output: 'spec',
    });
    await tgc.service.setInput(tgc.ctx, SLUG, reviewer.nodeId as string, 'summary', {
      from_node: specWriter.nodeId as string,
      from_output: 'summary',
    });

    console.log(`${BOLD}Graph:${RESET} ${SLUG}`);
    console.log(`  get-spec    (${getSpec.nodeId}) — user-input`);
    console.log(`  spec-writer (${specWriter.nodeId}) — agent`);
    console.log(`  reviewer    (${reviewer.nodeId}) — agent`);
    console.log('');

    // ── Complete user input ─────────────────────────────────────────
    await completeUserInputNode(tgc.service, tgc.ctx, SLUG, getSpec.nodeId as string, {
      spec: 'Write a function that adds two numbers',
    });
    console.log(`${GREEN}✓${RESET} User input completed: "Write a function that adds two numbers"`);
    console.log('');

    // ── Drive ───────────────────────────────────────────────────────
    console.log(`${BOLD}═══ DRIVING ═══${RESET}`);
    console.log('');

    const handle = await orchestrationService.get(tgc.ctx, SLUG);
    const result = await handle.drive({
      maxIterations: 50,
      actionDelayMs: 1000,
      idleDelayMs: 5000,
      onEvent: (event: DriveEvent) => {
        const t = elapsed(t0);
        switch (event.type) {
          case 'status':
            console.log(`${DIM}[${t}]${RESET} ${event.message}`);
            break;
          case 'iteration':
            console.log(`${CYAN}[${t}] ▶${RESET} ${event.message}`);
            break;
          case 'idle':
            // quiet — just a dot to show progress
            process.stdout.write(`${DIM}.${RESET}`);
            break;
          default:
            console.log(`${DIM}[${t}]${RESET} ${event.type}: ${event.message ?? ''}`);
        }
      },
    });

    console.log('');
    console.log('');
    console.log(`${BOLD}═══ RESULT ═══${RESET}`);
    console.log(`  Time:       ${elapsed(t0)}`);
    console.log(`  Exit:       ${result.exitReason}`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log('');

    // ── Assertions ──────────────────────────────────────────────────
    let allPass = true;
    const check = async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
        console.log(`  ${GREEN}✓${RESET} ${label}`);
      } catch (err) {
        console.log(`  ${RED}✗${RESET} ${label}: ${err}`);
        allPass = false;
      }
    };

    console.log(`${BOLD}Assertions:${RESET}`);
    await check('exitReason=complete', async () => {
      if (result.exitReason !== 'complete') throw new Error(`got ${result.exitReason}`);
    });
    await check('graph complete', () => assertGraphComplete(tgc.service, tgc.ctx, SLUG));
    await check('spec-writer complete', () =>
      assertNodeComplete(tgc.service, tgc.ctx, SLUG, specWriter.nodeId as string));
    await check('reviewer complete', () =>
      assertNodeComplete(tgc.service, tgc.ctx, SLUG, reviewer.nodeId as string));
    await check('spec-writer has summary', () =>
      assertOutputExists(tgc.service, tgc.ctx, SLUG, specWriter.nodeId as string, 'summary'));
    await check('reviewer has decision', () =>
      assertOutputExists(tgc.service, tgc.ctx, SLUG, reviewer.nodeId as string, 'decision'));

    // Session tracking
    const writerSid = podManager.getSessionId(specWriter.nodeId as string);
    const reviewerSid = podManager.getSessionId(reviewer.nodeId as string);
    await check('writer has session ID', async () => {
      if (!writerSid) throw new Error('undefined');
    });
    await check('reviewer has session ID', async () => {
      if (!reviewerSid) throw new Error('undefined');
    });

    console.log('');
    console.log(`  ${DIM}writer session:   ${writerSid ?? '(none)'}${RESET}`);
    console.log(`  ${DIM}reviewer session:  ${reviewerSid ?? '(none)'}${RESET}`);

    // ── Read outputs ────────────────────────────────────────────────
    console.log('');
    console.log(`${BOLD}Outputs:${RESET}`);
    try {
      const summaryData = await tgc.service.getNodeOutputData(
        tgc.ctx, SLUG, specWriter.nodeId as string, 'summary',
      );
      console.log(`  ${MAGENTA}summary:${RESET} ${JSON.stringify(summaryData)}`);
    } catch { console.log(`  ${DIM}summary: (not readable)${RESET}`); }

    try {
      const decisionData = await tgc.service.getNodeOutputData(
        tgc.ctx, SLUG, reviewer.nodeId as string, 'decision',
      );
      console.log(`  ${MAGENTA}decision:${RESET} ${JSON.stringify(decisionData)}`);
    } catch { console.log(`  ${DIM}decision: (not readable)${RESET}`); }

    console.log('');
    if (allPass) {
      console.log(`${GREEN}${BOLD}══════════════════════════════════════════════════${RESET}`);
      console.log(`${GREEN}${BOLD}  ✅ ALL PASSED${RESET}`);
      console.log(`${GREEN}${BOLD}══════════════════════════════════════════════════${RESET}`);
    } else {
      console.log(`${RED}${BOLD}══════════════════════════════════════════════════${RESET}`);
      console.log(`${RED}${BOLD}  ❌ SOME CHECKS FAILED${RESET}`);
      console.log(`${RED}${BOLD}══════════════════════════════════════════════════${RESET}`);
      process.exit(1);
    }
  });
}

main().catch((err) => {
  console.error(`${RED}FATAL:${RESET}`, err);
  process.exit(1);
});
