/**
 * Production PhaseAdapter for loading phases from filesystem.
 *
 * Per Phase 3: Production Adapters.
 * Per Critical Discovery 04: Uses pathResolver.join() for all path operations.
 * Per Critical Insight 5: Uses defensive sorting with name-based tiebreaker.
 *
 * Loads Phase entities from workflow directories:
 * - Template phases: wf-phase.yaml only, default runtime values
 * - Run phases: wf-phase.yaml + wf-data/wf-phase.json for runtime state
 */

import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import {
  Phase,
  type PhaseInput,
  type PhaseInputFile,
  type PhaseInputMessage,
  type PhaseInputParameter,
  type PhaseOutput,
} from '../entities/phase.js';
import type { Workflow } from '../entities/workflow.js';
import { EntityNotFoundError } from '../errors/entity-not-found.error.js';
import type { IPhaseAdapter } from '../interfaces/phase-adapter.interface.js';
import type { IYamlParser } from '../interfaces/yaml-parser.interface.js';
import type { Facilitator, PhaseState } from '../types/wf-phase.types.js';
import type { PhaseRunStatus } from '../types/wf-status.types.js';
import type { PhaseDefinition } from '../types/wf.types.js';

/**
 * Runtime phase state from wf-data/wf-phase.json.
 */
interface PhaseRuntimeState {
  status?: PhaseRunStatus;
  facilitator?: Facilitator;
  state?: PhaseState;
  started_at?: string;
  completed_at?: string;
  outputs?: Array<{ name: string; exists: boolean; valid: boolean }>;
  input_files?: Array<{ name: string; exists: boolean }>;
  input_parameters?: Array<{ name: string; value: unknown }>;
  input_messages?: Array<{ id: string; exists: boolean; answered: boolean }>;
}

/**
 * Production implementation of IPhaseAdapter.
 *
 * Reads phases from the filesystem using injected dependencies:
 * - IFileSystem for file I/O
 * - IPathResolver for secure path operations
 * - IYamlParser for parsing wf-phase.yaml
 */
export class PhaseAdapter implements IPhaseAdapter {
  constructor(
    private readonly fs: IFileSystem,
    private readonly pathResolver: IPathResolver,
    private readonly yamlParser: IYamlParser
  ) {}

  /**
   * Load a Phase entity from a phase directory.
   *
   * Reads wf-phase.yaml for definition and optionally wf-data/wf-phase.json
   * for runtime state.
   */
  async loadFromPath(phaseDir: string): Promise<Phase> {
    const wfPhasePath = this.pathResolver.join(phaseDir, 'wf-phase.yaml');

    // Check if wf-phase.yaml exists
    const exists = await this.fs.exists(wfPhasePath);
    if (!exists) {
      throw new EntityNotFoundError('Phase', this.pathResolver.basename(phaseDir), phaseDir);
    }

    // Read and parse wf-phase.yaml
    const content = await this.fs.readFile(wfPhasePath);
    const definition = this.yamlParser.parse<PhaseDefinition>(content, wfPhasePath);

    // Extract phase name from directory path
    const name = this.pathResolver.basename(phaseDir);

    // Compute runDir (parent of phaseDir)
    const runDir = this.pathResolver.dirname(phaseDir);

    // Try to load runtime state from wf-data/wf-phase.json
    const runtimeState = await this.loadRuntimeState(phaseDir);

    // Build Phase input
    const phaseInput: PhaseInput = {
      name,
      phaseDir,
      runDir,
      description: definition.description,
      order: definition.order,
      status: runtimeState?.status ?? 'pending',
      facilitator: runtimeState?.facilitator ?? 'orchestrator',
      state: runtimeState?.state ?? 'pending',
      startedAt: runtimeState?.started_at ? new Date(runtimeState.started_at) : undefined,
      completedAt: runtimeState?.completed_at ? new Date(runtimeState.completed_at) : undefined,
      inputFiles: this.buildInputFiles(definition, runtimeState),
      inputParameters: this.buildInputParameters(definition, runtimeState),
      inputMessages: this.buildInputMessages(definition, runtimeState),
      outputs: this.buildOutputs(definition, runtimeState),
      outputParameters:
        definition.output_parameters?.map((op) => ({
          name: op.name,
          source: op.source,
          query: op.query,
          description: op.description,
          value: undefined, // Runtime value not in wf-phase.json
        })) ?? [],
      statusHistory: [],
      messages: [],
    };

    return new Phase(phaseInput);
  }

  /**
   * List all phases for a workflow.
   *
   * Returns Phase entities sorted by order, with name-based tiebreaker
   * for stable sorting (per Critical Insight 5).
   */
  async listForWorkflow(workflow: Workflow): Promise<Phase[]> {
    const workflowDir = workflow.workflowDir;

    // Check if workflow directory exists
    const exists = await this.fs.exists(workflowDir);
    if (!exists) {
      throw new EntityNotFoundError('Workflow', workflow.slug, workflowDir);
    }

    // Read directory entries
    const entries = await this.fs.readDir(workflowDir);
    const phases: Phase[] = [];

    for (const entry of entries) {
      const phaseDir = this.pathResolver.join(workflowDir, entry);
      const wfPhasePath = this.pathResolver.join(phaseDir, 'wf-phase.yaml');

      // Check if this is a phase directory (has wf-phase.yaml)
      const isPhase = await this.fs.exists(wfPhasePath);
      if (!isPhase) {
        continue;
      }

      try {
        const phase = await this.loadFromPath(phaseDir);
        phases.push(phase);
      } catch {
        // Skip invalid phase directories
      }
    }

    // Sort by order, with name-based tiebreaker for stability
    // Per Critical Insight 5: .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    return phases.sort((a, b) => {
      const orderDiff = a.order - b.order;
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });
  }

  // ==================== Private Helpers ====================

  /**
   * Load runtime state from wf-data/wf-phase.json if it exists.
   */
  private async loadRuntimeState(phaseDir: string): Promise<PhaseRuntimeState | undefined> {
    const runtimePath = this.pathResolver.join(phaseDir, 'wf-data', 'wf-phase.json');

    const exists = await this.fs.exists(runtimePath);
    if (!exists) {
      return undefined;
    }

    try {
      const content = await this.fs.readFile(runtimePath);
      return JSON.parse(content) as PhaseRuntimeState;
    } catch {
      return undefined;
    }
  }

  /**
   * Build input files array with exists flag from runtime state.
   */
  private buildInputFiles(
    definition: PhaseDefinition,
    runtimeState?: PhaseRuntimeState
  ): PhaseInputFile[] {
    const files = definition.inputs?.files ?? [];
    const runtimeFiles = runtimeState?.input_files ?? [];

    return files.map((file) => {
      const runtime = runtimeFiles.find((rf) => rf.name === file.name);
      return {
        name: file.name,
        required: file.required,
        description: file.description,
        fromPhase: file.from_phase,
        exists: runtime?.exists ?? false,
        path: '', // Path computed at runtime
      };
    });
  }

  /**
   * Build input parameters array with value from runtime state.
   */
  private buildInputParameters(
    definition: PhaseDefinition,
    runtimeState?: PhaseRuntimeState
  ): PhaseInputParameter[] {
    const params = definition.inputs?.parameters ?? [];
    const runtimeParams = runtimeState?.input_parameters ?? [];

    return params.map((param) => {
      const runtime = runtimeParams.find((rp) => rp.name === param.name);
      return {
        name: param.name,
        required: param.required,
        description: param.description,
        fromPhase: param.from_phase,
        value: runtime?.value,
      };
    });
  }

  /**
   * Build input messages array with exists/answered from runtime state.
   */
  private buildInputMessages(
    definition: PhaseDefinition,
    runtimeState?: PhaseRuntimeState
  ): PhaseInputMessage[] {
    const messages = definition.inputs?.messages ?? [];
    const runtimeMessages = runtimeState?.input_messages ?? [];

    return messages.map((msg) => {
      const runtime = runtimeMessages.find((rm) => rm.id === msg.id);
      return {
        id: msg.id,
        type: msg.type,
        from: msg.from,
        required: msg.required,
        subject: msg.subject,
        prompt: msg.prompt,
        options: msg.options?.map((opt) => ({
          key: opt.key,
          label: opt.label,
          description: opt.description,
        })),
        description: msg.description,
        exists: runtime?.exists ?? false,
        answered: runtime?.answered ?? false,
      };
    });
  }

  /**
   * Build outputs array with exists/valid from runtime state.
   */
  private buildOutputs(
    definition: PhaseDefinition,
    runtimeState?: PhaseRuntimeState
  ): PhaseOutput[] {
    const outputs = definition.outputs ?? [];
    const runtimeOutputs = runtimeState?.outputs ?? [];

    return outputs.map((output) => {
      const runtime = runtimeOutputs.find((ro) => ro.name === output.name);
      return {
        name: output.name,
        type: output.type,
        required: output.required,
        schema: output.schema,
        description: output.description,
        exists: runtime?.exists ?? false,
        valid: runtime?.valid ?? false,
        path: '', // Path computed at runtime
      };
    });
  }
}
