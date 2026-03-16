/**
 * Plan 037: Test Graph Infrastructure — Graph Test Runner
 *
 * Provides withTestGraph() lifecycle helper for integration tests.
 * Composes createTestServiceStack() from e2e-helpers — does NOT reinvent service wiring.
 *
 * Phase 3 additions (Workshop 09):
 * - buildDiskWorkUnitService: shared IWorkUnitService for graph service + ODS
 * - createTestOrchestrationStack: full orchestration wiring with real ScriptRunner
 * - Workspace registration via WorkspaceService (DYK-P3#1 blocker)
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type {
  IWorkUnitService,
  WorkUnitInstance,
  WorkUnitSummary,
} from '@chainglass/positional-graph/features/029-agentic-work-units';
import {
  AgentContextService,
  ODS,
  ONBAS,
  OrchestrationService,
  PodManager,
  ScriptRunner,
} from '@chainglass/positional-graph/features/030-orchestration';
import {
  EventHandlerService,
  FakeNodeEventRegistry,
  NodeEventService,
  createEventHandlerRegistry,
  registerCoreEventTypes,
} from '@chainglass/positional-graph/features/032-node-event-system';
import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
import type { State } from '@chainglass/positional-graph/schemas';
import {
  FakeAgentManagerService,
  NodeFileSystemAdapter,
  WORKSPACE_DI_TOKENS,
  YamlParserAdapter,
} from '@chainglass/shared';
import {
  type IWorkspaceService,
  type WorkspaceContext,
  createWorkflowProductionContainer,
} from '@chainglass/workflow';
import {
  type TestServiceStack,
  createTestServiceStack,
} from '../../../test/helpers/positional-graph-e2e-helpers.js';
import { makeScriptsExecutable } from './helpers.js';

/** Base context available to all test graph callbacks. */
export interface TestGraphContext {
  /** Workspace context for service calls. */
  ctx: WorkspaceContext;
  /** Positional graph service with real filesystem adapters. */
  service: IPositionalGraphService;
  /** Absolute path to the temp workspace root. */
  workspacePath: string;
}

/** Fixture root directory (dev/test-graphs/) resolved relative to this file. */
const FIXTURES_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/**
 * Build a real IWorkUnitLoader that reads unit.yaml from the temp workspace.
 * This ensures addNode() validates units actually exist on disk.
 *
 * DYK#2: createTestServiceStack accepts IWorkUnitLoader (narrow), not IWorkUnitService.
 * We build a minimal loader that reads unit.yaml and maps to NarrowWorkUnit.
 */
function buildDiskLoader(workspacePath: string) {
  const nodeFs = new NodeFileSystemAdapter();
  const yamlParser = new YamlParserAdapter();

  return {
    async load(_ctx: WorkspaceContext, slug: string) {
      const unitPath = path.join(workspacePath, '.chainglass', 'units', slug, 'unit.yaml');
      try {
        const content = await nodeFs.readFile(unitPath);
        const parsed = yamlParser.parse(content, unitPath) as {
          slug: string;
          type: 'agent' | 'code' | 'user-input';
          inputs?: Array<{
            name: string;
            type: 'data' | 'file';
            required: boolean;
            description?: string;
          }>;
          outputs?: Array<{
            name: string;
            type: 'data' | 'file';
            required: boolean;
            description?: string;
          }>;
          user_input?: {
            question_type: 'text' | 'single' | 'multi' | 'confirm';
            prompt: string;
            options?: Array<{ key: string; label: string; description?: string }>;
            default?: string | boolean;
          };
        };
        const base = {
          slug: parsed.slug,
          inputs: (parsed.inputs ?? []).map((i) => ({
            name: i.name,
            type: i.type,
            required: i.required,
            description: i.description,
          })),
          outputs: (parsed.outputs ?? []).map((o) => ({
            name: o.name,
            type: o.type,
            required: o.required,
            description: o.description,
          })),
        };
        if (parsed.type === 'user-input') {
          if (!parsed.user_input) {
            return {
              unit: undefined,
              errors: [
                {
                  code: 'UNIT_LOAD_ERROR',
                  message: `Unit '${parsed.slug}' has type 'user-input' but is missing user_input config`,
                },
              ],
            };
          }
          return {
            unit: {
              ...base,
              type: 'user-input' as const,
              userInput: {
                prompt: parsed.user_input.prompt,
                inputType: parsed.user_input.question_type,
                outputName: base.outputs[0]?.name ?? 'output',
                options: parsed.user_input.options,
                default: parsed.user_input.default,
              },
            },
            errors: [] as { code: string; message: string }[],
          };
        }
        return {
          unit: {
            ...base,
            type: parsed.type === 'code' ? ('code' as const) : ('agent' as const),
          },
          errors: [] as { code: string; message: string }[],
        };
      } catch {
        return {
          unit: undefined,
          errors: [{ code: 'UNIT_NOT_FOUND', message: `Unit '${slug}' not found at ${unitPath}` }],
        };
      }
    },
  };
}

/**
 * Run a test with a fully-wired test graph fixture.
 *
 * Lifecycle:
 * 1. Create temp workspace (mkdtemp)
 * 2. Create .chainglass/units/ and data/workflows/ directories
 * 3. Copy work unit fixtures from dev/test-graphs/<fixtureName>/units/
 * 4. Make all .sh scripts executable
 * 5. Register workspace via WorkspaceService (so CLI --workspace-path resolves)
 * 6. Wire PositionalGraphService with real IWorkUnitLoader (reads from disk)
 * 7. Call testFn with TestGraphContext
 * 8. Unregister workspace + clean up temp workspace (rm -rf)
 *
 * Phase 3 extensibility: Build orchestration stack on top of tgc.service in your test.
 */
export interface WithTestGraphOptions {
  /** If true, keep the temp workspace after test completes (for post-run inspection). Default: false. */
  preserveOnSuccess?: boolean;
}

export async function withTestGraph(
  fixtureName: string,
  testFnOrOptions: ((tgc: TestGraphContext) => Promise<void>) | WithTestGraphOptions,
  maybeTestFn?: (tgc: TestGraphContext) => Promise<void>
): Promise<void> {
  const testFn =
    typeof testFnOrOptions === 'function'
      ? testFnOrOptions
      : (maybeTestFn as (tgc: TestGraphContext) => Promise<void>);
  const options = typeof testFnOrOptions === 'object' ? testFnOrOptions : {};

  // Validate fixtureName to prevent path traversal
  if (!/^[a-z0-9_-]+$/.test(fixtureName)) {
    throw new Error(`Invalid fixtureName: "${fixtureName}" (must match ^[a-z0-9_-]+$)`);
  }

  // 1. Determine fixture source
  const fixtureDir = path.join(FIXTURES_ROOT, fixtureName);
  const unitsSource = path.join(fixtureDir, 'units');

  // Verify fixture exists
  try {
    await fs.stat(unitsSource);
  } catch {
    throw new Error(`Test graph fixture '${fixtureName}' not found at ${unitsSource}`);
  }

  // 2. Build the real disk-reading loader (wired to temp workspace path later)
  // We need to create the temp dir first, then build the loader pointing at it
  const os = await import('node:os');
  // realpath resolves macOS /var → /private/var symlink so the registered
  // workspace path matches what the CLI sees when it resolves cwd.
  const rawTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `tg-${fixtureName}-`));
  const tmpDir = await fs.realpath(rawTmpDir);
  let stackWorkspacePath: string | undefined;
  const workspaceSlug = `tg-${fixtureName}-${Date.now()}`;

  // Resolve WorkspaceService for registration
  const container = createWorkflowProductionContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );

  try {
    // 3. Create required directories
    const unitsTarget = path.join(tmpDir, '.chainglass', 'units');
    const workflowsDir = path.join(tmpDir, '.chainglass', 'data', 'workflows');
    const graphsDir = path.join(tmpDir, '.chainglass', 'graphs');
    await fs.mkdir(unitsTarget, { recursive: true });
    await fs.mkdir(workflowsDir, { recursive: true });
    await fs.mkdir(graphsDir, { recursive: true });

    // 4. Copy units from fixture
    await fs.cp(unitsSource, unitsTarget, { recursive: true });

    // 5. Make scripts executable
    await makeScriptsExecutable(unitsTarget);

    // 6. Register workspace so CLI --workspace-path resolves (DYK-P3#1)
    await workspaceService.add(workspaceSlug, tmpDir);

    // 7. Build loader and service stack
    const loader = buildDiskLoader(tmpDir);
    const stack: TestServiceStack = await createTestServiceStack(`tg-${fixtureName}`, loader);
    stackWorkspacePath = stack.workspacePath;

    // Override the workspace path to use OUR temp dir (createTestServiceStack makes its own)
    // We need to use our tmpDir because that's where units are copied
    const tgc: TestGraphContext = {
      ctx: {
        workspaceSlug,
        workspaceName: `Test Graph: ${fixtureName}`,
        workspacePath: tmpDir,
        worktreePath: tmpDir,
        worktreeBranch: null,
        isMainWorktree: true,
        hasGit: false,
      },
      service: stack.service,
      workspacePath: tmpDir,
    };

    // 8. Run the test
    await testFn(tgc);
  } finally {
    if (options.preserveOnSuccess) {
      // Keep workspace for post-run inspection — don't unregister or delete
    } else {
      // 9. Unregister workspace, then clean up temp dirs
      try {
        await workspaceService.remove(workspaceSlug);
      } catch {
        // Best-effort cleanup — don't mask test errors
      }
      await fs.rm(tmpDir, { recursive: true, force: true });
      if (stackWorkspacePath && stackWorkspacePath !== tmpDir) {
        await fs.rm(stackWorkspacePath, { recursive: true, force: true });
      }
    }
  }
}

/**
 * Build a disk-backed IWorkUnitService that reads unit.yaml from the temp workspace.
 * Shared by both PositionalGraphService (addNode validation) and ODS (script path resolution).
 *
 * Workshop 09: IWorkUnitService is a structural superset of IWorkUnitLoader.
 * One instance serves both consumers via TypeScript structural typing.
 */
export function buildDiskWorkUnitService(workspacePath: string) {
  const nodeFs = new NodeFileSystemAdapter();
  const yamlParser = new YamlParserAdapter();

  return {
    async load(_ctx: WorkspaceContext, slug: string) {
      const unitPath = path.join(workspacePath, '.chainglass', 'units', slug, 'unit.yaml');
      try {
        const content = await nodeFs.readFile(unitPath);
        const parsed = yamlParser.parse(content, unitPath) as WorkUnitInstance;
        return { unit: parsed, errors: [] as Array<{ code: string; message: string }> };
      } catch {
        return {
          unit: undefined,
          errors: [{ code: 'UNIT_NOT_FOUND', message: `Unit '${slug}' not found at ${unitPath}` }],
        };
      }
    },
    async list() {
      return {
        units: [] as WorkUnitSummary[],
        errors: [] as Array<{ code: string; message: string }>,
      };
    },
    async validate() {
      return { valid: true, errors: [] as Array<{ code: string; message: string }> };
    },
    async create(_ctx: WorkspaceContext, spec: { slug: string; type: string }) {
      return { slug: spec.slug, type: spec.type as 'agent' | 'code' | 'user-input', errors: [] };
    },
    async update(_ctx: WorkspaceContext, slug: string) {
      return { slug, errors: [] };
    },
    async delete() {
      return { deleted: true, errors: [] };
    },
    async rename(_ctx: WorkspaceContext, _old: string, newSlug: string) {
      return { newSlug, updatedFiles: [], errors: [] };
    },
  } satisfies IWorkUnitService;
}

/** Return value from createTestOrchestrationStack. */
export interface TestOrchestrationStack {
  orchestrationService: OrchestrationService;
  eventHandlerService: EventHandlerService;
  agentManager: FakeAgentManagerService;
  podManager: PodManager;
}

/**
 * Create a full orchestration stack wired with real ScriptRunner.
 * Workshop 09: exact constructor signatures proven against real code.
 */
export function createTestOrchestrationStack(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  workUnitService: ReturnType<typeof buildDiskWorkUnitService>
): TestOrchestrationStack {
  // Event System
  const eventRegistry = new FakeNodeEventRegistry();
  registerCoreEventTypes(eventRegistry);
  const handlerRegistry = createEventHandlerRegistry();
  const nes = new NodeEventService(
    {
      registry: eventRegistry,
      loadState: async (graphSlug: string) => service.loadGraphState(ctx, graphSlug),
      persistState: async (graphSlug: string, state: State) =>
        service.persistGraphState(ctx, graphSlug, state),
    },
    handlerRegistry
  );
  const eventHandlerService = new EventHandlerService(nes);

  // Orchestration Components
  const nodeFs = new NodeFileSystemAdapter();
  const onbas = new ONBAS();
  const contextService = new AgentContextService();
  const podManager = new PodManager(nodeFs);
  const agentManager = new FakeAgentManagerService();
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
    onbas,
    eventHandlerService,
    createPerHandleDeps: () => ({ podManager, ods }),
  });

  return { orchestrationService, eventHandlerService, agentManager, podManager };
}
