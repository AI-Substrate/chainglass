/**
 * WorkNodeService - Real implementation of IWorkNodeService.
 *
 * Per Phase 5: Implements node execution operations.
 * Per DYK#6: Orchestrator controls pending→ready via markReady().
 * Per DYK#7: WorkNodeService owns state.json after graph creation.
 *
 * Per ADR-0004: Uses constructor injection with useFactory pattern.
 * Per Critical Discovery 02: All methods return results with errors array.
 * Per Critical Discovery 03: State changes use atomic writes.
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';

import {
  cannotExecuteBlockedError,
  fileNotFoundError,
  graphNotFoundError,
  nodeNotFoundError,
  pathTraversalError,
} from '../errors/index.js';
import type {
  AnswerResult,
  AskResult,
  BlockingNode,
  CanEndResult,
  CanRunResult,
  ClearOptions,
  ClearResult,
  EndResult,
  GetAnswerResult,
  GetInputDataResult,
  GetInputFileResult,
  GetOutputDataResult,
  IWorkGraphService,
  IWorkNodeService,
  IWorkUnitService,
  MarkReadyResult,
  Question,
  SaveOutputDataResult,
  SaveOutputFileResult,
  StartResult,
} from '../interfaces/index.js';
import { WorkGraphStateSchema } from '../schemas/index.js';
import { atomicWriteJson } from './atomic-file.js';

// ============================================
// Internal Types
// ============================================

interface StateData {
  graph_status: string;
  updated_at: string;
  nodes: Record<
    string,
    {
      status: string;
      started_at?: string;
      completed_at?: string;
      ready_at?: string;
    }
  >;
}

// ============================================
// WorkNodeService Implementation
// ============================================

/**
 * Real WorkNode service implementation.
 *
 * Per spec AC-09: canRun() checks if node can be executed.
 * Per spec AC-10: start() begins node execution (returns E110 if blocked).
 * Per spec AC-11: end() completes node execution.
 * Per DYK#6: markReady() transitions pending→ready for orchestrator.
 */
export class WorkNodeService implements IWorkNodeService {
  // Note: graphsDir removed per Plan 021 Phase 2 T007
  // Path helpers added in T008 derive from WorkspaceContext

  /**
   * @param fs - File system interface
   * @param pathResolver - Path resolution interface
   * @param workGraphService - WorkGraph service for graph operations
   * @param workUnitService - Optional WorkUnit service for unit validation
   */
  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly workGraphService: IWorkGraphService,
    private readonly workUnitService?: IWorkUnitService
  ) {}

  // ============================================
  // Path Helpers (Plan 021 T008)
  // ============================================

  /**
   * Get the work-graphs directory for a workspace.
   *
   * Per ADR-0008: Split storage model uses `<worktree>/.chainglass/data/work-graphs/`
   *
   * @param ctx - Workspace context
   * @returns Absolute path to work-graphs directory
   */
  protected getGraphsDir(ctx: WorkspaceContext): string {
    return this.pathResolver.join(ctx.worktreePath, '.chainglass/data/work-graphs');
  }

  /**
   * Get the path to a specific node within a graph.
   *
   * @param ctx - Workspace context
   * @param graphSlug - Graph identifier
   * @param nodeId - Node identifier
   * @returns Absolute path to node directory
   */
  protected getNodePath(ctx: WorkspaceContext, graphSlug: string, nodeId: string): string {
    return this.pathResolver.join(this.getGraphsDir(ctx), graphSlug, 'nodes', nodeId);
  }

  /**
   * Get the path to a node's data directory.
   *
   * @param ctx - Workspace context
   * @param graphSlug - Graph identifier
   * @param nodeId - Node identifier
   * @returns Absolute path to node data directory
   */
  protected getNodeDataDir(ctx: WorkspaceContext, graphSlug: string, nodeId: string): string {
    return this.pathResolver.join(this.getNodePath(ctx, graphSlug, nodeId), 'data');
  }

  /**
   * Get both absolute and relative paths for an output file.
   *
   * Per DYK Session: saveOutputData/saveOutputFile need dual paths -
   * absolute for FS write, relative for data.json storage.
   *
   * @param ctx - Workspace context
   * @param graphSlug - Graph identifier
   * @param nodeId - Node identifier
   * @param fileName - Output file name
   * @returns Object with absolute and relative paths
   */
  protected getOutputPaths(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    fileName: string
  ): { absolute: string; relative: string } {
    const relative = `.chainglass/data/work-graphs/${graphSlug}/nodes/${nodeId}/outputs/${fileName}`;
    const absolute = this.pathResolver.join(ctx.worktreePath, relative);
    return { absolute, relative };
  }

  // ============================================
  // canRun
  // ============================================

  /**
   * Check if a node can be run.
   *
   * A node can run when all upstream nodes are complete
   * and all required inputs are available.
   *
   * Per DYK#6: Start node is structural only (no outputs).
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to check
   * @returns CanRunResult with canRun flag and blocking info
   */
  async canRun(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<CanRunResult> {
    // 1. Load graph status
    const statusResult = await this.workGraphService.status(ctx, graphSlug);
    if (statusResult.errors.length > 0) {
      // Convert E101 or pass through errors
      return {
        canRun: false,
        errors: statusResult.errors,
      };
    }

    // 2. Find the node
    const nodeStatus = statusResult.nodes.find((n) => n.id === nodeId);
    if (!nodeStatus) {
      return {
        canRun: false,
        errors: [nodeNotFoundError(graphSlug, nodeId)],
      };
    }

    // 3. Load graph structure to find upstream nodes
    const loadResult = await this.workGraphService.load(ctx, graphSlug);
    if (loadResult.errors.length > 0 || !loadResult.graph) {
      return {
        canRun: false,
        errors: loadResult.errors.length > 0 ? loadResult.errors : [graphNotFoundError(graphSlug)],
      };
    }

    const graph = loadResult.graph;

    // 4. Find upstream nodes (nodes with edges pointing TO this node)
    const upstreamNodeIds = graph.edges.filter((e) => e.to === nodeId).map((e) => e.from);

    // 5. Check all upstream nodes are complete
    const blockingNodes: BlockingNode[] = [];
    for (const upstreamId of upstreamNodeIds) {
      const upstreamStatus = statusResult.nodes.find((n) => n.id === upstreamId);
      if (!upstreamStatus || upstreamStatus.status !== 'complete') {
        blockingNodes.push({
          nodeId: upstreamId,
          status: upstreamStatus?.status ?? 'unknown',
          requiredOutputs: [], // Would be populated by checking unit inputs
        });
      }
    }

    if (blockingNodes.length > 0) {
      return {
        canRun: false,
        reason: `Blocked by ${blockingNodes.length} node(s): ${blockingNodes.map((b) => b.nodeId).join(', ')}`,
        blockingNodes,
        errors: [],
      };
    }

    // 6. All upstream complete → can run
    return {
      canRun: true,
      errors: [],
    };
  }

  // ============================================
  // markReady
  // ============================================

  /**
   * Mark a node as ready for execution.
   *
   * Per DYK#6: Orchestrator controls pending→ready transition for UI visibility.
   * Validates canRun() internally before setting status to 'ready'.
   * Returns E110 if node cannot be run (blocked by upstream).
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to mark ready
   * @returns MarkReadyResult with new status
   */
  async markReady(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string
  ): Promise<MarkReadyResult> {
    // 1. Check current status
    const statusResult = await this.workGraphService.status(ctx, graphSlug);
    if (statusResult.errors.length > 0) {
      return {
        nodeId,
        status: '',
        readyAt: '',
        errors: statusResult.errors,
      };
    }

    const nodeStatus = statusResult.nodes.find((n) => n.id === nodeId);
    if (!nodeStatus) {
      return {
        nodeId,
        status: '',
        readyAt: '',
        errors: [nodeNotFoundError(graphSlug, nodeId)],
      };
    }

    // 2. If already ready, return success (idempotent)
    if (nodeStatus.status === 'ready') {
      return {
        nodeId,
        status: 'ready',
        readyAt: new Date().toISOString(),
        errors: [],
      };
    }

    // 3. If running, return E111
    if (nodeStatus.status === 'running') {
      return {
        nodeId,
        status: nodeStatus.status,
        readyAt: '',
        errors: [
          {
            code: 'E111',
            message: `Node '${nodeId}' is already running`,
            action: 'Wait for the node to complete or use clear() to reset it',
          },
        ],
      };
    }

    // 4. Check canRun
    const canRunResult = await this.canRun(ctx, graphSlug, nodeId);
    if (!canRunResult.canRun) {
      const blockingNodeIds = canRunResult.blockingNodes?.map((b) => b.nodeId) ?? [];
      return {
        nodeId,
        status: nodeStatus.status,
        readyAt: '',
        errors: [cannotExecuteBlockedError(nodeId, blockingNodeIds)],
      };
    }

    // 5. Update state.json atomically
    const readyAt = new Date().toISOString();
    const graphsDir = this.getGraphsDir(ctx);
    const statePath = this.pathResolver.join(graphsDir, graphSlug, 'state.json');

    let stateData: StateData = {
      graph_status: 'pending',
      updated_at: readyAt,
      nodes: {},
    };

    // Read existing state
    if (await this.fs.exists(statePath)) {
      try {
        const content = await this.fs.readFile(statePath);
        const parsed = JSON.parse(content);
        const validated = WorkGraphStateSchema.safeParse(parsed);
        if (validated.success) {
          stateData = {
            graph_status: validated.data.graph_status,
            updated_at: validated.data.updated_at,
            nodes: validated.data.nodes,
          };
        }
      } catch {
        // Use default state on error
      }
    }

    // Update node status
    stateData.nodes[nodeId] = {
      ...(stateData.nodes[nodeId] ?? {}),
      status: 'ready',
      ready_at: readyAt,
    };
    stateData.updated_at = readyAt;

    // Write atomically
    await atomicWriteJson(this.fs, statePath, stateData);

    return {
      nodeId,
      status: 'ready',
      readyAt,
      errors: [],
    };
  }

  // ============================================
  // start
  // ============================================

  /**
   * Start node execution.
   *
   * Transitions node status to 'running'.
   * Returns E110 if node cannot be run (use canRun() first).
   * Returns E111 if node is already running.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to start
   * @returns StartResult with new status
   */
  async start(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<StartResult> {
    // 1. Check current status
    const statusResult = await this.workGraphService.status(ctx, graphSlug);
    if (statusResult.errors.length > 0) {
      return {
        nodeId,
        status: '',
        startedAt: '',
        errors: statusResult.errors,
      };
    }

    const nodeStatus = statusResult.nodes.find((n) => n.id === nodeId);
    if (!nodeStatus) {
      return {
        nodeId,
        status: '',
        startedAt: '',
        errors: [nodeNotFoundError(graphSlug, nodeId)],
      };
    }

    // 2. If already running, return E111
    if (nodeStatus.status === 'running') {
      return {
        nodeId,
        status: nodeStatus.status,
        startedAt: '',
        errors: [
          {
            code: 'E111',
            message: `Node '${nodeId}' is already running`,
            action: 'Wait for the node to complete or use clear() to reset it',
          },
        ],
      };
    }

    // 3. Check canRun (only if not already ready - ready nodes can start)
    if (nodeStatus.status !== 'ready') {
      const canRunResult = await this.canRun(ctx, graphSlug, nodeId);
      if (!canRunResult.canRun) {
        const blockingNodeIds = canRunResult.blockingNodes?.map((b) => b.nodeId) ?? [];
        return {
          nodeId,
          status: nodeStatus.status,
          startedAt: '',
          errors: [cannotExecuteBlockedError(nodeId, blockingNodeIds)],
        };
      }
    }

    // 4. Update state.json atomically
    const startedAt = new Date().toISOString();
    const graphsDir = this.getGraphsDir(ctx);
    const statePath = this.pathResolver.join(graphsDir, graphSlug, 'state.json');

    let stateData: StateData = {
      graph_status: 'in_progress',
      updated_at: startedAt,
      nodes: {},
    };

    // Read existing state
    if (await this.fs.exists(statePath)) {
      try {
        const content = await this.fs.readFile(statePath);
        const parsed = JSON.parse(content);
        const validated = WorkGraphStateSchema.safeParse(parsed);
        if (validated.success) {
          stateData = {
            graph_status: validated.data.graph_status,
            updated_at: validated.data.updated_at,
            nodes: validated.data.nodes,
          };
        }
      } catch {
        // Use default state on error
      }
    }

    // Update node status
    stateData.nodes[nodeId] = {
      ...(stateData.nodes[nodeId] ?? {}),
      status: 'running',
      started_at: startedAt,
    };
    stateData.graph_status = 'in_progress';
    stateData.updated_at = startedAt;

    // Write atomically
    await atomicWriteJson(this.fs, statePath, stateData);

    return {
      nodeId,
      status: 'running',
      startedAt,
      errors: [],
    };
  }

  // ============================================
  // end
  // ============================================

  /**
   * End node execution.
   *
   * Validates that all required outputs are present.
   * Transitions node status to 'complete' if valid.
   * Returns E112 if node is not in running state.
   * Returns E113 if required outputs are missing.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to end
   * @returns EndResult with new status and any missing outputs
   */
  async end(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<EndResult> {
    // 1. Check current status
    const statusResult = await this.workGraphService.status(ctx, graphSlug);
    if (statusResult.errors.length > 0) {
      return {
        nodeId,
        status: '',
        completedAt: '',
        errors: statusResult.errors,
      };
    }

    const nodeStatus = statusResult.nodes.find((n) => n.id === nodeId);
    if (!nodeStatus) {
      return {
        nodeId,
        status: '',
        completedAt: '',
        errors: [nodeNotFoundError(graphSlug, nodeId)],
      };
    }

    // 2. If not running or pending, return E112
    // Note: pending is allowed for "direct output pattern" where orchestrator saves outputs without start()
    if (nodeStatus.status !== 'running' && nodeStatus.status !== 'pending') {
      return {
        nodeId,
        status: nodeStatus.status,
        completedAt: '',
        errors: [
          {
            code: 'E112',
            message: `Node '${nodeId}' is not in running or pending state (current: ${nodeStatus.status})`,
            action: 'Node must be pending (with outputs) or running to call end()',
          },
        ],
      };
    }

    // 3. Load node config to get unit slug
    const nodePath = this.getNodePath(ctx, graphSlug, nodeId);
    const nodeYamlPath = this.pathResolver.join(nodePath, 'node.yaml');

    let unitSlug = '';
    if (await this.fs.exists(nodeYamlPath)) {
      try {
        const nodeYamlContent = await this.fs.readFile(nodeYamlPath);
        // Simple extraction - unit_slug is stored explicitly per DYK#1
        const match = nodeYamlContent.match(/unit_slug:\s*([^\s\n]+)/);
        if (match) {
          unitSlug = match[1];
        }
      } catch {
        // Continue without unit validation
      }
    }

    // 4. Load unit to check required outputs
    const missingOutputs: string[] = [];
    if (this.workUnitService && unitSlug) {
      const unitResult = await this.workUnitService.load(ctx, unitSlug);
      if (unitResult.unit) {
        const requiredOutputs = unitResult.unit.outputs.filter((o) => o.required);

        // Load saved outputs from data.json
        const dataPath = this.pathResolver.join(nodePath, 'data', 'data.json');
        let savedOutputs: Record<string, unknown> = {};

        if (await this.fs.exists(dataPath)) {
          try {
            const dataContent = await this.fs.readFile(dataPath);
            const parsed = JSON.parse(dataContent);
            savedOutputs = parsed.outputs ?? {};
          } catch {
            // No outputs saved
          }
        }

        // Check each required output
        for (const output of requiredOutputs) {
          if (output.type === 'file') {
            // Check for file output
            const filePath = this.pathResolver.join(
              nodePath,
              'data',
              'outputs',
              `${output.name}.md`
            );
            if (!(await this.fs.exists(filePath))) {
              // Also check if it's in savedOutputs as a path
              if (!(output.name in savedOutputs)) {
                missingOutputs.push(output.name);
              }
            }
          } else {
            // Check for data output
            if (!(output.name in savedOutputs)) {
              missingOutputs.push(output.name);
            }
          }
        }
      }
    }

    // 5. If missing outputs, return E113
    if (missingOutputs.length > 0) {
      return {
        nodeId,
        status: 'running',
        completedAt: '',
        missingOutputs,
        errors: [
          {
            code: 'E113',
            message: `Missing required outputs: ${missingOutputs.join(', ')}`,
            action: 'Save all required outputs before calling end()',
          },
        ],
      };
    }

    // 6. Update state.json atomically
    const completedAt = new Date().toISOString();
    const graphsDir = this.getGraphsDir(ctx);
    const statePath = this.pathResolver.join(graphsDir, graphSlug, 'state.json');

    let stateData: StateData = {
      graph_status: 'in_progress',
      updated_at: completedAt,
      nodes: {},
    };

    // Read existing state
    if (await this.fs.exists(statePath)) {
      try {
        const content = await this.fs.readFile(statePath);
        const parsed = JSON.parse(content);
        const validated = WorkGraphStateSchema.safeParse(parsed);
        if (validated.success) {
          stateData = {
            graph_status: validated.data.graph_status,
            updated_at: validated.data.updated_at,
            nodes: validated.data.nodes,
          };
        }
      } catch {
        // Use default state on error
      }
    }

    // Update node status
    stateData.nodes[nodeId] = {
      ...(stateData.nodes[nodeId] ?? {}),
      status: 'complete',
      completed_at: completedAt,
    };
    stateData.updated_at = completedAt;

    // Write atomically
    await atomicWriteJson(this.fs, statePath, stateData);

    return {
      nodeId,
      status: 'complete',
      completedAt,
      errors: [],
    };
  }

  // ============================================
  // canEnd (query only)
  // ============================================

  /**
   * Check if a node can end (query only, no state change).
   *
   * Validates that all required outputs are present without
   * actually transitioning the node state.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to check
   * @returns CanEndResult with canEnd flag and any missing outputs
   */
  async canEnd(ctx: WorkspaceContext, graphSlug: string, nodeId: string): Promise<CanEndResult> {
    // 1. Check current status
    const statusResult = await this.workGraphService.status(ctx, graphSlug);
    if (statusResult.errors.length > 0) {
      return {
        nodeId,
        canEnd: false,
        missingOutputs: [],
        errors: statusResult.errors,
      };
    }

    const nodeStatus = statusResult.nodes.find((n) => n.id === nodeId);
    if (!nodeStatus) {
      return {
        nodeId,
        canEnd: false,
        missingOutputs: [],
        errors: [nodeNotFoundError(graphSlug, nodeId)],
      };
    }

    // 2. If not running or pending, cannot end
    // Note: pending is allowed for "direct output pattern" where orchestrator saves outputs without start()
    if (nodeStatus.status !== 'running' && nodeStatus.status !== 'pending') {
      return {
        nodeId,
        canEnd: false,
        missingOutputs: [],
        errors: [
          {
            code: 'E112',
            message: `Node '${nodeId}' is not in running or pending state (current: ${nodeStatus.status})`,
            action: 'Node must be pending (with outputs) or running to call end()',
          },
        ],
      };
    }

    // 3. Load node config to get unit slug
    const nodePath = this.getNodePath(ctx, graphSlug, nodeId);
    const nodeYamlPath = this.pathResolver.join(nodePath, 'node.yaml');

    let unitSlug = '';
    if (await this.fs.exists(nodeYamlPath)) {
      try {
        const nodeYamlContent = await this.fs.readFile(nodeYamlPath);
        const match = nodeYamlContent.match(/unit_slug:\s*([^\s\n]+)/);
        if (match) {
          unitSlug = match[1];
        }
      } catch {
        // Continue without unit validation
      }
    }

    // 4. Load unit to check required outputs
    const missingOutputs: string[] = [];
    if (this.workUnitService && unitSlug) {
      const unitResult = await this.workUnitService.load(ctx, unitSlug);
      if (unitResult.unit) {
        const requiredOutputs = unitResult.unit.outputs.filter((o) => o.required);

        // Load saved outputs from data.json
        const dataPath = this.pathResolver.join(nodePath, 'data', 'data.json');
        let savedOutputs: Record<string, unknown> = {};

        if (await this.fs.exists(dataPath)) {
          try {
            const dataContent = await this.fs.readFile(dataPath);
            const parsed = JSON.parse(dataContent);
            savedOutputs = parsed.outputs ?? {};
          } catch {
            // No outputs saved
          }
        }

        // Check each required output
        for (const output of requiredOutputs) {
          if (output.type === 'file') {
            const filePath = this.pathResolver.join(
              nodePath,
              'data',
              'outputs',
              `${output.name}.md`
            );
            if (!(await this.fs.exists(filePath))) {
              if (!(output.name in savedOutputs)) {
                missingOutputs.push(output.name);
              }
            }
          } else {
            if (!(output.name in savedOutputs)) {
              missingOutputs.push(output.name);
            }
          }
        }
      }
    }

    // 5. Return result (no state mutation)
    return {
      nodeId,
      canEnd: missingOutputs.length === 0,
      missingOutputs: missingOutputs.length > 0 ? missingOutputs : undefined,
      errors: [],
    };
  }

  // ============================================
  // getInputData
  // ============================================

  /**
   * Get input data for a node.
   *
   * Resolves the input value from the upstream node's outputs.
   * Traverses edges via input mapping stored in node.yaml.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to get input for
   * @param inputName - Name of the input to get
   * @returns GetInputDataResult with resolved value
   */
  async getInputData(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string
  ): Promise<GetInputDataResult> {
    // 1. Validate node exists
    const statusResult = await this.workGraphService.status(ctx, graphSlug);
    if (statusResult.errors.length > 0) {
      return {
        nodeId,
        inputName,
        errors: statusResult.errors,
      };
    }

    const nodeStatus = statusResult.nodes.find((n) => n.id === nodeId);
    if (!nodeStatus) {
      return {
        nodeId,
        inputName,
        errors: [nodeNotFoundError(graphSlug, nodeId)],
      };
    }

    // 2. Load node config to get input mapping
    const nodePath = this.getNodePath(ctx, graphSlug, nodeId);
    const nodeYamlPath = this.pathResolver.join(nodePath, 'node.yaml');

    if (!(await this.fs.exists(nodeYamlPath))) {
      return {
        nodeId,
        inputName,
        errors: [
          {
            code: 'E117',
            message: `Input '${inputName}' not available for node '${nodeId}'`,
            action: 'Ensure upstream node has completed and produced this output',
          },
        ],
      };
    }

    let nodeConfig: {
      inputs?: Record<string, { from: string; output: string }>;
    } = {};

    try {
      const nodeYamlContent = await this.fs.readFile(nodeYamlPath);
      // Parse the YAML to get input mappings
      // For simplicity, we'll extract via regex for now
      const inputsMatch = nodeYamlContent.match(/inputs:\s*([\s\S]*?)(?=\n\w|$)/);
      if (inputsMatch) {
        // Look for the specific input
        const inputRegex = new RegExp(
          `${inputName}:\\s*\\n\\s*from:\\s*([^\\s\\n]+)\\s*\\n\\s*output:\\s*([^\\s\\n]+)`
        );
        const specificMatch = nodeYamlContent.match(inputRegex);
        if (specificMatch) {
          nodeConfig = {
            inputs: {
              [inputName]: { from: specificMatch[1], output: specificMatch[2] },
            },
          };
        }
      }
    } catch {
      // Continue with empty config
    }

    // 3. Check if input is mapped
    const inputMapping = nodeConfig.inputs?.[inputName];
    if (!inputMapping) {
      return {
        nodeId,
        inputName,
        errors: [
          {
            code: 'E117',
            message: `Input '${inputName}' not available for node '${nodeId}'`,
            action: 'Ensure upstream node has completed and produced this output',
          },
        ],
      };
    }

    // 4. Load source node's output
    const sourceNodeId = inputMapping.from;
    const sourceOutputName = inputMapping.output;

    const sourceDataPath = this.pathResolver.join(
      this.getNodePath(ctx, graphSlug, sourceNodeId),
      'data',
      'data.json'
    );

    if (!(await this.fs.exists(sourceDataPath))) {
      return {
        nodeId,
        inputName,
        errors: [
          {
            code: 'E117',
            message: `Input '${inputName}' not available for node '${nodeId}'`,
            action: `Ensure node '${sourceNodeId}' has completed and produced output '${sourceOutputName}'`,
          },
        ],
      };
    }

    try {
      const dataContent = await this.fs.readFile(sourceDataPath);
      const parsed = JSON.parse(dataContent);
      const outputs = parsed.outputs ?? {};

      if (!(sourceOutputName in outputs)) {
        return {
          nodeId,
          inputName,
          errors: [
            {
              code: 'E117',
              message: `Input '${inputName}' not available - source output '${sourceOutputName}' not found`,
              action: `Ensure node '${sourceNodeId}' has saved output '${sourceOutputName}'`,
            },
          ],
        };
      }

      return {
        nodeId,
        inputName,
        value: outputs[sourceOutputName],
        fromNode: sourceNodeId,
        fromOutput: sourceOutputName,
        errors: [],
      };
    } catch {
      return {
        nodeId,
        inputName,
        errors: [
          {
            code: 'E117',
            message: `Input '${inputName}' not available - failed to read source data`,
            action: `Check data.json for node '${sourceNodeId}'`,
          },
        ],
      };
    }
  }

  // ============================================
  // getInputFile
  // ============================================

  /**
   * Get input file path for a node.
   *
   * Resolves the file path from the upstream node's file outputs.
   * Per Discovery 10: Rejects paths containing '..' for security.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to get input for
   * @param inputName - Name of the input to get
   * @returns GetInputFileResult with resolved file path
   */
  async getInputFile(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    inputName: string
  ): Promise<GetInputFileResult> {
    // 1. Validate node exists
    const statusResult = await this.workGraphService.status(ctx, graphSlug);
    if (statusResult.errors.length > 0) {
      return {
        nodeId,
        inputName,
        errors: statusResult.errors,
      };
    }

    const nodeStatus = statusResult.nodes.find((n) => n.id === nodeId);
    if (!nodeStatus) {
      return {
        nodeId,
        inputName,
        errors: [nodeNotFoundError(graphSlug, nodeId)],
      };
    }

    // 2. Load node config to get input mapping
    const nodePath = this.getNodePath(ctx, graphSlug, nodeId);
    const nodeYamlPath = this.pathResolver.join(nodePath, 'node.yaml');

    if (!(await this.fs.exists(nodeYamlPath))) {
      return {
        nodeId,
        inputName,
        errors: [
          {
            code: 'E117',
            message: `Input file '${inputName}' not available for node '${nodeId}'`,
            action: 'Ensure upstream node has completed and produced this file output',
          },
        ],
      };
    }

    let nodeConfig: {
      inputs?: Record<string, { from: string; output: string }>;
    } = {};

    try {
      const nodeYamlContent = await this.fs.readFile(nodeYamlPath);
      // Parse the YAML to get input mappings
      const inputRegex = new RegExp(
        `${inputName}:\\s*\\n\\s*from:\\s*([^\\s\\n]+)\\s*\\n\\s*output:\\s*([^\\s\\n]+)`
      );
      const specificMatch = nodeYamlContent.match(inputRegex);
      if (specificMatch) {
        nodeConfig = {
          inputs: {
            [inputName]: { from: specificMatch[1], output: specificMatch[2] },
          },
        };
      }
    } catch {
      // Continue with empty config
    }

    // 3. Check if input is mapped
    const inputMapping = nodeConfig.inputs?.[inputName];
    if (!inputMapping) {
      return {
        nodeId,
        inputName,
        errors: [
          {
            code: 'E117',
            message: `Input file '${inputName}' not available for node '${nodeId}'`,
            action: 'Ensure upstream node has completed and produced this file output',
          },
        ],
      };
    }

    // 4. Load source node's output (file path)
    const sourceNodeId = inputMapping.from;
    const sourceOutputName = inputMapping.output;

    const sourceDataPath = this.pathResolver.join(
      this.getNodePath(ctx, graphSlug, sourceNodeId),
      'data',
      'data.json'
    );

    if (!(await this.fs.exists(sourceDataPath))) {
      return {
        nodeId,
        inputName,
        errors: [
          {
            code: 'E117',
            message: `Input file '${inputName}' not available for node '${nodeId}'`,
            action: `Ensure node '${sourceNodeId}' has completed and produced file output '${sourceOutputName}'`,
          },
        ],
      };
    }

    try {
      const dataContent = await this.fs.readFile(sourceDataPath);
      const parsed = JSON.parse(dataContent);
      const outputs = parsed.outputs ?? {};

      if (!(sourceOutputName in outputs)) {
        return {
          nodeId,
          inputName,
          errors: [
            {
              code: 'E117',
              message: `Input file '${inputName}' not available - source output '${sourceOutputName}' not found`,
              action: `Ensure node '${sourceNodeId}' has saved file output '${sourceOutputName}'`,
            },
          ],
        };
      }

      const filePath = outputs[sourceOutputName];

      // 5. Security check: reject paths containing '..'
      if (typeof filePath === 'string' && filePath.includes('..')) {
        return {
          nodeId,
          inputName,
          errors: [pathTraversalError(filePath)],
        };
      }

      return {
        nodeId,
        inputName,
        filePath: filePath as string,
        fromNode: sourceNodeId,
        fromOutput: sourceOutputName,
        errors: [],
      };
    } catch {
      return {
        nodeId,
        inputName,
        errors: [
          {
            code: 'E117',
            message: `Input file '${inputName}' not available - failed to read source data`,
            action: `Check data.json for node '${sourceNodeId}'`,
          },
        ],
      };
    }
  }

  // ============================================
  // getOutputData
  // ============================================

  /**
   * Get output data from a node.
   *
   * Reads the output value from the node's own saved outputs (data/data.json).
   * Used by orchestrators to read completed node results.
   * Note: Unlike getInputData which reads from upstream nodes,
   * this reads from the node's own outputs (semantic asymmetry by design).
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to get output from
   * @param outputName - Name of the output to get
   * @returns GetOutputDataResult with the output value
   */
  async getOutputData(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string
  ): Promise<GetOutputDataResult> {
    // 1. Validate node exists
    const statusResult = await this.workGraphService.status(ctx, graphSlug);
    if (statusResult.errors.length > 0) {
      return {
        nodeId,
        outputName,
        errors: statusResult.errors,
      };
    }

    const nodeStatus = statusResult.nodes.find((n) => n.id === nodeId);
    if (!nodeStatus) {
      return {
        nodeId,
        outputName,
        errors: [nodeNotFoundError(graphSlug, nodeId)],
      };
    }

    // 2. Load the node's own data.json to get outputs
    const nodePath = this.getNodePath(ctx, graphSlug, nodeId);
    const dataPath = this.pathResolver.join(nodePath, 'data', 'data.json');

    if (!(await this.fs.exists(dataPath))) {
      return {
        nodeId,
        outputName,
        errors: [
          {
            code: 'E118',
            message: `Output '${outputName}' not available for node '${nodeId}' - no outputs saved`,
            action: 'Ensure the node has saved outputs before reading',
          },
        ],
      };
    }

    try {
      const dataContent = await this.fs.readFile(dataPath);
      const parsed = JSON.parse(dataContent);
      const outputs = parsed.outputs ?? {};

      if (!(outputName in outputs)) {
        return {
          nodeId,
          outputName,
          errors: [
            {
              code: 'E118',
              message: `Output '${outputName}' not found in node '${nodeId}'`,
              action: `Ensure the node has saved output '${outputName}'`,
            },
          ],
        };
      }

      return {
        nodeId,
        outputName,
        value: outputs[outputName],
        errors: [],
      };
    } catch {
      return {
        nodeId,
        outputName,
        errors: [
          {
            code: 'E118',
            message: `Failed to read output '${outputName}' from node '${nodeId}'`,
            action: `Check data.json for node '${nodeId}'`,
          },
        ],
      };
    }
  }

  // ============================================
  // saveOutputData
  // ============================================

  /**
   * Save output data for a node.
   *
   * Writes value to data/data.json outputs object.
   * Per Discovery 12: Overwrites existing outputs without confirmation.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to save output for
   * @param outputName - Name of the output
   * @param value - Value to save
   * @returns SaveOutputDataResult with save status
   */
  async saveOutputData(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string,
    value: unknown
  ): Promise<SaveOutputDataResult> {
    // 1. Validate node exists
    const statusResult = await this.workGraphService.status(ctx, graphSlug);
    if (statusResult.errors.length > 0) {
      return {
        nodeId,
        outputName,
        saved: false,
        errors: statusResult.errors,
      };
    }

    const nodeStatus = statusResult.nodes.find((n) => n.id === nodeId);
    if (!nodeStatus) {
      return {
        nodeId,
        outputName,
        saved: false,
        errors: [nodeNotFoundError(graphSlug, nodeId)],
      };
    }

    // 2. Ensure data directory exists
    const nodePath = this.getNodePath(ctx, graphSlug, nodeId);
    const dataDir = this.pathResolver.join(nodePath, 'data');
    const dataPath = this.pathResolver.join(dataDir, 'data.json');

    if (!(await this.fs.exists(dataDir))) {
      await this.fs.mkdir(dataDir, { recursive: true });
    }

    // 3. Load existing data or create new
    let data: { outputs: Record<string, unknown> } = { outputs: {} };

    if (await this.fs.exists(dataPath)) {
      try {
        const content = await this.fs.readFile(dataPath);
        data = JSON.parse(content);
        if (!data.outputs) {
          data.outputs = {};
        }
      } catch {
        // Reset to empty on parse error
        data = { outputs: {} };
      }
    }

    // 4. Save the output value (overwrite per Discovery 12)
    data.outputs[outputName] = value;

    // 5. Write atomically
    await atomicWriteJson(this.fs, dataPath, data);

    return {
      nodeId,
      outputName,
      saved: true,
      errors: [],
    };
  }

  // ============================================
  // saveOutputFile
  // ============================================

  /**
   * Save output file for a node.
   *
   * Copies the source file to node storage.
   * Per Discovery 10: Rejects paths containing '..' for security.
   * Per Discovery 12: Overwrites existing outputs without confirmation.
   *
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to save output for
   * @param outputName - Name of the output
   * @param sourcePath - Path to the source file to copy
   * @returns SaveOutputFileResult with save status and saved path
   */
  async saveOutputFile(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    outputName: string,
    sourcePath: string
  ): Promise<SaveOutputFileResult> {
    // 1. Security check: reject paths containing '..'
    if (sourcePath.includes('..')) {
      return {
        nodeId,
        outputName,
        saved: false,
        errors: [pathTraversalError(sourcePath)],
      };
    }

    // 2. Validate node exists
    const statusResult = await this.workGraphService.status(ctx, graphSlug);
    if (statusResult.errors.length > 0) {
      return {
        nodeId,
        outputName,
        saved: false,
        errors: statusResult.errors,
      };
    }

    const nodeStatus = statusResult.nodes.find((n) => n.id === nodeId);
    if (!nodeStatus) {
      return {
        nodeId,
        outputName,
        saved: false,
        errors: [nodeNotFoundError(graphSlug, nodeId)],
      };
    }

    // 3. Check source file exists
    if (!(await this.fs.exists(sourcePath))) {
      return {
        nodeId,
        outputName,
        saved: false,
        errors: [fileNotFoundError(sourcePath)],
      };
    }

    // 4. Determine file extension and compute paths using dual path helper
    const ext = sourcePath.includes('.') ? sourcePath.slice(sourcePath.lastIndexOf('.')) : '.md';
    const outputPaths = this.getOutputPaths(ctx, graphSlug, nodeId, `${outputName}${ext}`);
    const outputsDir = this.pathResolver.dirname(outputPaths.absolute);

    // 5. Ensure outputs directory exists
    if (!(await this.fs.exists(outputsDir))) {
      await this.fs.mkdir(outputsDir, { recursive: true });
    }

    // 6. Copy file (read and write)
    try {
      const content = await this.fs.readFile(sourcePath);
      await this.fs.writeFile(outputPaths.absolute, content);
    } catch (error) {
      return {
        nodeId,
        outputName,
        saved: false,
        errors: [
          {
            code: 'E142',
            message: `Failed to copy file: ${error instanceof Error ? error.message : String(error)}`,
            action: 'Check file permissions and try again',
          },
        ],
      };
    }

    // 7. Also record in data.json so end() can validate (using relative path per Plan 021)
    const nodePath = this.getNodePath(ctx, graphSlug, nodeId);
    const dataDir = this.pathResolver.join(nodePath, 'data');
    const dataPath = this.pathResolver.join(dataDir, 'data.json');

    let data: { outputs: Record<string, unknown> } = { outputs: {} };

    if (await this.fs.exists(dataPath)) {
      try {
        const dataContent = await this.fs.readFile(dataPath);
        data = JSON.parse(dataContent);
        if (!data.outputs) {
          data.outputs = {};
        }
      } catch {
        data = { outputs: {} };
      }
    }

    // Store RELATIVE path per DYK#2 decision for git portability
    data.outputs[outputName] = outputPaths.relative;
    await atomicWriteJson(this.fs, dataPath, data);

    return {
      nodeId,
      outputName,
      saved: true,
      savedPath: outputPaths.absolute, // Return absolute for callers to use
      errors: [],
    };
  }

  // ============================================
  // clear
  // ============================================

  /**
   * Clear a node's outputs and reset to pending.
   *
   * Per DYK#7: No cascade - clears only the specified node.
   * Requires force=true to confirm, returns error otherwise.
   * Downstream nodes are NOT automatically cleared.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to clear
   * @param options - Must include force: true to confirm
   * @returns ClearResult with cleared outputs list
   */
  async clear(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    options: ClearOptions
  ): Promise<ClearResult> {
    // 1. Check force flag
    if (!options.force) {
      return {
        nodeId,
        status: '',
        clearedOutputs: [],
        errors: [
          {
            code: 'E124',
            message: `Clear requires --force flag. Node '${nodeId}' has outputs that will be permanently deleted.`,
            action: 'Run with --force to confirm clearing this node',
          },
        ],
      };
    }

    // 2. Validate node exists
    const statusResult = await this.workGraphService.status(ctx, graphSlug);
    if (statusResult.errors.length > 0) {
      return {
        nodeId,
        status: '',
        clearedOutputs: [],
        errors: statusResult.errors,
      };
    }

    const nodeStatus = statusResult.nodes.find((n) => n.id === nodeId);
    if (!nodeStatus) {
      return {
        nodeId,
        status: '',
        clearedOutputs: [],
        errors: [nodeNotFoundError(graphSlug, nodeId)],
      };
    }

    // 3. Load and clear outputs from data.json
    const nodePath = this.getNodePath(ctx, graphSlug, nodeId);
    const dataPath = this.pathResolver.join(nodePath, 'data', 'data.json');
    const clearedOutputs: string[] = [];

    if (await this.fs.exists(dataPath)) {
      try {
        const content = await this.fs.readFile(dataPath);
        const data = JSON.parse(content);
        if (data.outputs) {
          clearedOutputs.push(...Object.keys(data.outputs));
          data.outputs = {};
          await atomicWriteJson(this.fs, dataPath, data);
        }
      } catch {
        // Ignore parse errors, just clear
      }
    }

    // 4. Update state.json to pending
    const clearedAt = new Date().toISOString();
    const graphsDir = this.getGraphsDir(ctx);
    const statePath = this.pathResolver.join(graphsDir, graphSlug, 'state.json');

    let stateData: StateData = {
      graph_status: 'pending',
      updated_at: clearedAt,
      nodes: {},
    };

    if (await this.fs.exists(statePath)) {
      try {
        const content = await this.fs.readFile(statePath);
        const parsed = JSON.parse(content);
        const validated = WorkGraphStateSchema.safeParse(parsed);
        if (validated.success) {
          stateData = {
            graph_status: validated.data.graph_status,
            updated_at: validated.data.updated_at,
            nodes: validated.data.nodes,
          };
        }
      } catch {
        // Use default state on error
      }
    }

    // Reset node status (remove completion timestamps)
    stateData.nodes[nodeId] = {
      status: 'pending',
    };
    stateData.updated_at = clearedAt;

    await atomicWriteJson(this.fs, statePath, stateData);

    return {
      nodeId,
      status: 'pending',
      clearedOutputs,
      errors: [],
    };
  }

  // ============================================
  // ask
  // ============================================

  /**
   * Ask a question (handover to orchestrator).
   *
   * Transitions node to 'waiting-question' status.
   * The orchestrator will present the question to the user.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node asking the question
   * @param question - Question to ask
   * @returns AskResult with question ID and status
   */
  async ask(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    question: Question
  ): Promise<AskResult> {
    // 1. Validate node exists
    const statusResult = await this.workGraphService.status(ctx, graphSlug);
    if (statusResult.errors.length > 0) {
      return {
        nodeId,
        status: '',
        questionId: '',
        question,
        errors: statusResult.errors,
      };
    }

    const nodeStatus = statusResult.nodes.find((n) => n.id === nodeId);
    if (!nodeStatus) {
      return {
        nodeId,
        status: '',
        questionId: '',
        question,
        errors: [nodeNotFoundError(graphSlug, nodeId)],
      };
    }

    // 2. Check node is running
    if (nodeStatus.status !== 'running') {
      return {
        nodeId,
        status: nodeStatus.status,
        questionId: '',
        question,
        errors: [
          {
            code: 'E112',
            message: `Node '${nodeId}' is not in running state (current: ${nodeStatus.status})`,
            action: 'Use start() to begin execution before calling ask()',
          },
        ],
      };
    }

    // 3. Generate question ID and store question
    const questionId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const askedAt = new Date().toISOString();

    // Store question in data.json
    const nodePath = this.getNodePath(ctx, graphSlug, nodeId);
    const dataDir = this.pathResolver.join(nodePath, 'data');
    const dataPath = this.pathResolver.join(dataDir, 'data.json');

    if (!(await this.fs.exists(dataDir))) {
      await this.fs.mkdir(dataDir, { recursive: true });
    }

    let data: { outputs: Record<string, unknown>; questions: Record<string, unknown> } = {
      outputs: {},
      questions: {},
    };

    if (await this.fs.exists(dataPath)) {
      try {
        const content = await this.fs.readFile(dataPath);
        const parsed = JSON.parse(content);
        data = {
          outputs: parsed.outputs ?? {},
          questions: parsed.questions ?? {},
        };
      } catch {
        // Use defaults
      }
    }

    data.questions[questionId] = {
      ...question,
      askedAt,
    };

    await atomicWriteJson(this.fs, dataPath, data);

    // 4. Update state.json to waiting-question
    const graphsDir = this.getGraphsDir(ctx);
    const statePath = this.pathResolver.join(graphsDir, graphSlug, 'state.json');

    let stateData: StateData = {
      graph_status: 'in_progress',
      updated_at: askedAt,
      nodes: {},
    };

    if (await this.fs.exists(statePath)) {
      try {
        const content = await this.fs.readFile(statePath);
        const parsed = JSON.parse(content);
        const validated = WorkGraphStateSchema.safeParse(parsed);
        if (validated.success) {
          stateData = {
            graph_status: validated.data.graph_status,
            updated_at: validated.data.updated_at,
            nodes: validated.data.nodes,
          };
        }
      } catch {
        // Use default state on error
      }
    }

    stateData.nodes[nodeId] = {
      ...(stateData.nodes[nodeId] ?? {}),
      status: 'waiting-question',
    };
    stateData.updated_at = askedAt;

    await atomicWriteJson(this.fs, statePath, stateData);

    return {
      nodeId,
      status: 'waiting-question',
      questionId,
      question,
      errors: [],
    };
  }

  // ============================================
  // answer
  // ============================================

  /**
   * Answer a question (resume node execution).
   *
   * Transitions node from 'waiting-question' back to 'running'.
   * The answer is stored in data.json for the agent to retrieve.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to resume
   * @param questionId - ID of the question being answered
   * @param answerValue - Answer value
   * @returns AnswerResult with answer and new status
   */
  async answer(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    questionId: string,
    answerValue: unknown
  ): Promise<AnswerResult> {
    // 1. Validate node exists
    const statusResult = await this.workGraphService.status(ctx, graphSlug);
    if (statusResult.errors.length > 0) {
      return {
        nodeId,
        status: '',
        questionId,
        answer: answerValue,
        errors: statusResult.errors,
      };
    }

    const nodeStatus = statusResult.nodes.find((n) => n.id === nodeId);
    if (!nodeStatus) {
      return {
        nodeId,
        status: '',
        questionId,
        answer: answerValue,
        errors: [nodeNotFoundError(graphSlug, nodeId)],
      };
    }

    // 2. Check node is waiting-question
    if (nodeStatus.status !== 'waiting-question') {
      return {
        nodeId,
        status: nodeStatus.status,
        questionId,
        answer: answerValue,
        errors: [
          {
            code: 'E119',
            message: `Node '${nodeId}' is not in waiting-question state (current: ${nodeStatus.status})`,
            action: 'The node must be in waiting-question state to receive an answer',
          },
        ],
      };
    }

    // 3. Store answer in data.json
    const answeredAt = new Date().toISOString();
    const nodePath = this.getNodePath(ctx, graphSlug, nodeId);
    const dataDir = this.pathResolver.join(nodePath, 'data');
    const dataPath = this.pathResolver.join(dataDir, 'data.json');

    if (!(await this.fs.exists(dataDir))) {
      await this.fs.mkdir(dataDir, { recursive: true });
    }

    let data: {
      outputs: Record<string, unknown>;
      questions: Record<string, unknown>;
      answers: Record<string, unknown>;
    } = {
      outputs: {},
      questions: {},
      answers: {},
    };

    if (await this.fs.exists(dataPath)) {
      try {
        const content = await this.fs.readFile(dataPath);
        const parsed = JSON.parse(content);
        data = {
          outputs: parsed.outputs ?? {},
          questions: parsed.questions ?? {},
          answers: parsed.answers ?? {},
        };
      } catch {
        // Use defaults
      }
    }

    data.answers[questionId] = {
      value: answerValue,
      answeredAt,
    };

    await atomicWriteJson(this.fs, dataPath, data);

    // 4. Update state.json to running
    const graphsDir = this.getGraphsDir(ctx);
    const statePath = this.pathResolver.join(graphsDir, graphSlug, 'state.json');

    let stateData: StateData = {
      graph_status: 'in_progress',
      updated_at: answeredAt,
      nodes: {},
    };

    if (await this.fs.exists(statePath)) {
      try {
        const content = await this.fs.readFile(statePath);
        const parsed = JSON.parse(content);
        const validated = WorkGraphStateSchema.safeParse(parsed);
        if (validated.success) {
          stateData = {
            graph_status: validated.data.graph_status,
            updated_at: validated.data.updated_at,
            nodes: validated.data.nodes,
          };
        }
      } catch {
        // Use default state on error
      }
    }

    stateData.nodes[nodeId] = {
      ...(stateData.nodes[nodeId] ?? {}),
      status: 'running',
    };
    stateData.updated_at = answeredAt;

    await atomicWriteJson(this.fs, statePath, stateData);

    return {
      nodeId,
      status: 'running',
      questionId,
      answer: answerValue,
      errors: [],
    };
  }

  /**
   * Get the answer to a question.
   *
   * Reads the answer from data.json if it has been provided.
   * Per Plan 021: Accepts WorkspaceContext as first parameter.
   *
   * @param ctx - Workspace context for path resolution
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to check
   * @param questionId - ID of the question
   */
  async getAnswer(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    questionId: string
  ): Promise<GetAnswerResult> {
    // 1. Validate node exists
    const statusResult = await this.workGraphService.status(ctx, graphSlug);
    if (statusResult.errors.length > 0) {
      return {
        nodeId,
        questionId,
        answered: false,
        errors: statusResult.errors,
      };
    }

    const node = statusResult.nodes.find((n) => n.id === nodeId);
    if (!node) {
      return {
        nodeId,
        questionId,
        answered: false,
        errors: [
          {
            code: 'E107',
            message: `Node '${nodeId}' not found in graph '${graphSlug}'`,
            action: 'Verify the node ID is correct',
          },
        ],
      };
    }

    // 2. Read data.json
    const nodePath = this.getNodePath(ctx, graphSlug, nodeId);
    const dataPath = this.pathResolver.join(nodePath, 'data', 'data.json');

    if (!(await this.fs.exists(dataPath))) {
      return {
        nodeId,
        questionId,
        answered: false,
        errors: [
          {
            code: 'E119',
            message: `No answer data found for node '${nodeId}'`,
            action: 'Question may not have been answered yet',
          },
        ],
      };
    }

    try {
      const content = await this.fs.readFile(dataPath);
      const data = JSON.parse(content) as {
        answers?: Record<string, { value: unknown; answeredAt: string }>;
      };

      const answerData = data.answers?.[questionId];
      if (!answerData) {
        return {
          nodeId,
          questionId,
          answered: false,
          errors: [],
        };
      }

      return {
        nodeId,
        questionId,
        answered: true,
        answer: answerData.value,
        answeredAt: answerData.answeredAt,
        errors: [],
      };
    } catch {
      return {
        nodeId,
        questionId,
        answered: false,
        errors: [
          {
            code: 'E119',
            message: `Failed to read answer data for node '${nodeId}'`,
            action: 'Check data.json file',
          },
        ],
      };
    }
  }
}
