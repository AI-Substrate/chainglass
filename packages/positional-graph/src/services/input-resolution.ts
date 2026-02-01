import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import type { IYamlParser } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import type { PositionalGraphAdapter } from '../adapter/positional-graph.adapter.js';
import type {
  AvailableSource,
  CanRunResult,
  IWorkUnitLoader,
  InputEntry,
  InputPack,
  NarrowWorkUnit,
  NarrowWorkUnitInput,
} from '../interfaces/index.js';
import type {
  InputResolution,
  NodeConfig,
  PositionalGraphDefinition,
  State,
} from '../schemas/index.js';
import { NodeConfigSchema } from '../schemas/index.js';

/**
 * Core input resolution algorithm for the positional graph.
 * Resolves each declared input on a node to available/waiting/error.
 *
 * Traversal order (deterministic):
 * 1. Same line, positions < N (left to right)
 * 2. Preceding lines, nearest first (each line left to right)
 */
export async function collateInputs(
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  definition: PositionalGraphDefinition,
  state: State,
  nodeConfig: NodeConfig,
  workUnit: NarrowWorkUnit,
  deps: {
    fs: IFileSystem;
    pathResolver: IPathResolver;
    yamlParser: IYamlParser;
    adapter: PositionalGraphAdapter;
    workUnitLoader: IWorkUnitLoader;
  }
): Promise<InputPack> {
  const inputs: Record<string, InputEntry> = {};

  // Find the node's position in the graph
  const nodeLocation = findNodeInDef(definition, nodeId);
  if (!nodeLocation) {
    // Node not in graph — this shouldn't happen if called correctly
    return { inputs: {}, ok: true };
  }

  // Process each declared input on the WorkUnit
  for (const declaredInput of workUnit.inputs) {
    const wiring = nodeConfig.inputs?.[declaredInput.name];

    if (!wiring) {
      // Unwired input
      if (declaredInput.required) {
        inputs[declaredInput.name] = {
          status: 'error',
          detail: {
            inputName: declaredInput.name,
            required: true,
            code: 'E160',
            message: `Input '${declaredInput.name}' is not wired on node '${nodeId}'`,
          },
        };
      }
      // Optional unwired → omit from result
      continue;
    }

    // Resolve the source
    const entry = await resolveInput(
      ctx,
      graphSlug,
      nodeId,
      declaredInput,
      wiring,
      nodeLocation,
      definition,
      state,
      deps
    );
    inputs[declaredInput.name] = entry;
  }

  // ok = all required inputs are available
  const ok = workUnit.inputs
    .filter((i) => i.required)
    .every((i) => {
      const entry = inputs[i.name];
      if (!entry) return false; // shouldn't happen for required
      return entry.status === 'available';
    });

  return { inputs, ok };
}

// ============================================
// Internal helpers
// ============================================

interface NodeLocation {
  lineIndex: number;
  nodePositionInLine: number;
}

function findNodeInDef(
  definition: PositionalGraphDefinition,
  nodeId: string
): NodeLocation | undefined {
  for (let lineIndex = 0; lineIndex < definition.lines.length; lineIndex++) {
    const pos = definition.lines[lineIndex].nodes.indexOf(nodeId);
    if (pos !== -1) {
      return { lineIndex, nodePositionInLine: pos };
    }
  }
  return undefined;
}

/**
 * Collect all candidate source node IDs matching a from_unit slug,
 * using the deterministic backward search order:
 * 1. Same line, positions < N (left to right)
 * 2. Preceding lines, nearest first (each line left to right)
 */
function findSourcesByUnit(
  definition: PositionalGraphDefinition,
  unitSlug: string,
  nodeLocation: NodeLocation,
  allNodeConfigs: Map<string, NodeConfig>
): string[] {
  const matches: string[] = [];

  // 1. Same line, positions < N (left to right, i.e. 0 to N-1)
  const sameLine = definition.lines[nodeLocation.lineIndex];
  for (let pos = 0; pos < nodeLocation.nodePositionInLine; pos++) {
    const candidateId = sameLine.nodes[pos];
    const config = allNodeConfigs.get(candidateId);
    if (config && config.unit_slug === unitSlug) {
      matches.push(candidateId);
    }
  }

  // 2. Preceding lines, nearest first (lineIndex-1 down to 0), each line left to right
  for (let li = nodeLocation.lineIndex - 1; li >= 0; li--) {
    const line = definition.lines[li];
    for (const candidateId of line.nodes) {
      const config = allNodeConfigs.get(candidateId);
      if (config && config.unit_slug === unitSlug) {
        matches.push(candidateId);
      }
    }
  }

  return matches;
}

/**
 * Check if a node ID is in scope (preceding lines or same line earlier position).
 */
function isInScope(
  definition: PositionalGraphDefinition,
  targetNodeId: string,
  nodeLocation: NodeLocation
): boolean {
  // Check same line, earlier positions
  const sameLine = definition.lines[nodeLocation.lineIndex];
  const posInSameLine = sameLine.nodes.indexOf(targetNodeId);
  if (posInSameLine !== -1 && posInSameLine < nodeLocation.nodePositionInLine) {
    return true;
  }

  // Check preceding lines
  for (let li = 0; li < nodeLocation.lineIndex; li++) {
    if (definition.lines[li].nodes.includes(targetNodeId)) {
      return true;
    }
  }

  return false;
}

/**
 * Load node data (data.json) for a completed node.
 * Per DYK-P5-I2: JSON.parse, no Zod schema — system-written data.
 */
async function loadNodeData(
  fs: IFileSystem,
  pathResolver: IPathResolver,
  adapter: PositionalGraphAdapter,
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string
): Promise<Record<string, unknown> | undefined> {
  const graphDir = adapter.getGraphDir(ctx, graphSlug);
  const dataPath = pathResolver.join(graphDir, 'nodes', nodeId, 'data', 'data.json');

  const exists = await fs.exists(dataPath);
  if (!exists) return undefined;

  const content = await fs.readFile(dataPath);
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Load all node configs from the graph.
 */
async function loadAllNodeConfigs(
  definition: PositionalGraphDefinition,
  fs: IFileSystem,
  pathResolver: IPathResolver,
  yamlParser: IYamlParser,
  adapter: PositionalGraphAdapter,
  ctx: WorkspaceContext,
  graphSlug: string
): Promise<Map<string, NodeConfig>> {
  const configs = new Map<string, NodeConfig>();
  const graphDir = adapter.getGraphDir(ctx, graphSlug);

  for (const line of definition.lines) {
    for (const nid of line.nodes) {
      const nodePath = pathResolver.join(graphDir, 'nodes', nid, 'node.yaml');
      const exists = await fs.exists(nodePath);
      if (!exists) continue;

      const content = await fs.readFile(nodePath);
      const parsed = yamlParser.parse(content, nodePath);
      const validated = NodeConfigSchema.safeParse(parsed);
      if (validated.success) {
        configs.set(nid, validated.data);
      }
    }
  }

  return configs;
}

async function resolveInput(
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  declaredInput: NarrowWorkUnitInput,
  wiring: InputResolution,
  nodeLocation: NodeLocation,
  definition: PositionalGraphDefinition,
  state: State,
  deps: {
    fs: IFileSystem;
    pathResolver: IPathResolver;
    yamlParser: IYamlParser;
    adapter: PositionalGraphAdapter;
    workUnitLoader: IWorkUnitLoader;
  }
): Promise<InputEntry> {
  const { fs, pathResolver, yamlParser, adapter, workUnitLoader } = deps;

  // Load all node configs for slug matching
  const allNodeConfigs = await loadAllNodeConfigs(
    definition,
    fs,
    pathResolver,
    yamlParser,
    adapter,
    ctx,
    graphSlug
  );

  // Determine source node IDs
  let sourceNodeIds: string[];

  if ('from_node' in wiring) {
    // from_node: direct ID lookup
    const targetId = wiring.from_node;
    const inScope = isInScope(definition, targetId, nodeLocation);
    if (!inScope) {
      // Not in scope (forward ref or not found) → waiting
      return {
        status: 'waiting',
        detail: {
          inputName: declaredInput.name,
          required: declaredInput.required,
          available: [],
          waiting: [targetId],
          hint: `Node '${targetId}' is not in scope (forward reference or not found)`,
        },
      };
    }
    sourceNodeIds = [targetId];
  } else {
    // from_unit: backward search collecting all matches
    sourceNodeIds = findSourcesByUnit(definition, wiring.from_unit, nodeLocation, allNodeConfigs);

    if (sourceNodeIds.length === 0) {
      // No matches found → waiting (forward ref semantics)
      return {
        status: 'waiting',
        detail: {
          inputName: declaredInput.name,
          required: declaredInput.required,
          available: [],
          waiting: [],
          hint: `No node matching '${wiring.from_unit}' found in scope`,
        },
      };
    }
  }

  // Validate output is declared on each source's WorkUnit
  const fromOutput = wiring.from_output;
  for (const srcId of sourceNodeIds) {
    const srcConfig = allNodeConfigs.get(srcId);
    if (!srcConfig) continue;

    const srcUnitResult = await workUnitLoader.load(ctx, srcConfig.unit_slug);
    if (srcUnitResult.errors.length > 0 || !srcUnitResult.unit) continue;

    const outputDecl = srcUnitResult.unit.outputs.find((o) => o.name === fromOutput);
    if (!outputDecl) {
      return {
        status: 'error',
        detail: {
          inputName: declaredInput.name,
          required: declaredInput.required,
          code: 'E163',
          message: `Output '${fromOutput}' is not declared on unit '${srcConfig.unit_slug}'`,
        },
      };
    }
  }

  // Check completion status of each source
  const available: AvailableSource[] = [];
  const waiting: string[] = [];

  for (const srcId of sourceNodeIds) {
    const nodeState = state.nodes?.[srcId];
    if (nodeState?.status === 'complete') {
      // Load data
      const data = await loadNodeData(fs, pathResolver, adapter, ctx, graphSlug, srcId);
      available.push({
        sourceNodeId: srcId,
        sourceOutput: fromOutput,
        data: data?.[fromOutput],
      });
    } else {
      waiting.push(srcId);
    }
  }

  if (waiting.length === 0) {
    // All sources complete
    return {
      status: 'available',
      detail: {
        inputName: declaredInput.name,
        required: declaredInput.required,
        sources: available,
      },
    };
  }

  // Some or all waiting
  return {
    status: 'waiting',
    detail: {
      inputName: declaredInput.name,
      required: declaredInput.required,
      available,
      waiting,
    },
  };
}

// ============================================
// canRun — 4-gate readiness algorithm
// ============================================

/**
 * Determines if a node is eligible to execute.
 * Checks 4 gates in order, short-circuits on failure.
 *
 * Gate 1: All preceding lines complete
 * Gate 2: Transition gate open (if preceding line is manual)
 * Gate 3: Serial left neighbor complete (skipped for parallel nodes)
 * Gate 4: All required inputs available (collateInputs.ok)
 */
export function canRun(
  nodeId: string,
  definition: PositionalGraphDefinition,
  state: State,
  inputPack: InputPack,
  nodeConfig: NodeConfig
): CanRunResult {
  const nodeLocation = findNodeInDef(definition, nodeId);
  if (!nodeLocation) {
    return {
      canRun: false,
      reason: 'Node not found in graph',
      inputPack,
    };
  }

  const { lineIndex, nodePositionInLine } = nodeLocation;

  // Gate 1: All preceding lines complete
  const blockingNodes: string[] = [];
  for (let li = 0; li < lineIndex; li++) {
    const line = definition.lines[li];
    for (const nid of line.nodes) {
      const ns = state.nodes?.[nid];
      if (!ns || ns.status !== 'complete') {
        blockingNodes.push(nid);
      }
    }
  }

  const precedingLinesComplete = blockingNodes.length === 0;
  if (!precedingLinesComplete) {
    return {
      canRun: false,
      reason: `Preceding lines not complete: ${blockingNodes.length} node(s) pending`,
      gate: 'preceding',
      inputPack,
      blockingNodes,
    };
  }

  // Gate 2: Transition gate (if immediately preceding line has transition: manual)
  let transitionOpen = true;
  let waitingForTransition = false;
  if (lineIndex > 0) {
    const precedingLine = definition.lines[lineIndex - 1];
    if (precedingLine.transition === 'manual') {
      const trigger = state.transitions?.[precedingLine.id];
      if (!trigger?.triggered) {
        transitionOpen = false;
        waitingForTransition = true;
      }
    }
  }

  if (!transitionOpen) {
    return {
      canRun: false,
      reason: 'Transition gate closed — manual trigger required',
      gate: 'transition',
      inputPack,
      waitingForTransition: true,
    };
  }

  // Gate 3: Serial left neighbor complete (skipped for parallel nodes)
  let serialNeighborComplete = true;
  let waitingForSerial: string | undefined;

  if (nodeConfig.execution !== 'parallel' && nodePositionInLine > 0) {
    const leftNeighborId = definition.lines[lineIndex].nodes[nodePositionInLine - 1];
    const leftNeighborState = state.nodes?.[leftNeighborId];
    if (!leftNeighborState || leftNeighborState.status !== 'complete') {
      serialNeighborComplete = false;
      waitingForSerial = leftNeighborId;
    }
  }

  if (!serialNeighborComplete) {
    return {
      canRun: false,
      reason: `Serial left neighbor '${waitingForSerial}' not complete`,
      gate: 'serial',
      inputPack,
      waitingForSerial,
    };
  }

  // Gate 4: Input availability
  if (!inputPack.ok) {
    return {
      canRun: false,
      reason: 'Required inputs not available',
      gate: 'inputs',
      inputPack,
    };
  }

  return {
    canRun: true,
    inputPack,
  };
}
