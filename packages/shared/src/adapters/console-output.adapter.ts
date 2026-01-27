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
  SampleAddCmdResult,
  SampleDeleteCmdResult,
  SampleInfoCmdResult,
  SampleListCmdResult,
  ValidateResult,
  VersionsResult,
  WorkspaceAddCmdResult,
  WorkspaceInfoCmdResult,
  WorkspaceListCmdResult,
  WorkspaceRemoveCmdResult,
} from '../interfaces/index.js';

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
      case 'workspace.add':
        return this.formatWorkspaceAddSuccess(result as unknown as WorkspaceAddCmdResult);
      case 'workspace.list':
        return this.formatWorkspaceListSuccess(result as unknown as WorkspaceListCmdResult);
      case 'workspace.info':
        return this.formatWorkspaceInfoSuccess(result as unknown as WorkspaceInfoCmdResult);
      case 'workspace.remove':
        return this.formatWorkspaceRemoveSuccess(result as unknown as WorkspaceRemoveCmdResult);
      case 'sample.add':
        return this.formatSampleAddSuccess(result as unknown as SampleAddCmdResult);
      case 'sample.list':
        return this.formatSampleListSuccess(result as unknown as SampleListCmdResult);
      case 'sample.info':
        return this.formatSampleInfoSuccess(result as unknown as SampleInfoCmdResult);
      case 'sample.delete':
        return this.formatSampleDeleteSuccess(result as unknown as SampleDeleteCmdResult);
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
      case 'workspace.add':
        return this.formatWorkspaceAddFailure(result as unknown as WorkspaceAddCmdResult);
      case 'workspace.list':
        return this.formatWorkspaceListFailure(result as unknown as WorkspaceListCmdResult);
      case 'workspace.info':
        return this.formatWorkspaceInfoFailure(result as unknown as WorkspaceInfoCmdResult);
      case 'workspace.remove':
        return this.formatWorkspaceRemoveFailure(result as unknown as WorkspaceRemoveCmdResult);
      case 'sample.add':
        return this.formatSampleAddFailure(result as unknown as SampleAddCmdResult);
      case 'sample.list':
        return this.formatSampleListFailure(result as unknown as SampleListCmdResult);
      case 'sample.info':
        return this.formatSampleInfoFailure(result as unknown as SampleInfoCmdResult);
      case 'sample.delete':
        return this.formatSampleDeleteFailure(result as unknown as SampleDeleteCmdResult);
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

  // ==================== Workspace Success Formatters (Plan 014: Phase 5) ====================

  private formatWorkspaceAddSuccess(result: WorkspaceAddCmdResult): string {
    if (!result.workspace) {
      return '✓ Workspace added';
    }

    const ws = result.workspace;
    const lines: string[] = [`✓ Workspace '${ws.slug}' added`];
    lines.push(`  Name: ${ws.name}`);
    lines.push(`  Path: ${ws.path}`);

    if (result.warnings && result.warnings.length > 0) {
      lines.push('');
      for (const warning of result.warnings) {
        lines.push(`  ⚠ ${warning}`);
      }
    }

    return lines.join('\n');
  }

  private formatWorkspaceListSuccess(result: WorkspaceListCmdResult): string {
    if (result.workspaces.length === 0) {
      return 'No workspaces registered.\n  Run: cg workspace add "Name" /path/to/folder';
    }

    const lines: string[] = ['WORKSPACES'];

    for (const ws of result.workspaces) {
      const slug = ws.slug.padEnd(14);
      const name = ws.name.substring(0, 20).padEnd(22);
      lines.push(`  ${slug} ${name} ${ws.path}`);
    }

    lines.push('');
    lines.push(`${result.count} workspace${result.count === 1 ? '' : 's'} registered`);

    return lines.join('\n');
  }

  private formatWorkspaceInfoSuccess(result: WorkspaceInfoCmdResult): string {
    if (!result.workspace) {
      return '✓ Workspace info retrieved';
    }

    const ws = result.workspace;
    const lines: string[] = [`WORKSPACE: ${ws.name} (${ws.slug})`];
    lines.push(`  Path:    ${ws.path}`);
    lines.push(`  Created: ${ws.createdAt}`);

    if (result.isGitRepo && result.worktrees && result.worktrees.length > 0) {
      lines.push('');
      lines.push(`WORKTREES (${result.worktreeCount ?? result.worktrees.length})`);
      for (const wt of result.worktrees) {
        const name = wt.name.padEnd(18);
        const path = wt.path.padEnd(40);
        lines.push(`  ${name} ${path} (${wt.branch})`);
      }
    } else if (!result.isGitRepo) {
      lines.push('');
      lines.push('  ⚠ Not a git repository - no worktrees to display');
    }

    return lines.join('\n');
  }

  private formatWorkspaceRemoveSuccess(result: WorkspaceRemoveCmdResult): string {
    const lines: string[] = [`✓ Workspace '${result.slug}' removed from registry`];

    if (result.path) {
      lines.push(`  The folder at ${result.path} was not modified.`);
    }

    return lines.join('\n');
  }

  // ==================== Sample Success Formatters (Plan 014: Phase 5) ====================

  private formatSampleAddSuccess(result: SampleAddCmdResult): string {
    if (!result.sample) {
      return '✓ Sample created';
    }

    const s = result.sample;
    const lines: string[] = [`✓ Sample '${s.slug}' created`];

    if (result.path) {
      lines.push(`  File: ${result.path}`);
    }

    if (result.workspace) {
      lines.push(`  Workspace: ${result.workspace.slug} (${result.workspace.worktree})`);
    }

    return lines.join('\n');
  }

  private formatSampleListSuccess(result: SampleListCmdResult): string {
    const wsInfo = result.workspace
      ? `${result.workspace.worktree} (${result.workspace.slug})`
      : 'current context';

    if (result.samples.length === 0) {
      return `No samples in ${wsInfo}.\n  Run: cg sample add "Sample Name"`;
    }

    const lines: string[] = [`SAMPLES in ${wsInfo}`];

    for (const s of result.samples) {
      const slug = s.slug.padEnd(16);
      const name = s.name.substring(0, 18).padEnd(20);
      const created = s.createdAt.substring(0, 16);
      lines.push(`  ${slug} ${name} ${created}`);
    }

    lines.push('');
    lines.push(`${result.count} sample${result.count === 1 ? '' : 's'}`);

    return lines.join('\n');
  }

  private formatSampleInfoSuccess(result: SampleInfoCmdResult): string {
    if (!result.sample) {
      return '✓ Sample info retrieved';
    }

    const s = result.sample;
    const lines: string[] = [`SAMPLE: ${s.name} (${s.slug})`];
    lines.push(`  Created:  ${s.createdAt}`);
    lines.push(`  Updated:  ${s.updatedAt}`);

    if (result.path) {
      lines.push(`  File:     ${result.path}`);
    }

    lines.push('');
    lines.push('CONTENT:');

    // Truncate long content
    const maxContentLen = 500;
    if (s.content.length > maxContentLen) {
      lines.push(`  ${s.content.substring(0, maxContentLen)}...`);
      lines.push(`  [... truncated at ${maxContentLen} chars ...]`);
      lines.push('');
      lines.push('  Use --json for full content');
    } else {
      lines.push(`  ${s.content}`);
    }

    return lines.join('\n');
  }

  private formatSampleDeleteSuccess(result: SampleDeleteCmdResult): string {
    return `✓ Sample '${result.slug}' deleted`;
  }

  // ==================== Workspace Failure Formatters (Plan 014: Phase 5) ====================

  private formatWorkspaceAddFailure(result: WorkspaceAddCmdResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Workspace add failed [${firstError.code}]`];
    lines.push(`  ${firstError.message}`);

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatWorkspaceListFailure(result: WorkspaceListCmdResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Workspace list failed [${firstError.code}]`];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatWorkspaceInfoFailure(result: WorkspaceInfoCmdResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Workspace info failed [${firstError.code}]`];
    lines.push(`  ${firstError.message}`);

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatWorkspaceRemoveFailure(result: WorkspaceRemoveCmdResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Workspace remove failed [${firstError.code}]`];
    lines.push(`  ${firstError.message}`);

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  // ==================== Sample Failure Formatters (Plan 014: Phase 5) ====================

  private formatSampleAddFailure(result: SampleAddCmdResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Sample add failed [${firstError.code}]`];
    lines.push(`  ${firstError.message}`);

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatSampleListFailure(result: SampleListCmdResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Sample list failed [${firstError.code}]`];

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatSampleInfoFailure(result: SampleInfoCmdResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Sample info failed [${firstError.code}]`];
    lines.push(`  ${firstError.message}`);

    this.appendErrorDetails(lines, result.errors);

    return lines.join('\n');
  }

  private formatSampleDeleteFailure(result: SampleDeleteCmdResult): string {
    const firstError = result.errors[0];
    const lines: string[] = [`✗ Sample delete failed [${firstError.code}]`];
    lines.push(`  ${firstError.message}`);

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
