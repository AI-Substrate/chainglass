/**
 * Message service interface for agent-orchestrator communication.
 *
 * Per Subtask 001: Message CLI Commands - Provides create(), answer(), list(), read()
 * methods for managing messages during phase execution.
 *
 * Implementations:
 * - MessageService: Real implementation using IFileSystem, ISchemaValidator
 * - FakeMessageService: Configurable implementation for testing with call capture
 */

import type {
  MessageCreateResult,
  MessageAnswerResult,
  MessageListResult,
  MessageReadResult,
} from '@chainglass/shared';
import type { MessageType, MessageAnswer } from '../types/message.types.js';

/**
 * Error codes for message operations (E060-E064 range).
 *
 * Per DYK Insight #3: Defined alongside interface per PhaseErrorCodes pattern.
 */
export const MessageErrorCodes = {
  /** Message ID not found in phase messages directory */
  MESSAGE_NOT_FOUND: 'E060',
  /** Answer type doesn't match message type (e.g., selected on free_text) */
  MESSAGE_TYPE_MISMATCH: 'E061',
  /** Message is awaiting answer (reserved for future state machine) */
  MESSAGE_AWAITING_ANSWER: 'E062',
  /** Message already has an answer */
  MESSAGE_ALREADY_ANSWERED: 'E063',
  /** Message content failed schema validation */
  MESSAGE_VALIDATION_FAILED: 'E064',
} as const;

/**
 * Content for creating a message.
 *
 * This is the JSON passed via --content flag. Structure depends on message type.
 */
export interface MessageContent {
  /** Brief subject line for the message */
  subject: string;
  /** Full message text with context */
  body: string;
  /** Optional creator note for audit/context */
  note?: string | null;
  /** Available options for choice types (required for single_choice and multi_choice) */
  options?: Array<{
    key: string;
    label: string;
    description?: string;
  }>;
}

/**
 * Answer input for the answer() method.
 *
 * Only one of selected/text/confirmed should be provided based on message type:
 * - single_choice: selected with exactly 1 key
 * - multi_choice: selected with 1+ keys
 * - free_text: text
 * - confirm: confirmed
 */
export interface AnswerInput {
  /** Selected option keys (for single_choice: exactly 1, for multi_choice: 1+) */
  selected?: string[];
  /** Free text response (for free_text type) */
  text?: string;
  /** Confirmation result (for confirm type) */
  confirmed?: boolean;
  /** Optional note with answerer's rationale */
  note?: string | null;
}

/**
 * Interface for message operations.
 */
export interface IMessageService {
  /**
   * Create a new message in a phase.
   *
   * Creates a message file (m-{id}.json) in the phase's messages/ directory.
   * Message ID is auto-assigned as next sequential 3-digit ID (001, 002, etc.).
   *
   * Also writes a signpost entry to wf-phase.json status array:
   * `{ "timestamp": "...", "from": "agent|orchestrator", "action": "question", "message_id": "001" }`
   *
   * Algorithm:
   * 1. Validate content against message.schema.json (E064 if invalid)
   * 2. Read existing messages to determine next ID
   * 3. Build full Message object with id, created_at, from, type, content
   * 4. Write m-{id}.json to messages/ directory
   * 5. Append status entry with action='question' and message_id
   * 6. Return MessageCreateResult with messageId and filePath
   *
   * Idempotency: Creates new message each time - not idempotent.
   *
   * @param phase - Phase name (e.g., 'gather', 'process')
   * @param runDir - Path to run directory
   * @param type - Message type (single_choice, multi_choice, free_text, confirm)
   * @param content - Message content (subject, body, options, note)
   * @param from - Who is creating the message (defaults to 'agent')
   * @returns MessageCreateResult with messageId, filePath, and errors
   *
   * @example
   * ```typescript
   * const result = await service.create(
   *   'process',
   *   '.chainglass/runs/run-001',
   *   'multi_choice',
   *   { subject: 'Output Format', body: 'How should I...', options: [...] },
   *   'agent'
   * );
   * if (result.errors.length === 0) {
   *   console.log('Created message:', result.messageId); // '001'
   * }
   * ```
   *
   * @throws Never throws - all errors returned in MessageCreateResult.errors:
   * - E064: Message content failed schema validation
   */
  create(
    phase: string,
    runDir: string,
    type: MessageType,
    content: MessageContent,
    from?: 'agent' | 'orchestrator'
  ): Promise<MessageCreateResult>;

  /**
   * Provide an answer to an existing message.
   *
   * Reads the message file, validates the answer matches message type,
   * adds the answer field, and writes updated message.
   *
   * Also writes a signpost entry to wf-phase.json status array:
   * `{ "timestamp": "...", "from": "orchestrator|agent", "action": "answer", "message_id": "001" }`
   *
   * Algorithm:
   * 1. Read m-{id}.json (E060 if not found)
   * 2. Check if already answered (E063 if answer exists)
   * 3. Validate answer matches message type (E061 if mismatch):
   *    - single_choice: selected must have exactly 1 valid key
   *    - multi_choice: selected must have 1+ valid keys
   *    - free_text: text must be non-empty string
   *    - confirm: confirmed must be boolean
   * 4. Add answer field with answered_at timestamp
   * 5. Write updated m-{id}.json
   * 6. Append status entry with action='answer' and message_id
   * 7. Return MessageAnswerResult
   *
   * Idempotency: Not idempotent - returns E063 if already answered.
   *
   * @param phase - Phase name
   * @param runDir - Path to run directory
   * @param id - Message ID (e.g., '001')
   * @param answer - Answer input (selected, text, or confirmed based on type)
   * @param from - Who is providing the answer (defaults to 'orchestrator')
   * @returns MessageAnswerResult with messageId, answer, and errors
   *
   * @example
   * ```typescript
   * const result = await service.answer(
   *   'process',
   *   '.chainglass/runs/run-001',
   *   '001',
   *   { selected: ['C'], note: 'Both options needed' },
   *   'orchestrator'
   * );
   * ```
   *
   * @throws Never throws - all errors returned in MessageAnswerResult.errors:
   * - E060: Message not found
   * - E061: Answer type mismatch
   * - E063: Message already answered
   */
  answer(
    phase: string,
    runDir: string,
    id: string,
    answer: AnswerInput,
    from?: 'agent' | 'orchestrator'
  ): Promise<MessageAnswerResult>;

  /**
   * List all messages in a phase.
   *
   * Reads all m-*.json files in the phase's messages/ directory and returns
   * summary information for each.
   *
   * Algorithm:
   * 1. List files in messages/ directory matching m-*.json pattern
   * 2. For each file, read and extract summary: id, type, subject, from, answered status
   * 3. Sort by ID ascending
   * 4. Return MessageListResult with messages array and count
   *
   * Idempotency: Always returns current state - idempotent.
   *
   * @param phase - Phase name
   * @param runDir - Path to run directory
   * @returns MessageListResult with messages array, count, and errors
   *
   * @example
   * ```typescript
   * const result = await service.list('process', '.chainglass/runs/run-001');
   * console.log(`Found ${result.count} messages`);
   * for (const msg of result.messages) {
   *   console.log(`${msg.id}: ${msg.subject} [${msg.answered ? 'answered' : 'pending'}]`);
   * }
   * ```
   *
   * @throws Never throws - empty messages returns { messages: [], count: 0 }
   */
  list(phase: string, runDir: string): Promise<MessageListResult>;

  /**
   * Read full content of a specific message.
   *
   * Returns the complete message object including answer if present.
   *
   * Algorithm:
   * 1. Read m-{id}.json (E060 if not found)
   * 2. Parse and return full Message object
   *
   * Idempotency: Always returns current state - idempotent.
   *
   * @param phase - Phase name
   * @param runDir - Path to run directory
   * @param id - Message ID (e.g., '001')
   * @returns MessageReadResult with full message content and errors
   *
   * @example
   * ```typescript
   * const result = await service.read('process', '.chainglass/runs/run-001', '001');
   * if (result.errors.length === 0) {
   *   console.log('Subject:', result.message.subject);
   *   if (result.message.answer) {
   *     console.log('Answer:', result.message.answer);
   *   }
   * }
   * ```
   *
   * @throws Never throws - all errors returned in MessageReadResult.errors:
   * - E060: Message not found
   */
  read(phase: string, runDir: string, id: string): Promise<MessageReadResult>;
}
