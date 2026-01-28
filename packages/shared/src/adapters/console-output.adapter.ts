/**
 * Console output adapter for formatting service results.
 *
 * Per Critical Discovery 01: Services return domain result objects,
 * adapters format for output (JSON or Console).
 *
 * Produces human-readable output with:
 * - ✓ icon for success
 * - ✗ icon for failure
 * - ℹ️ icon for no-op (per DYK Insight #5)
 * - Structured text per command type
 *
 * Per DYK Insight #2: Uses command dispatch pattern with dedicated
 * format methods per result type.
 */

import type {
  AcceptResult,
  BaseResult,
  CheckpointResult,
  ComposeResult,
  FinalizeResult,
  HandoverResult,
  IOutputAdapter,
  InfoResult,
  ListResult,
  MessageAnswerResult,
  MessageCreateResult,
  MessageListResult,
  MessageReadResult,
  PreflightResult,
  PrepareResult,
  RestoreResult,
  ResultError,
  ValidateResult,
  VersionsResult,
} from '../interfaces/index.js';

// ============================================
// WorkGraph Result Type Imports
// ============================================

// Note: These types are imported from @chainglass/workgraph at runtime
// but we use inline type definitions here to avoid circular dependencies.
// The actual types match the interfaces in workgraph/src/interfaces/.

/** @internal WorkUnit list result type */
interface WgUnitListResult extends BaseResult {
  units: Array<{ slug: string; type: string; version: string; description?: string }>;
}

/** @internal WorkUnit load result type */
interface WgUnitLoadResult extends BaseResult {
  unit?: {
    slug: string;
    type: string;
    version: string;
    description?: string;
    inputs: Array<{
      name: string;
      type: string;
      dataType?: string;
      required: boolean;
      description?: string;
    }>;
    outputs: Array<{
      name: string;
      type: string;
      dataType?: string;
      required: boolean;
      description?: string;
    }>;
    agent?: { promptTemplate: string };
    code?: { timeout?: number };
    userInput?: { questionType: string; prompt: string };
  };
}

/** @internal WorkUnit create result type */
interface WgUnitCreateResult extends BaseResult {
  slug: string;
  path: string;
}

/** @internal WorkUnit validate result type */
interface WgUnitValidateResult extends BaseResult {
  slug: string;
  valid: boolean;
  issues: Array<{ severity: string; code: string; path: string; message: string; action?: string }>;
}

/** @internal WorkGraph create result type */
interface WgGraphCreateResult extends BaseResult {
  graphSlug: string;
  path: string;
}

/** @internal Show tree node type */
interface WgShowTreeNode {
  id: string;
  unit?: string;
  type?: string;
  children: WgShowTreeNode[];
}

/** @internal WorkGraph show result type */
interface WgGraphShowResult extends BaseResult {
  graphSlug: string;
  tree: WgShowTreeNode;
}

/** @internal WorkGraph status result type */
interface WgGraphStatusResult extends BaseResult {
  graphSlug: string;
  graphStatus: string;
  nodes: Array<{
    id: string;
    unit?: string;
    status: string;
    startedAt?: string;
    completedAt?: string;
  }>;
}

/** @internal Add node result type */
interface WgAddNodeResult extends BaseResult {
  nodeId: string;
  inputs: Record<string, { from: string; output: string }>;
}

/** @internal Remove node result type */
interface WgRemoveNodeResult extends BaseResult {
  removedNodes: string[];
}

/** @internal Can run result type */
interface WgCanRunResult extends BaseResult {
  canRun: boolean;
  reason?: string;
  blockingNodes?: Array<{ nodeId: string; status: string; requiredOutputs: string[] }>;
}

/** @internal Mark ready result type */
interface WgMarkReadyResult extends BaseResult {
  nodeId: string;
  status: string;
  readyAt: string;
}

/** @internal Start result type */
interface WgStartResult extends BaseResult {
  nodeId: string;
  status: string;
  startedAt: string;
}

/** @internal End result type */
interface WgEndResult extends BaseResult {
  nodeId: string;
  status: string;
  completedAt: string;
  missingOutputs?: string[];
}

/** @internal Get input data result type */
interface WgGetInputDataResult extends BaseResult {
  nodeId: string;
  inputName: string;
  value?: unknown;
  fromNode?: string;
  fromOutput?: string;
}

/** @internal Get input file result type */
interface WgGetInputFileResult extends BaseResult {
  nodeId: string;
  inputName: string;
  filePath?: string;
  fromNode?: string;
  fromOutput?: string;
}

/** @internal Get output data result type */
interface WgGetOutputDataResult extends BaseResult {
  nodeId: string;
  outputName: string;
  value?: unknown;
}

/** @internal Save output data result type */
interface WgSaveOutputDataResult extends BaseResult {
  nodeId: string;
  outputName: string;
  saved: boolean;
}

/** @internal Save output file result type */
interface WgSaveOutputFileResult extends BaseResult {
  nodeId: string;
  outputName: string;
  saved: boolean;
  savedPath?: string;
}

/** @internal Ask result type */
interface WgAskResult extends BaseResult {
  nodeId: string;
  status: string;
  questionId: string;
  question: { type: string; text: string; options?: string[]; default?: string | boolean };
}

/** @internal Answer result type */
interface WgAnswerResult extends BaseResult {
  nodeId: string;
  status: string;
  questionId: string;
  answer: unknown;
}

/** @internal Clear result type */
interface WgClearResult extends BaseResult {
  nodeId: string;
  status: string;
  clearedOutputs: string[];
}

/** @internal Exec result type */
interface WgExecResult extends BaseResult {
  nodeId: string;
  graphSlug: string;
  unitSlug: string;
  prompt: string;
  commandsPath: string;
}

/** @internal List inputs result type */
interface WgListInputsResult extends BaseResult {
  nodeId: string;
  inputs: Array<{
    name: string;
    type: string;
    dataType?: string;
    required: boolean;
    from?: string;
    output?: string;
    resolved: boolean;
  }>;
}

/** @internal List outputs result type */
interface WgListOutputsResult extends BaseResult {
  nodeId: string;
  outputs: Array<{
    name: string;
    type: string;
    dataType?: string;
    required: boolean;
    saved: boolean;
  }>;
}

/** @internal Can end result type */
interface WgCanEndResult extends BaseResult {
  nodeId: string;
  canEnd: boolean;
  missingOutputs?: string[];
}

/**
 * Formats service results as human-readable console output.
 *
 * Used when --json flag is NOT passed to CLI commands.
 */
export class ConsoleOutputAdapter implements IOutputAdapter {
  /**
   * Format a command result for console output.
   *
   * @param command - Command name (e.g., "phase.prepare")
   * @param result - Domain result object from service
   * @returns Human-readable string with icons
   */
  format<T extends BaseResult>(command: string, result: T): string {
    if (result.errors.length === 0) {
      return this.formatSuccess(command, result);
    }
    return this.formatFailure(command, result);
  }

  /**
   * Format successful result using command dispatch.
   */
  private formatSuccess<T extends BaseResult>(command: string, result: T): string {
    switch (command) {
      case 'phase.prepare':
        return this.formatPrepareSuccess(result as unknown as PrepareResult);
      case 'phase.validate':
        return this.formatValidateSuccess(result as unknown as ValidateResult);
      case 'phase.finalize':
        return this.formatFinalizeSuccess(result as unknown as FinalizeResult);
      case 'phase.accept':
        return this.formatAcceptSuccess(result as unknown as AcceptResult);
      case 'phase.preflight':
        return this.formatPreflightSuccess(result as unknown as PreflightResult);
      case 'phase.handover':
        return this.formatHandoverSuccess(result as unknown as HandoverResult);
      case 'wf.compose':
        return this.formatComposeSuccess(result as unknown as ComposeResult);
      case 'workflow.list':
        return this.formatWorkflowListSuccess(result as unknown as ListResult);
      case 'workflow.info':
        return this.formatWorkflowInfoSuccess(result as unknown as InfoResult);
      case 'workflow.checkpoint':
        return this.formatWorkflowCheckpointSuccess(result as unknown as CheckpointResult);
      case 'workflow.restore':
        return this.formatWorkflowRestoreSuccess(result as unknown as RestoreResult);
      case 'workflow.versions':
        return this.formatWorkflowVersionsSuccess(result as unknown as VersionsResult);
      case 'workflow.compose':
        return this.formatComposeSuccess(result as unknown as ComposeResult);
      case 'message.create':
        return this.formatMessageCreateSuccess(result as unknown as MessageCreateResult);
      case 'message.answer':
        return this.formatMessageAnswerSuccess(result as unknown as MessageAnswerResult);
      case 'message.list':
        return this.formatMessageListSuccess(result as unknown as MessageListResult);
      case 'message.read':
        return this.formatMessageReadSuccess(result as unknown as MessageReadResult);
      // ==================== WorkGraph Commands ====================
      case 'unit.list':
        return this.formatUnitListSuccess(result as unknown as WgUnitListResult);
      case 'unit.info':
        return this.formatUnitInfoSuccess(result as unknown as WgUnitLoadResult);
      case 'unit.create':
        return this.formatUnitCreateSuccess(result as unknown as WgUnitCreateResult);
      case 'unit.validate':
        return this.formatUnitValidateSuccess(result as unknown as WgUnitValidateResult);
      case 'wg.create':
        return this.formatWgCreateSuccess(result as unknown as WgGraphCreateResult);
      case 'wg.show':
        return this.formatWgShowSuccess(result as unknown as WgGraphShowResult);
      case 'wg.status':
        return this.formatWgStatusSuccess(result as unknown as WgGraphStatusResult);
      case 'wg.node.add-after':
        return this.formatWgNodeAddAfterSuccess(result as unknown as WgAddNodeResult);
      case 'wg.node.remove':
        return this.formatWgNodeRemoveSuccess(result as unknown as WgRemoveNodeResult);
      case 'wg.node.exec':
        return this.formatWgNodeExecSuccess(result as unknown as WgExecResult);
      case 'wg.node.can-run':
        return this.formatWgNodeCanRunSuccess(result as unknown as WgCanRunResult);
      case 'wg.node.mark-ready':
        return this.formatWgNodeMarkReadySuccess(result as unknown as WgMarkReadyResult);
      case 'wg.node.start':
        return this.formatWgNodeStartSuccess(result as unknown as WgStartResult);
      case 'wg.node.end':
        return this.formatWgNodeEndSuccess(result as unknown as WgEndResult);
      case 'wg.node.can-end':
        return this.formatWgNodeCanEndSuccess(result as unknown as WgCanEndResult);
      case 'wg.node.list-inputs':
        return this.formatWgNodeListInputsSuccess(result as unknown as WgListInputsResult);
      case 'wg.node.list-outputs':
        return this.formatWgNodeListOutputsSuccess(result as unknown as WgListOutputsResult);
      case 'wg.node.get-input-data':
        return this.formatWgNodeGetInputDataSuccess(result as unknown as WgGetInputDataResult);
      case 'wg.node.get-input-file':
        return this.formatWgNodeGetInputFileSuccess(result as unknown as WgGetInputFileResult);
      case 'wg.node.get-output-data':
        return this.formatWgNodeGetOutputDataSuccess(result as unknown as WgGetOutputDataResult);
      case 'wg.node.save-output-data':
        return this.formatWgNodeSaveOutputDataSuccess(result as unknown as WgSaveOutputDataResult);
      case 'wg.node.save-output-file':
        return this.formatWgNodeSaveOutputFileSuccess(result as unknown as WgSaveOutputFileResult);
      case 'wg.node.ask':
        return this.formatWgNodeAskSuccess(result as unknown as WgAskResult);
      case 'wg.node.answer':
        return this.formatWgNodeAnswerSuccess(result as unknown as WgAnswerResult);
      case 'wg.node.clear':
        return this.formatWgNodeClearSuccess(result as unknown as WgClearResult);
      default:
        return this.formatGenericSuccess(result);
    }
  }

  /**
   * Format failed result using command dispatch.
   */
  private formatFailure<T extends BaseResult>(command: string, result: T): string {
    switch (command) {
      case 'phase.prepare':
        return this.formatPrepareFailure(result as unknown as PrepareResult);
      case 'phase.validate':
        return this.formatValidateFailure(result as unknown as ValidateResult);
      case 'phase.finalize':
        return this.formatFinalizeFailure(result as unknown as FinalizeResult);
      case 'phase.accept':
        return this.formatAcceptFailure(result as unknown as AcceptResult);
      case 'phase.preflight':
        return this.formatPreflightFailure(result as unknown as PreflightResult);
      case 'phase.handover':
        return this.formatHandoverFailure(result as unknown as HandoverResult);
      case 'wf.compose':
        return this.formatComposeFailure(result as unknown as ComposeResult);
      case 'workflow.list':
        return this.formatWorkflowListFailure(result as unknown as ListResult);
      case 'workflow.info':
        return this.formatWorkflowInfoFailure(result as unknown as InfoResult);
      case 'workflow.checkpoint':
        return this.formatWorkflowCheckpointFailure(result as unknown as CheckpointResult);
      case 'workflow.restore':
        return this.formatWorkflowRestoreFailure(result as unknown as RestoreResult);
      case 'workflow.versions':
        return this.formatWorkflowVersionsFailure(result as unknown as VersionsResult);
      case 'workflow.compose':
        return this.formatComposeFailure(result as unknown as ComposeResult);
      case 'message.create':
        return this.formatMessageCreateFailure(result as unknown as MessageCreateResult);
      case 'message.answer':
        return this.formatMessageAnswerFailure(result as unknown as MessageAnswerResult);
      case 'message.list':
        return this.formatMessageListFailure(result as unknown as MessageListResult);
      case 'message.read':
        return this.formatMessageReadFailure(result as unknown as MessageReadResult);
      // ==================== WorkGraph Commands ====================
      case 'unit.list':
        return this.formatUnitListFailure(result as unknown as WgUnitListResult);
      case 'unit.info':
        return this.formatUnitInfoFailure(result as unknown as WgUnitLoadResult);
      case 'unit.create':
        return this.formatUnitCreateFailure(result as unknown as WgUnitCreateResult);
      case 'unit.validate':
        return this.formatUnitValidateFailure(result as unknown as WgUnitValidateResult);
      case 'wg.create':
        return this.formatWgCreateFailure(result as unknown as WgGraphCreateResult);
      case 'wg.show':
        return this.formatWgShowFailure(result as unknown as WgGraphShowResult);
      case 'wg.status':
        return this.formatWgStatusFailure(result as unknown as WgGraphStatusResult);
      case 'wg.node.add-after':
        return this.formatWgNodeAddAfterFailure(result as unknown as WgAddNodeResult);
      case 'wg.node.remove':
        return this.formatWgNodeRemoveFailure(result as unknown as WgRemoveNodeResult);
      case 'wg.node.exec':
        return this.formatWgNodeExecFailure(result as unknown as WgExecResult);
      case 'wg.node.can-run':
        return this.formatWgNodeCanRunFailure(result as unknown as WgCanRunResult);
      case 'wg.node.mark-ready':
        return this.formatWgNodeMarkReadyFailure(result as unknown as WgMarkReadyResult);
      case 'wg.node.start':
        return this.formatWgNodeStartFailure(result as unknown as WgStartResult);
      case 'wg.node.end':
        return this.formatWgNodeEndFailure(result as unknown as WgEndResult);
      case 'wg.node.can-end':
        return this.formatWgNodeCanEndFailure(result as unknown as WgCanEndResult);
      case 'wg.node.list-inputs':
        return this.formatWgNodeListInputsFailure(result as unknown as WgListInputsResult);
      case 'wg.node.list-outputs':
        return this.formatWgNodeListOutputsFailure(result as unknown as WgListOutputsResult);
      case 'wg.node.get-input-data':
        return this.formatWgNodeGetInputDataFailure(result as unknown as WgGetInputDataResult);
      case 'wg.node.get-input-file':
        return this.formatWgNodeGetInputFileFailure(result as unknown as WgGetInputFileResult);
      case 'wg.node.get-output-data':
        return this.formatWgNodeGetOutputDataFailure(result as unknown as WgGetOutputDataResult);
      case 'wg.node.save-output-data':
        return this.formatWgNodeSaveOutputDataFailure(result as unknown as WgSaveOutputDataResult);
      case 'wg.node.save-output-file':
        return this.formatWgNodeSaveOutputFileFailure(result as unknown as WgSaveOutputFileResult);
      case 'wg.node.ask':
        return this.formatWgNodeAskFailure(result as unknown as WgAskResult);
      case 'wg.node.answer':
        return this.formatWgNodeAnswerFailure(result as unknown as WgAnswerResult);
      case 'wg.node.clear':
        return this.formatWgNodeClearFailure(result as unknown as WgClearResult);
      default:
        return this.formatGenericFailure(result);
    }
  }

  // ==================== Success Formatters ====================

  private formatPrepareSuccess(result: PrepareResult): string {
    const lines: string[] = [`✓ Phase '${result.phase}' is ready`];

    if (result.inputs.resolved.length > 0) {
      const inputNames = result.inputs.resolved.map((i) => i.name).join(', ');
      lines.push(`  Inputs resolved: ${inputNames}`);
    }

    if (result.copiedFromPrior.length > 0) {
      lines.push(`  Copied from prior: ${result.copiedFromPrior.length} files`);
    }

    return lines.join('\n');
  }

  private formatValidateSuccess(result: ValidateResult): string {
    const checkLabel = result.check === 'inputs' ? 'inputs' : 'outputs';
    const lines: string[] = [`✓ Phase '${result.phase}' ${checkLabel} are valid`];

    if (result.files.validated.length > 0) {
      const fileNames = result.files.validated.map((f) => f.name).join(', ');
      lines.push(`  Validated: ${fileNames}`);
    }

    return lines.join('\n');
  }

  private formatFinalizeSuccess(result: FinalizeResult): string {
    const lines: string[] = [`✓ Phase '${result.phase}' finalized`];

    const params = Object.entries(result.extractedParams);
    if (params.length > 0) {
      lines.push('  Extracted parameters:');
      for (const [key, value] of params) {
        lines.push(`    ${key}: ${JSON.stringify(value)}`);
      }
    }

    return lines.join('\n');
  }

  private formatComposeSuccess(result: ComposeResult): string {
    const lines: string[] = [
      `✓ Workflow '${result.template}' composed`,
      `  Run directory: ${result.runDir}`,
    ];

    if (result.phases.length > 0) {
      const phaseNames = result.phases.map((p) => p.name).join(', ');
      lines.push(`  Phases: ${phaseNames}`);
    }

    return lines.join('\n');
  }

  // ==================== Workflow Management Success Formatters (Phase 5) ====================

  private formatWorkflowListSuccess(result: ListResult): string {
    if (result.workflows.length === 0) {
      return "ℹ️ No workflows found\n  Run 'cg init' to create starter workflows.";
    }

    const lines: string[] = [`✓ Found ${result.workflows.length} workflow(s)`];
    lines.push('');

    // Table header
    lines.push('  Slug              Name                  Checkpoints  Description');
    lines.push(
      '  ────────────────  ────────────────────  ───────────  ────────────────────────────'
    );

    for (const wf of result.workflows) {
      const slug = wf.slug.padEnd(16);
      const name = (wf.name || '').padEnd(20);
      const count = wf.checkpointCount.toString().padEnd(11);
      const desc = wf.description ? wf.description.substring(0, 28) : '';
      lines.push(`  ${slug}  ${name}  ${count}  ${desc}`);
    }

    return lines.join('\n');
  }

  private formatWorkflowInfoSuccess(result: InfoResult): string {
    if (!result.workflow) {
      return '✓ Workflow info retrieved';
    }

    const wf = result.workflow;
    const lines: string[] = [`✓ Workflow '${wf.slug}'`];
    lines.push('');
    lines.push(`  Name:        ${wf.name}`);
    if (wf.description) {
      lines.push(`  Description: ${wf.description}`);
    }
    if (wf.author) {
      lines.push(`  Author:      ${wf.author}`);
    }
    if (wf.tags && wf.tags.length > 0) {
      lines.push(`  Tags:        ${wf.tags.join(', ')}`);
    }
    lines.push(`  Created:     ${wf.createdAt}`);
    if (wf.updatedAt) {
      lines.push(`  Updated:     ${wf.updatedAt}`);
    }
    lines.push(`  Checkpoints: ${wf.checkpointCount}`);

    if (wf.versions && wf.versions.length > 0) {
      lines.push('');
      lines.push('  Version History:');
      for (const v of wf.versions) {
        const comment = v.comment ? ` - ${v.comment}` : '';
        lines.push(`    ${v.version}  ${v.createdAt}${comment}`);
      }
    }

    return lines.join('\n');
  }

  private formatWorkflowCheckpointSuccess(result: CheckpointResult): string {
    const lines: string[] = [`✓ Checkpoint created: ${result.version}`];
    lines.push(`  Ordinal:  ${result.ordinal}`);
    lines.push(`  Hash:     ${result.hash}`);
    lines.push(`  Path:     ${result.checkpointPath}`);
    lines.push(`  Created:  ${result.createdAt}`);
    return lines.join('\n');
  }

  private formatWorkflowRestoreSuccess(result: RestoreResult): string {
    const lines: string[] = [`✓ Restored '${result.slug}' to ${result.version}`];
    lines.push(`  Current directory: ${result.currentPath}`);
    return lines.join('\n');
  }

  private formatWorkflowVersionsSuccess(result: VersionsResult): string {
    if (result.versions.length === 0) {
      return `ℹ️ No checkpoints for '${result.slug}'\n  Run 'cg workflow checkpoint ${result.slug}' to create one.`;
    }

    const lines: string[] = [`✓ ${result.versions.length} checkpoint(s) for '${result.slug}'`];
    lines.push('');

    for (const v of result.versions) {
      const comment = v.comment ? ` - ${v.comment}` : '';
      lines.push(`  ${v.version}  ${v.createdAt}${comment}`);
    }

    return lines.join('\n');
  }

  // ==================== Handover Success Formatters (Phase 3 Subtask 002) ====================

  private formatAcceptSuccess(result: AcceptResult): string {
    // Per DYK Insight #5: Use ℹ️ for no-op, ✓ for actual change
    const icon = result.wasNoOp ? 'ℹ️' : '✓';
    const suffix = result.wasNoOp ? ' (already accepted)' : '';
    const lines: string[] = [
      `${icon} Agent accepted phase '${result.phase}'${suffix}`,
      `  Facilitator: ${result.facilitator}`,
      `  State: ${result.state}`,
    ];

    if (result.statusEntry.comment) {
      lines.push(`  Comment: ${result.statusEntry.comment}`);
    }

    return lines.join('\n');
  }

  private formatPreflightSuccess(result: PreflightResult): string {
    const icon = result.wasNoOp ? 'ℹ️' : '✓';
    const suffix = result.wasNoOp ? ' (already preflighted)' : '';
    const lines: string[] = [`${icon} Preflight passed for phase '${result.phase}'${suffix}`];

    lines.push('  Checks:');
    lines.push(`    Config valid: ${result.checks.configValid ? '✓' : '✗'}`);
    lines.push(`    Inputs exist: ${result.checks.inputsExist ? '✓' : '✗'}`);
    lines.push(`    Schemas valid: ${result.checks.schemasValid ? '✓' : '✗'}`);

    return lines.join('\n');
  }

  private formatHandoverSuccess(result: HandoverResult): string {
    const icon = result.wasNoOp ? 'ℹ️' : '✓';
    const suffix = result.wasNoOp ? ' (no change)' : '';
    const lines: string[] = [
      `${icon} Phase '${result.phase}' handed over${suffix}`,
      `  From: ${result.fromFacilitator} → To: ${result.toFacilitator}`,
      `  State: ${result.state}`,
    ];

    if (result.statusEntry.comment) {
      lines.push(`  Reason: ${result.statusEntry.comment}`);
    }

    return lines.join('\n');
  }

  private formatGenericSuccess<T extends BaseResult>(result: T): string {
    return '✓ Operation completed successfully';
  }

  // ==================== Message Success Formatters ====================

  private formatMessageCreateSuccess(result: MessageCreateResult): string {
    const lines: string[] = [
      `✓ Message created in phase '${result.phase}'`,
      `  ID: ${result.messageId}`,
      `  File: ${result.filePath}`,
    ];
    return lines.join('\n');
  }

  private formatMessageAnswerSuccess(result: MessageAnswerResult): string {
    const lines: string[] = [`✓ Message '${result.messageId}' answered in phase '${result.phase}'`];

    if (result.answer) {
      if (result.answer.selected) {
        lines.push(`  Selected: ${result.answer.selected.join(', ')}`);
      }
      if (result.answer.text !== undefined) {
        lines.push(
          `  Text: ${result.answer.text.substring(0, 50)}${result.answer.text.length > 50 ? '...' : ''}`
        );
      }
      if (result.answer.confirmed !== undefined) {
        lines.push(`  Confirmed: ${result.answer.confirmed ? 'Yes' : 'No'}`);
      }
    }

    return lines.join('\n');
  }

  private formatMessageListSuccess(result: MessageListResult): string {
    const lines: string[] = [`✓ Phase '${result.phase}' has ${result.count} message(s)`];

    if (result.messages.length > 0) {
      lines.push('');
      for (const msg of result.messages) {
        const status = msg.answered ? '✓' : '○';
        lines.push(`  ${status} [${msg.id}] ${msg.type}: ${msg.subject}`);
        if (msg.answered && msg.answered_at) {
          lines.push(`      Answered: ${msg.answered_at}`);
        }
      }
    }

    return lines.join('\n');
  }

  private formatMessageReadSuccess(result: MessageReadResult): string {
    if (!result.message) {
      return `✓ Message read from phase '${result.phase}'`;
    }

    const msg = result.message;
    const lines: string[] = [
      `✓ Message '${msg.id}' in phase '${result.phase}'`,
      '',
      `  Type: ${msg.type}`,
      `  From: ${msg.from}`,
      `  Created: ${msg.created_at}`,
      '',
      `  Subject: ${msg.subject}`,
      `  Body: ${msg.body}`,
    ];

    if (msg.note) {
      lines.push(`  Note: ${msg.note}`);
    }

    if (msg.options && msg.options.length > 0) {
      lines.push('');
      lines.push('  Options:');
      for (const opt of msg.options) {
        lines.push(
          `    [${opt.key}] ${opt.label}${opt.description ? ` - ${opt.description}` : ''}`
        );
      }
    }

    if (msg.answer) {
      lines.push('');
      lines.push(`  Answer (${msg.answer.answered_at}):`);
      if (msg.answer.selected) {
        lines.push(`    Selected: ${msg.answer.selected.join(', ')}`);
      }
      if (msg.answer.text !== undefined) {
        lines.push(`    Text: ${msg.answer.text}`);
      }
      if (msg.answer.confirmed !== undefined) {
        lines.push(`    Confirmed: ${msg.answer.confirmed ? 'Yes' : 'No'}`);
      }
      if (msg.answer.note) {
        lines.push(`    Note: ${msg.answer.note}`);
      }
    }

    return lines.join('\n');
  }

  // ==================== WorkGraph Success Formatters ====================

  private formatUnitListSuccess(result: WgUnitListResult): string {
    if (result.units.length === 0) {
      return "ℹ️ No units found\n  Run 'cg unit create <slug> --type agent' to create one.";
    }

    const lines: string[] = [`✓ Found ${result.units.length} unit(s)`];
    lines.push('');

    // Table header
    lines.push('  Slug              Type        Version  Description');
    lines.push('  ────────────────  ──────────  ───────  ────────────────────────────');

    for (const unit of result.units) {
      const slug = unit.slug.padEnd(16);
      const type = unit.type.padEnd(10);
      const version = unit.version.padEnd(7);
      const desc = unit.description ? unit.description.substring(0, 28) : '';
      lines.push(`  ${slug}  ${type}  ${version}  ${desc}`);
    }

    return lines.join('\n');
  }

  private formatUnitInfoSuccess(result: WgUnitLoadResult): string {
    if (!result.unit) {
      return '✓ Unit info retrieved';
    }

    const unit = result.unit;
    const lines: string[] = [`✓ Unit '${unit.slug}'`];
    lines.push('');
    lines.push(`  Type:        ${unit.type}`);
    lines.push(`  Version:     ${unit.version}`);
    if (unit.description) {
      lines.push(`  Description: ${unit.description}`);
    }

    if (unit.inputs.length > 0) {
      lines.push('');
      lines.push('  Inputs:');
      for (const input of unit.inputs) {
        const req = input.required ? '(required)' : '(optional)';
        const dt = input.dataType ? `:${input.dataType}` : '';
        lines.push(`    - ${input.name} [${input.type}${dt}] ${req}`);
        if (input.description) {
          lines.push(`      ${input.description}`);
        }
      }
    }

    if (unit.outputs.length > 0) {
      lines.push('');
      lines.push('  Outputs:');
      for (const output of unit.outputs) {
        const req = output.required ? '(required)' : '(optional)';
        const dt = output.dataType ? `:${output.dataType}` : '';
        lines.push(`    - ${output.name} [${output.type}${dt}] ${req}`);
        if (output.description) {
          lines.push(`      ${output.description}`);
        }
      }
    }

    return lines.join('\n');
  }

  private formatUnitCreateSuccess(result: WgUnitCreateResult): string {
    const lines: string[] = [`✓ Created unit: ${result.slug}`];
    lines.push(`  Path: ${result.path}`);
    return lines.join('\n');
  }

  private formatUnitValidateSuccess(result: WgUnitValidateResult): string {
    if (result.valid) {
      return `✓ Unit '${result.slug}' is valid`;
    }

    const warnings = result.issues.filter((i) => i.severity === 'warning');
    const lines: string[] = [`✓ Unit '${result.slug}' is valid with ${warnings.length} warning(s)`];

    if (warnings.length > 0) {
      lines.push('');
      for (const issue of warnings) {
        lines.push(`  ⚠ [${issue.code}] ${issue.path}: ${issue.message}`);
        if (issue.action) {
          lines.push(`    Action: ${issue.action}`);
        }
      }
    }

    return lines.join('\n');
  }

  private formatWgCreateSuccess(result: WgGraphCreateResult): string {
    const lines: string[] = [`✓ Created graph: ${result.graphSlug}`];
    lines.push(`  Path: ${result.path}`);
    lines.push('  Start node created');
    return lines.join('\n');
  }

  private formatWgShowSuccess(result: WgGraphShowResult): string {
    const lines: string[] = [`${result.graphSlug}`];

    const renderTree = (node: WgShowTreeNode, prefix: string, isLast: boolean): void => {
      const connector = isLast ? '└── ' : '├── ';
      const label = node.type === 'start' ? 'start' : `${node.id} (${node.unit})`;
      lines.push(`${prefix}${connector}${label}`);

      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      node.children.forEach((child, index) => {
        renderTree(child, childPrefix, index === node.children.length - 1);
      });
    };

    if (result.tree.children.length === 0) {
      lines.push('└── start (no nodes)');
    } else {
      renderTree(result.tree, '', true);
    }

    return lines.join('\n');
  }

  private formatWgStatusSuccess(result: WgGraphStatusResult): string {
    const lines: string[] = [`✓ Graph '${result.graphSlug}' status: ${result.graphStatus}`];
    lines.push('');

    // Status icons
    const statusIcon = (status: string): string => {
      const icons: Record<string, string> = {
        pending: '○',
        ready: '◉',
        running: '▶',
        'waiting-question': '?',
        'blocked-error': '✗',
        complete: '✓',
      };
      return icons[status] || '·';
    };

    // Table header
    lines.push('  Node                 Unit              Status');
    lines.push('  ───────────────────  ────────────────  ────────────────');

    for (const node of result.nodes) {
      const id = node.id.padEnd(19);
      const unit = (node.unit || 'start').padEnd(16);
      const status = `${statusIcon(node.status)} ${node.status}`;
      lines.push(`  ${id}  ${unit}  ${status}`);
    }

    return lines.join('\n');
  }

  private formatWgNodeAddAfterSuccess(result: WgAddNodeResult): string {
    const lines: string[] = [`✓ Added node: ${result.nodeId}`];

    const inputEntries = Object.entries(result.inputs);
    if (inputEntries.length > 0) {
      lines.push('  Wired inputs:');
      for (const [name, mapping] of inputEntries) {
        lines.push(`    ${name} ← ${mapping.from}.${mapping.output}`);
      }
    }

    return lines.join('\n');
  }

  private formatWgNodeRemoveSuccess(result: WgRemoveNodeResult): string {
    if (result.removedNodes.length === 1) {
      return `✓ Removed node: ${result.removedNodes[0]}`;
    }

    const lines: string[] = [`✓ Removed ${result.removedNodes.length} node(s)`];
    for (const node of result.removedNodes) {
      lines.push(`  - ${node}`);
    }
    return lines.join('\n');
  }

  private formatWgNodeExecSuccess(result: WgExecResult): string {
    const lines: string[] = [
      `✓ Ready to execute node: ${result.nodeId}`,
      '',
      '  Bootstrap prompt generated. Use one of:',
      '',
      '  # GitHub Copilot CLI:',
      `  ghcs "${result.prompt.substring(0, 100)}..."`,
      '',
      '  # Or view full prompt:',
      `  cat ${result.commandsPath}`,
      '',
      '  # Or with Claude Code:',
      `  claude -p "${result.prompt.substring(0, 100)}..."`,
    ];
    return lines.join('\n');
  }

  private formatWgNodeCanRunSuccess(result: WgCanRunResult): string {
    if (result.canRun) {
      return '✓ Node can run';
    }

    const lines: string[] = [`✗ Node cannot run: ${result.reason}`];

    if (result.blockingNodes && result.blockingNodes.length > 0) {
      lines.push('  Blocking nodes:');
      for (const blocking of result.blockingNodes) {
        lines.push(`    - ${blocking.nodeId} (${blocking.status})`);
        if (blocking.requiredOutputs.length > 0) {
          lines.push(`      Missing outputs: ${blocking.requiredOutputs.join(', ')}`);
        }
      }
    }

    return lines.join('\n');
  }

  private formatWgNodeMarkReadySuccess(result: WgMarkReadyResult): string {
    const lines: string[] = [`✓ Node '${result.nodeId}' marked ready`];
    lines.push(`  Status: ${result.status}`);
    lines.push(`  Ready at: ${result.readyAt}`);
    return lines.join('\n');
  }

  private formatWgNodeStartSuccess(result: WgStartResult): string {
    const lines: string[] = [`✓ Node '${result.nodeId}' started`];
    lines.push(`  Status: ${result.status}`);
    lines.push(`  Started at: ${result.startedAt}`);
    return lines.join('\n');
  }

  private formatWgNodeEndSuccess(result: WgEndResult): string {
    const lines: string[] = [`✓ Node '${result.nodeId}' completed`];
    lines.push(`  Status: ${result.status}`);
    lines.push(`  Completed at: ${result.completedAt}`);
    return lines.join('\n');
  }

  private formatWgNodeCanEndSuccess(result: WgCanEndResult): string {
    if (result.canEnd) {
      return `✓ Node '${result.nodeId}' can end (all required outputs present)`;
    }

    const lines: string[] = [`✗ Node '${result.nodeId}' cannot end`];
    if (result.missingOutputs && result.missingOutputs.length > 0) {
      lines.push(`  Missing outputs: ${result.missingOutputs.join(', ')}`);
    }
    return lines.join('\n');
  }

  private formatWgNodeListInputsSuccess(result: WgListInputsResult): string {
    if (result.inputs.length === 0) {
      return `ℹ️ Node '${result.nodeId}' has no inputs`;
    }

    const lines: string[] = [`✓ Node '${result.nodeId}' inputs`];
    lines.push('');

    for (const input of result.inputs) {
      const req = input.required ? '(required)' : '(optional)';
      const dt = input.dataType ? `:${input.dataType}` : '';
      const resolved = input.resolved ? '✓' : '○';
      const source = input.from ? ` ← ${input.from}.${input.output}` : '';
      lines.push(`  ${resolved} ${input.name} [${input.type}${dt}] ${req}${source}`);
    }

    return lines.join('\n');
  }

  private formatWgNodeListOutputsSuccess(result: WgListOutputsResult): string {
    if (result.outputs.length === 0) {
      return `ℹ️ Node '${result.nodeId}' has no outputs`;
    }

    const lines: string[] = [`✓ Node '${result.nodeId}' outputs`];
    lines.push('');

    for (const output of result.outputs) {
      const req = output.required ? '(required)' : '(optional)';
      const dt = output.dataType ? `:${output.dataType}` : '';
      const saved = output.saved ? '✓' : '○';
      lines.push(`  ${saved} ${output.name} [${output.type}${dt}] ${req}`);
    }

    return lines.join('\n');
  }

  private formatWgNodeGetInputDataSuccess(result: WgGetInputDataResult): string {
    const lines: string[] = [`✓ Input '${result.inputName}' for node '${result.nodeId}'`];
    if (result.fromNode) {
      lines.push(`  Source: ${result.fromNode}.${result.fromOutput}`);
    }
    lines.push(`  Value: ${JSON.stringify(result.value)}`);
    return lines.join('\n');
  }

  private formatWgNodeGetInputFileSuccess(result: WgGetInputFileResult): string {
    const lines: string[] = [`✓ Input file '${result.inputName}' for node '${result.nodeId}'`];
    if (result.fromNode) {
      lines.push(`  Source: ${result.fromNode}.${result.fromOutput}`);
    }
    lines.push(`  Path: ${result.filePath}`);
    return lines.join('\n');
  }

  private formatWgNodeGetOutputDataSuccess(result: WgGetOutputDataResult): string {
    const lines: string[] = [`✓ Output '${result.outputName}' for node '${result.nodeId}'`];
    lines.push(`  Value: ${JSON.stringify(result.value)}`);
    return lines.join('\n');
  }

  private formatWgNodeSaveOutputDataSuccess(result: WgSaveOutputDataResult): string {
    return `✓ Saved output '${result.outputName}' for node '${result.nodeId}'`;
  }

  private formatWgNodeSaveOutputFileSuccess(result: WgSaveOutputFileResult): string {
    const lines: string[] = [
      `✓ Saved output file '${result.outputName}' for node '${result.nodeId}'`,
    ];
    if (result.savedPath) {
      lines.push(`  Saved to: ${result.savedPath}`);
    }
    return lines.join('\n');
  }

  private formatWgNodeAskSuccess(result: WgAskResult): string {
    const lines: string[] = [`✓ Question asked for node '${result.nodeId}'`];
    lines.push(`  Status: ${result.status}`);
    lines.push(`  Question ID: ${result.questionId}`);
    lines.push(`  Type: ${result.question.type}`);
    lines.push(`  Text: ${result.question.text}`);

    if (result.question.options && result.question.options.length > 0) {
      lines.push('  Options:');
      for (const opt of result.question.options) {
        lines.push(`    - ${opt}`);
      }
    }

    return lines.join('\n');
  }

  private formatWgNodeAnswerSuccess(result: WgAnswerResult): string {
    const lines: string[] = [
      `✓ Question '${result.questionId}' answered for node '${result.nodeId}'`,
    ];
    lines.push(`  Status: ${result.status}`);
    lines.push(`  Answer: ${JSON.stringify(result.answer)}`);
    return lines.join('\n');
  }

  private formatWgNodeClearSuccess(result: WgClearResult): string {
    const lines: string[] = [`✓ Node '${result.nodeId}' cleared`];
    lines.push(`  Status: ${result.status}`);
    if (result.clearedOutputs.length > 0) {
      lines.push(`  Cleared outputs: ${result.clearedOutputs.join(', ')}`);
    }
    return lines.join('\n');
  }

  // ==================== Failure Formatters ====================

  private formatPrepareFailure(result: PrepareResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Phase '${result.phase}' preparation failed [${firstError.code}]`];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatValidateFailure(result: ValidateResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Phase '${result.phase}' validation failed [${firstError.code}]`];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatFinalizeFailure(result: FinalizeResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Phase '${result.phase}' finalize failed [${firstError.code}]`];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatComposeFailure(result: ComposeResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Workflow compose failed [${firstError.code}]`];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  // ==================== Workflow Management Failure Formatters (Phase 5) ====================

  private formatWorkflowListFailure(result: ListResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Workflow list failed [${firstError.code}]`];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatWorkflowInfoFailure(result: InfoResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Workflow info failed [${firstError.code}]`];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatWorkflowCheckpointFailure(result: CheckpointResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Checkpoint failed [${firstError.code}]`];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatWorkflowRestoreFailure(result: RestoreResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Restore failed [${firstError.code}]`];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatWorkflowVersionsFailure(result: VersionsResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Versions failed [${firstError.code}]`];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  // ==================== Handover Failure Formatters (Phase 3 Subtask 002) ====================

  private formatAcceptFailure(result: AcceptResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Phase '${result.phase}' accept failed [${firstError.code}]`];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatPreflightFailure(result: PreflightResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Phase '${result.phase}' preflight failed [${firstError.code}]`];

    lines.push('  Checks:');
    lines.push(`    Config valid: ${result.checks.configValid ? '✓' : '✗'}`);
    lines.push(`    Inputs exist: ${result.checks.inputsExist ? '✓' : '✗'}`);
    lines.push(`    Schemas valid: ${result.checks.schemasValid ? '✓' : '✗'}`);

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatHandoverFailure(result: HandoverResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Phase '${result.phase}' handover failed [${firstError.code}]`];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatGenericFailure<T extends BaseResult>(result: T): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Operation failed [${firstError.code}]`];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  // ==================== Message Failure Formatters ====================

  private formatMessageCreateFailure(result: MessageCreateResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ Message creation failed in phase '${result.phase}' [${firstError.code}]`,
    ];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatMessageAnswerFailure(result: MessageAnswerResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ Message answer failed for '${result.messageId}' in phase '${result.phase}' [${firstError.code}]`,
    ];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatMessageListFailure(result: MessageListResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ Message list failed for phase '${result.phase}' [${firstError.code}]`,
    ];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatMessageReadFailure(result: MessageReadResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ Message read failed in phase '${result.phase}' [${firstError.code}]`,
    ];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  // ==================== WorkGraph Failure Formatters ====================

  private formatUnitListFailure(result: WgUnitListResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Unit list failed [${firstError.code}]`];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatUnitInfoFailure(result: WgUnitLoadResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Unit info failed [${firstError.code}]`];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatUnitCreateFailure(result: WgUnitCreateResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Unit creation failed [${firstError.code}]`];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatUnitValidateFailure(result: WgUnitValidateResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Unit '${result.slug}' validation failed [${firstError.code}]`];

    // Show all issues
    if (result.issues.length > 0) {
      lines.push('');
      for (const issue of result.issues) {
        const icon = issue.severity === 'error' ? '✗' : '⚠';
        lines.push(`  ${icon} [${issue.code}] ${issue.path}: ${issue.message}`);
        if (issue.action) {
          lines.push(`    Action: ${issue.action}`);
        }
      }
    }

    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgCreateFailure(result: WgGraphCreateResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Graph creation failed [${firstError.code}]`];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgShowFailure(result: WgGraphShowResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Graph show failed [${firstError.code}]`];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgStatusFailure(result: WgGraphStatusResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Graph status failed [${firstError.code}]`];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeAddAfterFailure(result: WgAddNodeResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Add node failed [${firstError.code}]`];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeRemoveFailure(result: WgRemoveNodeResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Remove node failed [${firstError.code}]`];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeExecFailure(result: WgExecResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Node exec failed [${firstError.code}]`];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeCanRunFailure(result: WgCanRunResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Can-run check failed [${firstError.code}]`];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeMarkReadyFailure(result: WgMarkReadyResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ Mark ready failed for node '${result.nodeId}' [${firstError.code}]`,
    ];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeStartFailure(result: WgStartResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Node start failed for '${result.nodeId}' [${firstError.code}]`];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeEndFailure(result: WgEndResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Node end failed for '${result.nodeId}' [${firstError.code}]`];

    if (result.missingOutputs && result.missingOutputs.length > 0) {
      lines.push(`  Missing required outputs: ${result.missingOutputs.join(', ')}`);
    }

    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeCanEndFailure(result: WgCanEndResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ Can-end check failed for node '${result.nodeId}' [${firstError.code}]`,
    ];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeListInputsFailure(result: WgListInputsResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ List inputs failed for node '${result.nodeId}' [${firstError.code}]`,
    ];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeListOutputsFailure(result: WgListOutputsResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ List outputs failed for node '${result.nodeId}' [${firstError.code}]`,
    ];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeGetInputDataFailure(result: WgGetInputDataResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ Get input data failed for '${result.inputName}' [${firstError.code}]`,
    ];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeGetInputFileFailure(result: WgGetInputFileResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ Get input file failed for '${result.inputName}' [${firstError.code}]`,
    ];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeGetOutputDataFailure(result: WgGetOutputDataResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ Get output data failed for '${result.outputName}' [${firstError.code}]`,
    ];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeSaveOutputDataFailure(result: WgSaveOutputDataResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ Save output data failed for '${result.outputName}' [${firstError.code}]`,
    ];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeSaveOutputFileFailure(result: WgSaveOutputFileResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ Save output file failed for '${result.outputName}' [${firstError.code}]`,
    ];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeAskFailure(result: WgAskResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ Ask question failed for node '${result.nodeId}' [${firstError.code}]`,
    ];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeAnswerFailure(result: WgAnswerResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [
      `✗ Answer question failed for node '${result.nodeId}' [${firstError.code}]`,
    ];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  private formatWgNodeClearFailure(result: WgClearResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Clear node failed for '${result.nodeId}' [${firstError.code}]`];
    this.appendErrorDetails(lines, result.errors);
    return lines.join('\n');
  }

  // ==================== Error Formatting Helpers ====================

  /**
   * Append error details to output lines.
   */
  private appendErrorDetails(lines: string[], errors: ResultError[]): void {
    // Show paths for all errors
    if (errors.some((e) => e.path)) {
      lines.push('  Affected locations:');
      for (const error of errors) {
        if (error.path) {
          lines.push(`    - ${error.path}`);
        }
      }
    }

    // Show expected/actual for validation errors
    const validationError = errors.find((e) => e.expected && e.actual);
    if (validationError) {
      lines.push(`  Expected: ${validationError.expected}`);
      lines.push(`  Actual: ${validationError.actual}`);
    }

    // Show action suggestion from first error
    const action = errors[0]?.action;
    if (action) {
      lines.push('');
      lines.push(`  Action: ${action}`);
    }
  }
}
