/**
 * Message command group for the CLI.
 *
 * Per Phase 3 Subtask 001: Message CLI Commands - Provides cg phase message
 * create/answer/list/read commands for agent-orchestrator communication.
 *
 * Message commands are nested under `cg phase message` to maintain logical grouping
 * with other phase operations.
 */

import {
  ConsoleOutputAdapter,
  type IOutputAdapter,
  JsonOutputAdapter,
  NodeFileSystemAdapter,
} from '@chainglass/shared';
import {
  type AnswerInput,
  type IMessageService,
  type MessageContent,
  MessageService,
  type MessageType,
  SchemaValidatorAdapter,
} from '@chainglass/workflow';
import type { Command } from 'commander';

// ==================== Option Types ====================

/**
 * Options for phase message create command.
 */
interface CreateOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Run directory path (required) */
  runDir: string;
  /** Message type (required) */
  type: string;
  /** Message subject (required) */
  subject: string;
  /** Message body (required) */
  body: string;
  /** Optional note */
  note?: string;
  /** Options for choice types (format: "key1:label1,key2:label2") */
  options?: string;
  /** From field override (default: agent) */
  from?: 'agent' | 'orchestrator';
}

/**
 * Options for phase message answer command.
 */
interface AnswerOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Run directory path (required) */
  runDir: string;
  /** Message ID (required) */
  id: string;
  /** Selected option(s) for single_choice/multi_choice */
  select?: string[];
  /** Text response for free_text */
  text?: string;
  /** Confirm (true) for confirm type */
  confirm?: boolean;
  /** Deny (false) for confirm type */
  deny?: boolean;
  /** Optional note */
  note?: string;
  /** From field override (default: orchestrator) */
  from?: 'agent' | 'orchestrator';
}

/**
 * Options for phase message list command.
 */
interface ListOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Run directory path (required) */
  runDir: string;
}

/**
 * Options for phase message read command.
 */
interface ReadOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Run directory path (required) */
  runDir: string;
  /** Message ID (required) */
  id: string;
}

// ==================== Service/Adapter Factories ====================

/**
 * Create a message service with real implementations.
 *
 * TODO: Replace with DI container resolution.
 */
function createMessageService(): IMessageService {
  const fs = new NodeFileSystemAdapter();
  const schemaValidator = new SchemaValidatorAdapter();
  return new MessageService(fs, schemaValidator);
}

/**
 * Create an output adapter based on options.
 *
 * TODO: Replace with DI container resolution.
 */
function createOutputAdapter(json: boolean): IOutputAdapter {
  return json ? new JsonOutputAdapter() : new ConsoleOutputAdapter();
}

// ==================== Helper Functions ====================

/**
 * Parse options string into MessageOption array.
 *
 * Format: "A:Option A,B:Option B" → [{ key: 'A', label: 'Option A' }, ...]
 */
function parseOptions(optionsStr: string): { key: string; label: string }[] {
  return optionsStr.split(',').map((opt) => {
    const [key, ...labelParts] = opt.split(':');
    const label = labelParts.join(':'); // Allow colons in label
    return { key: key.trim(), label: label.trim() };
  });
}

/**
 * Validate message type is one of the allowed values.
 */
function isValidMessageType(type: string): type is MessageType {
  return ['single_choice', 'multi_choice', 'free_text', 'confirm'].includes(type);
}

// ==================== Command Handlers ====================

/**
 * Handle cg phase message create <phase> command.
 *
 * @param phase - Phase name to create message in
 * @param options - Command options
 */
async function handleCreate(phase: string, options: CreateOptions): Promise<void> {
  const service = createMessageService();
  const adapter = createOutputAdapter(options.json ?? false);

  // Validate message type
  if (!isValidMessageType(options.type)) {
    const errorResult = {
      errors: [
        {
          code: 'E064',
          message: `Invalid message type: ${options.type}`,
          expected: 'single_choice | multi_choice | free_text | confirm',
          actual: options.type,
          action:
            'Provide a valid --type value: single_choice, multi_choice, free_text, or confirm',
        },
      ],
      phase,
      runDir: options.runDir,
      messageId: '',
      filePath: '',
    };
    const output = adapter.format('message.create', errorResult);
    console.log(output);
    process.exit(1);
  }

  // Build content object
  const content: MessageContent = {
    subject: options.subject,
    body: options.body,
  };

  if (options.note) {
    content.note = options.note;
  }

  // Parse options if provided (for choice types)
  if (options.options) {
    content.options = parseOptions(options.options);
  }

  // Call service
  const result = await service.create(
    phase,
    options.runDir,
    options.type as MessageType,
    content,
    options.from ?? 'agent'
  );

  const output = adapter.format('message.create', result);
  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg phase message answer <phase> command.
 *
 * @param phase - Phase name containing the message
 * @param options - Command options
 */
async function handleAnswer(phase: string, options: AnswerOptions): Promise<void> {
  const service = createMessageService();
  const adapter = createOutputAdapter(options.json ?? false);

  // Validate that at least one answer type is provided
  if (
    !options.select &&
    options.text === undefined &&
    options.confirm === undefined &&
    options.deny === undefined
  ) {
    const errorResult = {
      errors: [
        {
          code: 'E061',
          message: 'No answer provided',
          action:
            'Provide --select for choice types, --text for free_text, or --confirm/--deny for confirm type',
        },
      ],
      phase,
      runDir: options.runDir,
      messageId: options.id,
      answer: null,
    };
    const output = adapter.format('message.answer', errorResult);
    console.log(output);
    process.exit(1);
  }

  // Build answer input
  const answer: AnswerInput = {};

  if (options.select && options.select.length > 0) {
    answer.selected = options.select;
  }

  if (options.text !== undefined) {
    answer.text = options.text;
  }

  if (options.confirm !== undefined) {
    answer.confirmed = true;
  }

  if (options.deny !== undefined) {
    answer.confirmed = false;
  }

  if (options.note) {
    answer.note = options.note;
  }

  // Call service
  const result = await service.answer(
    phase,
    options.runDir,
    options.id,
    answer,
    options.from ?? 'orchestrator'
  );

  const output = adapter.format('message.answer', result);
  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg phase message list <phase> command.
 *
 * @param phase - Phase name to list messages from
 * @param options - Command options
 */
async function handleList(phase: string, options: ListOptions): Promise<void> {
  const service = createMessageService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.list(phase, options.runDir);
  const output = adapter.format('message.list', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg phase message read <phase> command.
 *
 * @param phase - Phase name containing the message
 * @param options - Command options
 */
async function handleRead(phase: string, options: ReadOptions): Promise<void> {
  const service = createMessageService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.read(phase, options.runDir, options.id);
  const output = adapter.format('message.read', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

// ==================== Command Registration ====================

/**
 * Register the message subcommands under a parent command.
 *
 * Creates the cg phase message command group with subcommands:
 * - cg phase message create <phase> - Create a new message
 * - cg phase message answer <phase> - Answer an existing message
 * - cg phase message list <phase> - List messages in a phase
 * - cg phase message read <phase> - Read a message's full content
 *
 * @param phaseCommand - Parent 'phase' command to register under
 */
export function registerMessageCommands(phaseCommand: Command): void {
  const message = phaseCommand
    .command('message')
    .description('Agent-orchestrator messaging commands');

  // cg phase message create <phase>
  message
    .command('create <phase>')
    .description('Create a new message in a phase')
    .requiredOption('--run-dir <path>', 'Run directory path')
    .requiredOption(
      '--type <type>',
      'Message type: single_choice, multi_choice, free_text, confirm'
    )
    .requiredOption('--subject <text>', 'Message subject')
    .requiredOption('--body <text>', 'Message body')
    .option('--note <text>', 'Optional note')
    .option('--options <opts>', 'Options for choice types (format: "A:Label A,B:Label B")')
    .option('--from <sender>', 'Sender: agent or orchestrator', 'agent')
    .option('--json', 'Output as JSON', false)
    .action(async (phase: string, opts: CreateOptions) => {
      await handleCreate(phase, opts);
    });

  // cg phase message answer <phase>
  message
    .command('answer <phase>')
    .description('Answer an existing message')
    .requiredOption('--run-dir <path>', 'Run directory path')
    .requiredOption('--id <messageId>', 'Message ID to answer (e.g., 001)')
    .option('--select <keys...>', 'Selected option key(s) for single_choice/multi_choice')
    .option('--text <response>', 'Text response for free_text')
    .option('--confirm', 'Confirm (true) for confirm type')
    .option('--deny', 'Deny (false) for confirm type')
    .option('--note <text>', 'Optional note')
    .option('--from <sender>', 'Sender: agent or orchestrator', 'orchestrator')
    .option('--json', 'Output as JSON', false)
    .action(async (phase: string, opts: AnswerOptions) => {
      await handleAnswer(phase, opts);
    });

  // cg phase message list <phase>
  message
    .command('list <phase>')
    .description('List all messages in a phase')
    .requiredOption('--run-dir <path>', 'Run directory path')
    .option('--json', 'Output as JSON', false)
    .action(async (phase: string, opts: ListOptions) => {
      await handleList(phase, opts);
    });

  // cg phase message read <phase>
  message
    .command('read <phase>')
    .description('Read full content of a message')
    .requiredOption('--run-dir <path>', 'Run directory path')
    .requiredOption('--id <messageId>', 'Message ID to read (e.g., 001)')
    .option('--json', 'Output as JSON', false)
    .action(async (phase: string, opts: ReadOptions) => {
      await handleRead(phase, opts);
    });
}
