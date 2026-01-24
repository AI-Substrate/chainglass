/**
 * MessageService implementation for agent-orchestrator communication.
 *
 * Per Subtask 001: Message CLI Commands - Provides create(), answer(), list(), read()
 * methods for managing messages during phase execution.
 *
 * @remarks
 * **IMPORTANT: Single-Writer Constraint**
 *
 * This service follows the Facilitator Model where control passes between
 * agent and orchestrator. The status log (wf-phase.json) is updated using
 * a read-modify-write pattern that is NOT atomic.
 *
 * **Concurrent calls from the same actor may result in lost status entries.**
 *
 * This is acceptable under the Facilitator Model because:
 * - Only one actor (agent OR orchestrator) has control at a time
 * - The controlling actor should serialize their own operations
 * - Status log is for audit/discoverability, not critical state
 *
 * If concurrent access is required in the future, implement file locking
 * in the appendStatusEntry() method.
 */

import * as path from 'node:path';
import type {
  IFileSystem,
  MessageAnswerResult,
  MessageCreateResult,
  MessageListResult,
  MessageReadResult,
  ResultError,
} from '@chainglass/shared';
import type {
  AnswerInput,
  IMessageService,
  ISchemaValidator,
  MessageContent,
} from '../interfaces/index.js';
import { MessageErrorCodes } from '../interfaces/message-service.interface.js';
import { MESSAGE_SCHEMA } from '../schemas/index.js';
import type { Message, MessageType, StatusEntry, WfPhaseState } from '../types/index.js';

/**
 * Regex for valid phase names: alphanumeric with hyphen/underscore only.
 */
const VALID_PHASE_NAME = /^[a-zA-Z0-9_-]+$/;

/**
 * Regex for valid message IDs: 3-digit strings only.
 */
const VALID_MESSAGE_ID = /^\d{3}$/;

/**
 * MessageService implements message operations for agent-orchestrator communication.
 *
 * Depends on:
 * - IFileSystem: File operations (read, write, readDir, exists)
 * - ISchemaValidator: Validate messages against message.schema.json
 */
export class MessageService implements IMessageService {
  constructor(
    private readonly fs: IFileSystem,
    private readonly schemaValidator: ISchemaValidator
  ) {}

  /**
   * Create a new message in a phase.
   */
  async create(
    phase: string,
    runDir: string,
    type: MessageType,
    content: MessageContent,
    from: 'agent' | 'orchestrator' = 'agent'
  ): Promise<MessageCreateResult> {
    // Validate phase name to prevent path traversal
    if (!VALID_PHASE_NAME.test(phase)) {
      return this.createErrorResult<MessageCreateResult>(
        phase,
        runDir,
        MessageErrorCodes.MESSAGE_VALIDATION_FAILED,
        {
          message: `Invalid phase name: ${phase}`,
          action: 'Use alphanumeric phase name with hyphens/underscores only',
        },
        { messageId: '', filePath: '' }
      );
    }

    const messagesDir = path.join(runDir, 'phases', phase, 'run', 'messages');
    const wfDataDir = path.join(runDir, 'phases', phase, 'run', 'wf-data');

    // 1. Get next message ID
    const nextId = await this.getNextMessageId(messagesDir);

    // 2. Build full message object
    const message: Message = {
      id: nextId,
      created_at: new Date().toISOString(),
      from,
      type,
      subject: content.subject,
      body: content.body,
      ...(content.note !== undefined && { note: content.note }),
      ...(content.options && { options: content.options }),
    };

    // 3. Validate against schema
    const validationResult = this.schemaValidator.validate(MESSAGE_SCHEMA, message);
    if (!validationResult.valid) {
      return this.createErrorResult<MessageCreateResult>(
        phase,
        runDir,
        MessageErrorCodes.MESSAGE_VALIDATION_FAILED,
        {
          message: 'Message content failed schema validation',
          path: validationResult.errors[0]?.path,
          expected: validationResult.errors[0]?.expected,
          actual: validationResult.errors[0]?.actual,
          action: `Fix validation error: ${validationResult.errors[0]?.message || 'Unknown error'}`,
        },
        { messageId: '', filePath: '' }
      );
    }

    // 4. Write message file
    const filePath = path.join(messagesDir, `m-${nextId}.json`);
    await this.fs.writeFile(filePath, JSON.stringify(message, null, 2));

    // 5. Append status entry with question action
    await this.appendStatusEntry(phase, wfDataDir, {
      timestamp: message.created_at,
      from,
      action: 'question',
      message_id: nextId,
    });

    return {
      errors: [],
      phase,
      runDir,
      messageId: nextId,
      filePath,
    };
  }

  /**
   * Provide an answer to an existing message.
   */
  async answer(
    phase: string,
    runDir: string,
    id: string,
    answer: AnswerInput,
    from: 'agent' | 'orchestrator' = 'orchestrator'
  ): Promise<MessageAnswerResult> {
    // Validate phase name and message ID to prevent path traversal
    if (!VALID_PHASE_NAME.test(phase)) {
      return this.createErrorResult<MessageAnswerResult>(
        phase,
        runDir,
        MessageErrorCodes.MESSAGE_NOT_FOUND,
        {
          message: `Invalid phase name: ${phase}`,
          action: 'Use alphanumeric phase name with hyphens/underscores only',
        },
        { messageId: id, answer: null }
      );
    }
    if (!VALID_MESSAGE_ID.test(id)) {
      return this.createErrorResult<MessageAnswerResult>(
        phase,
        runDir,
        MessageErrorCodes.MESSAGE_NOT_FOUND,
        {
          message: `Invalid message ID: ${id}`,
          action: 'Provide valid 3-digit message ID',
        },
        { messageId: id, answer: null }
      );
    }

    const messagesDir = path.join(runDir, 'phases', phase, 'run', 'messages');
    const wfDataDir = path.join(runDir, 'phases', phase, 'run', 'wf-data');
    const filePath = path.join(messagesDir, `m-${id}.json`);

    // 1. Read existing message
    if (!(await this.fs.exists(filePath))) {
      return this.createErrorResult<MessageAnswerResult>(
        phase,
        runDir,
        MessageErrorCodes.MESSAGE_NOT_FOUND,
        {
          message: `Message not found: ${id}`,
          path: filePath,
          action: `Verify message ID '${id}' exists in phase '${phase}'`,
        },
        { messageId: id, answer: null }
      );
    }

    const messageContent = await this.fs.readFile(filePath);
    let message: Message;
    try {
      message = JSON.parse(messageContent);
    } catch (e) {
      return this.createErrorResult<MessageAnswerResult>(
        phase,
        runDir,
        MessageErrorCodes.MESSAGE_VALIDATION_FAILED,
        {
          message: `Invalid JSON in message file: ${(e as Error).message}`,
          path: filePath,
          action: 'Check file integrity or recreate message',
        },
        { messageId: id, answer: null }
      );
    }

    // 2. Check if already answered
    if (message.answer) {
      return this.createErrorResult<MessageAnswerResult>(
        phase,
        runDir,
        MessageErrorCodes.MESSAGE_ALREADY_ANSWERED,
        {
          message: `Message '${id}' has already been answered`,
          path: '/answer',
          actual: message.answer.answered_at,
          action: 'Message already has an answer and cannot be re-answered',
        },
        { messageId: id, answer: null }
      );
    }

    // 3. Validate answer matches message type
    const validationError = this.validateAnswerType(message.type, answer, message.options);
    if (validationError) {
      return this.createErrorResult<MessageAnswerResult>(
        phase,
        runDir,
        MessageErrorCodes.MESSAGE_TYPE_MISMATCH,
        validationError,
        { messageId: id, answer: null }
      );
    }

    // 4. Build answer object
    const messageAnswer = {
      answered_at: new Date().toISOString(),
      ...(answer.selected && { selected: answer.selected }),
      ...(answer.text !== undefined && { text: answer.text }),
      ...(answer.confirmed !== undefined && { confirmed: answer.confirmed }),
      ...(answer.note !== undefined && { note: answer.note }),
    };

    // 5. Update message with answer
    message.answer = messageAnswer;
    await this.fs.writeFile(filePath, JSON.stringify(message, null, 2));

    // 6. Append status entry with answer action
    await this.appendStatusEntry(phase, wfDataDir, {
      timestamp: messageAnswer.answered_at,
      from,
      action: 'answer',
      message_id: id,
    });

    return {
      errors: [],
      phase,
      runDir,
      messageId: id,
      answer: messageAnswer,
    };
  }

  /**
   * List all messages in a phase.
   */
  async list(phase: string, runDir: string): Promise<MessageListResult> {
    // Validate phase name to prevent path traversal
    if (!VALID_PHASE_NAME.test(phase)) {
      return {
        errors: [
          {
            code: MessageErrorCodes.MESSAGE_VALIDATION_FAILED,
            message: `Invalid phase name: ${phase}`,
            action: 'Use alphanumeric phase name with hyphens/underscores only',
          },
        ],
        phase,
        runDir,
        messages: [],
        count: 0,
      };
    }

    const messagesDir = path.join(runDir, 'phases', phase, 'run', 'messages');

    // Get all message files
    const files = await this.getMessageFiles(messagesDir);

    // Read and summarize each message
    const messages = [];
    for (const file of files) {
      const filePath = path.join(messagesDir, file);
      const content = await this.fs.readFile(filePath);
      let message: Message;
      try {
        message = JSON.parse(content);
      } catch {
        // Skip malformed files in listing
        continue;
      }

      messages.push({
        id: message.id,
        type: message.type,
        subject: message.subject,
        from: message.from,
        created_at: message.created_at,
        answered: !!message.answer,
        answered_at: message.answer?.answered_at || null,
      });
    }

    // Sort by ID ascending
    messages.sort((a, b) => a.id.localeCompare(b.id));

    return {
      errors: [],
      phase,
      runDir,
      messages,
      count: messages.length,
    };
  }

  /**
   * Read full content of a specific message.
   */
  async read(phase: string, runDir: string, id: string): Promise<MessageReadResult> {
    // Validate phase name and message ID to prevent path traversal
    if (!VALID_PHASE_NAME.test(phase)) {
      return this.createErrorResult<MessageReadResult>(
        phase,
        runDir,
        MessageErrorCodes.MESSAGE_NOT_FOUND,
        {
          message: `Invalid phase name: ${phase}`,
          action: 'Use alphanumeric phase name with hyphens/underscores only',
        },
        { message: null }
      );
    }
    if (!VALID_MESSAGE_ID.test(id)) {
      return this.createErrorResult<MessageReadResult>(
        phase,
        runDir,
        MessageErrorCodes.MESSAGE_NOT_FOUND,
        {
          message: `Invalid message ID: ${id}`,
          action: 'Provide valid 3-digit message ID',
        },
        { message: null }
      );
    }

    const messagesDir = path.join(runDir, 'phases', phase, 'run', 'messages');
    const filePath = path.join(messagesDir, `m-${id}.json`);

    // Check if message exists
    if (!(await this.fs.exists(filePath))) {
      return this.createErrorResult<MessageReadResult>(
        phase,
        runDir,
        MessageErrorCodes.MESSAGE_NOT_FOUND,
        {
          message: `Message not found: ${id}`,
          path: filePath,
          action: `Verify message ID '${id}' exists in phase '${phase}'`,
        },
        { message: null }
      );
    }

    // Read and parse message
    const content = await this.fs.readFile(filePath);
    let message: Message;
    try {
      message = JSON.parse(content);
    } catch (e) {
      return this.createErrorResult<MessageReadResult>(
        phase,
        runDir,
        MessageErrorCodes.MESSAGE_VALIDATION_FAILED,
        {
          message: `Invalid JSON in message file: ${(e as Error).message}`,
          path: filePath,
          action: 'Check file integrity or recreate message',
        },
        { message: null }
      );
    }

    return {
      errors: [],
      phase,
      runDir,
      message,
    };
  }

  // ===== Private Helpers =====

  /**
   * Get the next sequential message ID (001, 002, etc.)
   */
  private async getNextMessageId(messagesDir: string): Promise<string> {
    const files = await this.getMessageFiles(messagesDir);

    if (files.length === 0) {
      return '001';
    }

    // Extract IDs from m-XXX.json filenames
    const ids = files
      .map((f) => {
        const match = f.match(/^m-(\d{3})\.json$/);
        return match ? Number.parseInt(match[1], 10) : 0;
      })
      .filter((id) => id > 0);

    const maxId = Math.max(...ids, 0);
    return String(maxId + 1).padStart(3, '0');
  }

  /**
   * Get message files from directory (m-*.json pattern).
   */
  private async getMessageFiles(messagesDir: string): Promise<string[]> {
    if (!(await this.fs.exists(messagesDir))) {
      return [];
    }

    const entries = await this.fs.readDir(messagesDir);
    return entries.filter((f) => /^m-\d{3}\.json$/.test(f));
  }

  /**
   * Validate that answer matches message type.
   */
  private validateAnswerType(
    type: MessageType,
    answer: AnswerInput,
    options?: Message['options']
  ): Omit<ResultError, 'code'> | null {
    switch (type) {
      case 'single_choice':
        if (!answer.selected || answer.selected.length !== 1) {
          return {
            message: 'single_choice requires exactly one selection',
            path: '/answer/selected',
            expected: 'array with exactly 1 option key',
            actual: answer.selected ? `array with ${answer.selected.length} items` : 'undefined',
            action: 'Provide exactly one --select value (e.g., --select A)',
          };
        }
        return this.validateSelectedKeys(answer.selected, options);

      case 'multi_choice':
        if (!answer.selected || answer.selected.length === 0) {
          return {
            message: 'multi_choice requires at least one selection',
            path: '/answer/selected',
            expected: 'array with 1 or more option keys',
            actual: answer.selected ? 'empty array' : 'undefined',
            action: 'Provide at least one --select value (e.g., --select A,B)',
          };
        }
        return this.validateSelectedKeys(answer.selected, options);

      case 'free_text':
        if (answer.text === undefined || answer.text === '') {
          return {
            message: 'free_text requires text response',
            path: '/answer/text',
            expected: 'non-empty string',
            actual: answer.text === '' ? 'empty string' : 'undefined',
            action: 'Provide --text with response content',
          };
        }
        return null;

      case 'confirm':
        if (answer.confirmed === undefined) {
          return {
            message: 'confirm requires confirmed boolean',
            path: '/answer/confirmed',
            expected: 'boolean',
            actual: 'undefined',
            action: 'Provide --confirm or --deny flag',
          };
        }
        return null;

      default:
        return {
          message: `Unknown message type: ${type}`,
          path: '/type',
          action: 'Use a valid message type: single_choice, multi_choice, free_text, confirm',
        };
    }
  }

  /**
   * Validate selected keys exist in message options.
   */
  private validateSelectedKeys(
    selected: string[],
    options?: Message['options']
  ): Omit<ResultError, 'code'> | null {
    if (!options) {
      return {
        message: 'Message has no options to select from',
        path: '/options',
        action: 'This message does not have selectable options',
      };
    }

    const validKeys = new Set(options.map((o) => o.key));
    const invalidKeys = selected.filter((k) => !validKeys.has(k));

    if (invalidKeys.length > 0) {
      return {
        message: `Invalid option key(s): ${invalidKeys.join(', ')}`,
        path: '/answer/selected',
        expected: `one of: ${[...validKeys].join(', ')}`,
        actual: invalidKeys.join(', '),
        action: `Select from valid options: ${[...validKeys].join(', ')}`,
      };
    }

    return null;
  }

  /**
   * Append a status entry to wf-phase.json.
   */
  private async appendStatusEntry(
    phase: string,
    wfDataDir: string,
    entry: StatusEntry & { message_id?: string }
  ): Promise<void> {
    const wfPhasePath = path.join(wfDataDir, 'wf-phase.json');

    // Read existing wf-phase.json
    let wfPhase: WfPhaseState;
    if (await this.fs.exists(wfPhasePath)) {
      const content = await this.fs.readFile(wfPhasePath);
      try {
        wfPhase = JSON.parse(content);
      } catch {
        // If file is corrupted, reinitialize
        wfPhase = {
          phase,
          state: 'active',
          facilitator: 'agent',
          status: [],
        };
      }
    } else {
      // Initialize if doesn't exist
      wfPhase = {
        phase,
        state: 'active',
        facilitator: 'agent',
        status: [],
      };
    }

    // Append entry
    wfPhase.status.push(entry);

    // Write back
    await this.fs.writeFile(wfPhasePath, JSON.stringify(wfPhase, null, 2));
  }

  /**
   * Create error result with standard structure.
   */
  private createErrorResult<T extends { errors: ResultError[]; phase: string; runDir: string }>(
    phase: string,
    runDir: string,
    code: string,
    errorDetails: Omit<ResultError, 'code'>,
    extraFields: Omit<T, 'errors' | 'phase' | 'runDir'>
  ): T {
    return {
      errors: [{ code, ...errorDetails }],
      phase,
      runDir,
      ...extraFields,
    } as T;
  }
}
