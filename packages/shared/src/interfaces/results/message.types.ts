/**
 * Message command result types.
 *
 * Result types for message CLI commands (create, answer, list, read).
 * Per Phase 3 Subtask 001: Message CLI Commands.
 */

import type { BaseResult } from './base.types.js';

/**
 * Summary information for a message in list results.
 */
export interface MessageSummary {
  /** Message ID (3-digit sequential) */
  id: string;
  /** Message type */
  type: 'single_choice' | 'multi_choice' | 'free_text' | 'confirm';
  /** Brief subject line */
  subject: string;
  /** Who created the message */
  from: 'agent' | 'orchestrator';
  /** When the message was created (ISO-8601) */
  created_at: string;
  /** Whether the message has been answered */
  answered: boolean;
  /** When the message was answered (ISO-8601), null if not answered */
  answered_at: string | null;
}

/**
 * Answer to a message (subset of MessageAnswer from @chainglass/workflow).
 *
 * Duplicated here to avoid circular dependency between shared and workflow packages.
 */
export interface MessageAnswerData {
  /** ISO-8601 timestamp when answer was provided */
  answered_at: string;
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
 * Full message content for read results.
 *
 * Duplicated here to avoid circular dependency between shared and workflow packages.
 * Mirrors the Message type from @chainglass/workflow.
 */
export interface MessageData {
  /** Message ID (3-digit sequential, e.g., '001') */
  id: string;
  /** ISO-8601 timestamp when message was created */
  created_at: string;
  /** Who created the message */
  from: 'agent' | 'orchestrator';
  /** Message type determining answer format */
  type: 'single_choice' | 'multi_choice' | 'free_text' | 'confirm';
  /** Brief subject line for the message */
  subject: string;
  /** Full message text with context */
  body: string;
  /** Optional creator note for audit/context */
  note?: string | null;
  /** Available options for choice types */
  options?: Array<{
    key: string;
    label: string;
    description?: string;
  }>;
  /** Answer to the message (added when answered) */
  answer?: MessageAnswerData;
}

/**
 * Result of `cg phase message create` command.
 *
 * Returned by IMessageService.create().
 */
export interface MessageCreateResult extends BaseResult {
  /** Phase name where message was created */
  phase: string;
  /** Run directory path */
  runDir: string;
  /** Assigned message ID (e.g., '001') */
  messageId: string;
  /** Full path to created message file */
  filePath: string;
}

/**
 * Result of `cg phase message answer` command.
 *
 * Returned by IMessageService.answer().
 */
export interface MessageAnswerResult extends BaseResult {
  /** Phase name where message exists */
  phase: string;
  /** Run directory path */
  runDir: string;
  /** Message ID that was answered */
  messageId: string;
  /** The answer that was applied */
  answer: MessageAnswerData | null;
}

/**
 * Result of `cg phase message list` command.
 *
 * Returned by IMessageService.list().
 */
export interface MessageListResult extends BaseResult {
  /** Phase name */
  phase: string;
  /** Run directory path */
  runDir: string;
  /** List of message summaries */
  messages: MessageSummary[];
  /** Total count of messages */
  count: number;
}

/**
 * Result of `cg phase message read` command.
 *
 * Returned by IMessageService.read().
 */
export interface MessageReadResult extends BaseResult {
  /** Phase name */
  phase: string;
  /** Run directory path */
  runDir: string;
  /** Full message content (null if not found) */
  message: MessageData | null;
}
