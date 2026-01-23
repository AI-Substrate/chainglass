/**
 * Console output adapter for formatting service results.
 *
 * Per Critical Discovery 01: Services return domain result objects,
 * adapters format for output (JSON or Console).
 *
 * Produces human-readable output with:
 * - ✓ icon for success
 * - ✗ icon for failure
 * - Structured text per command type
 *
 * Per DYK Insight #2: Uses command dispatch pattern with dedicated
 * format methods per result type.
 */

import type {
  BaseResult,
  ComposeResult,
  FinalizeResult,
  IOutputAdapter,
  MessageAnswerResult,
  MessageCreateResult,
  MessageListResult,
  MessageReadResult,
  PrepareResult,
  ResultError,
  ValidateResult,
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
      case 'wf.compose':
        return this.formatComposeSuccess(result as unknown as ComposeResult);
      case 'message.create':
        return this.formatMessageCreateSuccess(result as unknown as MessageCreateResult);
      case 'message.answer':
        return this.formatMessageAnswerSuccess(result as unknown as MessageAnswerResult);
      case 'message.list':
        return this.formatMessageListSuccess(result as unknown as MessageListResult);
      case 'message.read':
        return this.formatMessageReadSuccess(result as unknown as MessageReadResult);
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
      case 'wf.compose':
        return this.formatComposeFailure(result as unknown as ComposeResult);
      case 'message.create':
        return this.formatMessageCreateFailure(result as unknown as MessageCreateResult);
      case 'message.answer':
        return this.formatMessageAnswerFailure(result as unknown as MessageAnswerResult);
      case 'message.list':
        return this.formatMessageListFailure(result as unknown as MessageListResult);
      case 'message.read':
        return this.formatMessageReadFailure(result as unknown as MessageReadResult);
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
