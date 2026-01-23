/**
 * Fake message service for testing.
 *
 * Per FakePhaseService pattern: Captures all method calls for test assertions
 * and can be configured with preset results.
 *
 * Used by:
 * - CLI integration tests to verify command handlers call service correctly
 * - Unit tests that need to mock IMessageService behavior
 * - Contract tests alongside real MessageService
 */

import type {
  MessageCreateResult,
  MessageAnswerResult,
  MessageListResult,
  MessageReadResult,
  MessageSummary,
} from '@chainglass/shared';
import type {
  IMessageService,
  MessageContent,
  AnswerInput,
} from '../interfaces/message-service.interface.js';
import type { Message, MessageType } from '../types/index.js';

/**
 * Recorded create() call for test inspection.
 */
export interface CreateCall {
  /** Phase name passed to create() */
  phase: string;
  /** Run directory passed to create() */
  runDir: string;
  /** Message type passed to create() */
  type: MessageType;
  /** Content passed to create() */
  content: MessageContent;
  /** From field passed to create() */
  from: 'agent' | 'orchestrator';
  /** Result returned from create() */
  result: MessageCreateResult;
  /** Timestamp when create() was called */
  timestamp: string;
}

/**
 * Recorded answer() call for test inspection.
 */
export interface AnswerCall {
  /** Phase name passed to answer() */
  phase: string;
  /** Run directory passed to answer() */
  runDir: string;
  /** Message ID passed to answer() */
  id: string;
  /** Answer input passed to answer() */
  answer: AnswerInput;
  /** From field passed to answer() */
  from: 'agent' | 'orchestrator';
  /** Result returned from answer() */
  result: MessageAnswerResult;
  /** Timestamp when answer() was called */
  timestamp: string;
}

/**
 * Recorded list() call for test inspection.
 */
export interface ListCall {
  /** Phase name passed to list() */
  phase: string;
  /** Run directory passed to list() */
  runDir: string;
  /** Result returned from list() */
  result: MessageListResult;
  /** Timestamp when list() was called */
  timestamp: string;
}

/**
 * Recorded read() call for test inspection.
 */
export interface ReadCall {
  /** Phase name passed to read() */
  phase: string;
  /** Run directory passed to read() */
  runDir: string;
  /** Message ID passed to read() */
  id: string;
  /** Result returned from read() */
  result: MessageReadResult;
  /** Timestamp when read() was called */
  timestamp: string;
}

/**
 * Fake message service for testing.
 *
 * Captures all create(), answer(), list(), read() calls for inspection.
 * Can be configured with preset results or use default success responses.
 */
export class FakeMessageService implements IMessageService {
  /** Recorded create calls */
  private createCalls: CreateCall[] = [];

  /** Recorded answer calls */
  private answerCalls: AnswerCall[] = [];

  /** Recorded list calls */
  private listCalls: ListCall[] = [];

  /** Recorded read calls */
  private readCalls: ReadCall[] = [];

  /** Preset create results for specific phases */
  private createResults = new Map<string, MessageCreateResult>();

  /** Preset answer results for specific message IDs */
  private answerResults = new Map<string, MessageAnswerResult>();

  /** Preset list results for specific phases */
  private listResults = new Map<string, MessageListResult>();

  /** Preset read results for specific message IDs */
  private readResults = new Map<string, MessageReadResult>();

  /** Default create result to return if no preset matches */
  private defaultCreateResult: MessageCreateResult | null = null;

  /** Default answer result to return if no preset matches */
  private defaultAnswerResult: MessageAnswerResult | null = null;

  /** Default list result to return if no preset matches */
  private defaultListResult: MessageListResult | null = null;

  /** Default read result to return if no preset matches */
  private defaultReadResult: MessageReadResult | null = null;

  /** Counter for auto-generated message IDs */
  private nextMessageId = 1;

  // ==================== Create Test Helpers ====================

  /**
   * Get the last create call (test helper).
   */
  getLastCreateCall(): CreateCall | null {
    return this.createCalls.length > 0 ? this.createCalls[this.createCalls.length - 1] : null;
  }

  /**
   * Get all create calls in order (test helper).
   */
  getCreateCalls(): CreateCall[] {
    return [...this.createCalls];
  }

  /**
   * Get number of create calls (test helper).
   */
  getCreateCallCount(): number {
    return this.createCalls.length;
  }

  /**
   * Set a preset create result for a specific phase (test helper).
   */
  setCreateResult(phase: string, result: MessageCreateResult): void {
    this.createResults.set(phase, result);
  }

  /**
   * Set a default create result for all calls (test helper).
   */
  setDefaultCreateResult(result: MessageCreateResult): void {
    this.defaultCreateResult = result;
  }

  // ==================== Answer Test Helpers ====================

  /**
   * Get the last answer call (test helper).
   */
  getLastAnswerCall(): AnswerCall | null {
    return this.answerCalls.length > 0 ? this.answerCalls[this.answerCalls.length - 1] : null;
  }

  /**
   * Get all answer calls in order (test helper).
   */
  getAnswerCalls(): AnswerCall[] {
    return [...this.answerCalls];
  }

  /**
   * Get number of answer calls (test helper).
   */
  getAnswerCallCount(): number {
    return this.answerCalls.length;
  }

  /**
   * Set a preset answer result for a specific message ID (test helper).
   * Key format: "phase:messageId"
   */
  setAnswerResult(phase: string, messageId: string, result: MessageAnswerResult): void {
    this.answerResults.set(`${phase}:${messageId}`, result);
  }

  /**
   * Set a default answer result for all calls (test helper).
   */
  setDefaultAnswerResult(result: MessageAnswerResult): void {
    this.defaultAnswerResult = result;
  }

  // ==================== List Test Helpers ====================

  /**
   * Get the last list call (test helper).
   */
  getLastListCall(): ListCall | null {
    return this.listCalls.length > 0 ? this.listCalls[this.listCalls.length - 1] : null;
  }

  /**
   * Get all list calls in order (test helper).
   */
  getListCalls(): ListCall[] {
    return [...this.listCalls];
  }

  /**
   * Get number of list calls (test helper).
   */
  getListCallCount(): number {
    return this.listCalls.length;
  }

  /**
   * Set a preset list result for a specific phase (test helper).
   */
  setListResult(phase: string, result: MessageListResult): void {
    this.listResults.set(phase, result);
  }

  /**
   * Set a default list result for all calls (test helper).
   */
  setDefaultListResult(result: MessageListResult): void {
    this.defaultListResult = result;
  }

  // ==================== Read Test Helpers ====================

  /**
   * Get the last read call (test helper).
   */
  getLastReadCall(): ReadCall | null {
    return this.readCalls.length > 0 ? this.readCalls[this.readCalls.length - 1] : null;
  }

  /**
   * Get all read calls in order (test helper).
   */
  getReadCalls(): ReadCall[] {
    return [...this.readCalls];
  }

  /**
   * Get number of read calls (test helper).
   */
  getReadCallCount(): number {
    return this.readCalls.length;
  }

  /**
   * Set a preset read result for a specific message ID (test helper).
   * Key format: "phase:messageId"
   */
  setReadResult(phase: string, messageId: string, result: MessageReadResult): void {
    this.readResults.set(`${phase}:${messageId}`, result);
  }

  /**
   * Set a default read result for all calls (test helper).
   */
  setDefaultReadResult(result: MessageReadResult): void {
    this.defaultReadResult = result;
  }

  // ==================== General Test Helpers ====================

  /**
   * Reset all state (test helper).
   */
  reset(): void {
    this.createCalls = [];
    this.answerCalls = [];
    this.listCalls = [];
    this.readCalls = [];
    this.createResults.clear();
    this.answerResults.clear();
    this.listResults.clear();
    this.readResults.clear();
    this.defaultCreateResult = null;
    this.defaultAnswerResult = null;
    this.defaultListResult = null;
    this.defaultReadResult = null;
    this.nextMessageId = 1;
  }

  // ==================== Static Factory Methods ====================

  /**
   * Create a success create result for testing (static factory).
   */
  static createSuccessResult(
    phase: string,
    runDir: string,
    messageId: string,
    filePath: string
  ): MessageCreateResult {
    return {
      errors: [],
      phase,
      runDir,
      messageId,
      filePath,
    };
  }

  /**
   * Create an error create result for testing (static factory).
   */
  static createErrorResult(
    phase: string,
    runDir: string,
    code: string,
    message: string,
    action?: string
  ): MessageCreateResult {
    return {
      errors: [{ code, message, action }],
      phase,
      runDir,
      messageId: '',
      filePath: '',
    };
  }

  /**
   * Create a success answer result for testing (static factory).
   */
  static answerSuccessResult(
    phase: string,
    runDir: string,
    messageId: string,
    answer: { answered_at: string; selected?: string[]; text?: string; confirmed?: boolean; note?: string }
  ): MessageAnswerResult {
    return {
      errors: [],
      phase,
      runDir,
      messageId,
      answer,
    };
  }

  /**
   * Create an error answer result for testing (static factory).
   */
  static answerErrorResult(
    phase: string,
    runDir: string,
    messageId: string,
    code: string,
    message: string,
    action?: string
  ): MessageAnswerResult {
    return {
      errors: [{ code, message, action }],
      phase,
      runDir,
      messageId,
      answer: null,
    };
  }

  /**
   * Create a success list result for testing (static factory).
   */
  static listSuccessResult(
    phase: string,
    runDir: string,
    messages: MessageSummary[]
  ): MessageListResult {
    return {
      errors: [],
      phase,
      runDir,
      messages,
      count: messages.length,
    };
  }

  /**
   * Create a success read result for testing (static factory).
   */
  static readSuccessResult(
    phase: string,
    runDir: string,
    message: Message
  ): MessageReadResult {
    return {
      errors: [],
      phase,
      runDir,
      message,
    };
  }

  /**
   * Create an error read result for testing (static factory).
   */
  static readErrorResult(
    phase: string,
    runDir: string,
    code: string,
    message: string,
    action?: string
  ): MessageReadResult {
    return {
      errors: [{ code, message, action }],
      phase,
      runDir,
      message: null,
    };
  }

  // ==================== IMessageService Implementation ====================

  /**
   * Create a message (fake implementation).
   */
  async create(
    phase: string,
    runDir: string,
    type: MessageType,
    content: MessageContent,
    from: 'agent' | 'orchestrator' = 'agent'
  ): Promise<MessageCreateResult> {
    // Check for preset result
    const presetResult = this.createResults.get(phase);
    if (presetResult) {
      this.createCalls.push({
        phase,
        runDir,
        type,
        content,
        from,
        result: presetResult,
        timestamp: new Date().toISOString(),
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultCreateResult) {
      this.createCalls.push({
        phase,
        runDir,
        type,
        content,
        from,
        result: this.defaultCreateResult,
        timestamp: new Date().toISOString(),
      });
      return this.defaultCreateResult;
    }

    // Generate auto success result
    const messageId = String(this.nextMessageId++).padStart(3, '0');
    const filePath = `${runDir}/phases/${phase}/run/messages/m-${messageId}.json`;
    const result: MessageCreateResult = {
      errors: [],
      phase,
      runDir,
      messageId,
      filePath,
    };

    this.createCalls.push({ phase, runDir, type, content, from, result, timestamp: new Date().toISOString() });
    return result;
  }

  /**
   * Answer a message (fake implementation).
   */
  async answer(
    phase: string,
    runDir: string,
    id: string,
    answer: AnswerInput,
    from: 'agent' | 'orchestrator' = 'orchestrator'
  ): Promise<MessageAnswerResult> {
    const key = `${phase}:${id}`;

    // Check for preset result
    const presetResult = this.answerResults.get(key);
    if (presetResult) {
      this.answerCalls.push({
        phase,
        runDir,
        id,
        answer,
        from,
        result: presetResult,
        timestamp: new Date().toISOString(),
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultAnswerResult) {
      this.answerCalls.push({
        phase,
        runDir,
        id,
        answer,
        from,
        result: this.defaultAnswerResult,
        timestamp: new Date().toISOString(),
      });
      return this.defaultAnswerResult;
    }

    // Generate auto success result
    const result: MessageAnswerResult = {
      errors: [],
      phase,
      runDir,
      messageId: id,
      answer: {
        answered_at: new Date().toISOString(),
        ...answer,
      },
    };

    this.answerCalls.push({ phase, runDir, id, answer, from, result, timestamp: new Date().toISOString() });
    return result;
  }

  /**
   * List messages (fake implementation).
   */
  async list(phase: string, runDir: string): Promise<MessageListResult> {
    // Check for preset result
    const presetResult = this.listResults.get(phase);
    if (presetResult) {
      this.listCalls.push({
        phase,
        runDir,
        result: presetResult,
        timestamp: new Date().toISOString(),
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultListResult) {
      this.listCalls.push({
        phase,
        runDir,
        result: this.defaultListResult,
        timestamp: new Date().toISOString(),
      });
      return this.defaultListResult;
    }

    // Generate auto success result (empty list)
    const result: MessageListResult = {
      errors: [],
      phase,
      runDir,
      messages: [],
      count: 0,
    };

    this.listCalls.push({ phase, runDir, result, timestamp: new Date().toISOString() });
    return result;
  }

  /**
   * Read a message (fake implementation).
   */
  async read(phase: string, runDir: string, id: string): Promise<MessageReadResult> {
    const key = `${phase}:${id}`;

    // Check for preset result
    const presetResult = this.readResults.get(key);
    if (presetResult) {
      this.readCalls.push({
        phase,
        runDir,
        id,
        result: presetResult,
        timestamp: new Date().toISOString(),
      });
      return presetResult;
    }

    // Check for default result
    if (this.defaultReadResult) {
      this.readCalls.push({
        phase,
        runDir,
        id,
        result: this.defaultReadResult,
        timestamp: new Date().toISOString(),
      });
      return this.defaultReadResult;
    }

    // Generate auto success result with minimal message
    const result: MessageReadResult = {
      errors: [],
      phase,
      runDir,
      message: {
        id,
        created_at: new Date().toISOString(),
        from: 'agent',
        type: 'free_text',
        subject: `Fake message ${id}`,
        body: 'Fake message body',
      },
    };

    this.readCalls.push({ phase, runDir, id, result, timestamp: new Date().toISOString() });
    return result;
  }
}
