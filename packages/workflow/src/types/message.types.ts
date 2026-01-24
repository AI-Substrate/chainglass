/**
 * TypeScript types matching message.schema.json
 * Schema for agent-orchestrator communication messages
 */

/**
 * Message type determining answer format
 */
export type MessageType = 'single_choice' | 'multi_choice' | 'free_text' | 'confirm';

/**
 * Option for choice message types
 */
export interface MessageOption {
  /** Single letter key (A, B, C, etc.) */
  key: string;
  /** Short label for the option */
  label: string;
  /** Longer description of the option */
  description?: string;
}

/**
 * Answer to a message
 */
export interface MessageAnswer {
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
 * Agent-orchestrator communication message
 */
export interface Message {
  /** Message ID (3-digit sequential, e.g., '001') */
  id: string;
  /** ISO-8601 timestamp when message was created */
  created_at: string;
  /** Who created the message */
  from: 'agent' | 'orchestrator';
  /** Message type determining answer format */
  type: MessageType;
  /** Brief subject line for the message */
  subject: string;
  /** Full message text with context */
  body: string;
  /** Optional creator note for audit/context */
  note?: string | null;
  /** Available options for choice types (required for single_choice and multi_choice) */
  options?: MessageOption[];
  /** Answer to the message (added when answered) */
  answer?: MessageAnswer;
}
