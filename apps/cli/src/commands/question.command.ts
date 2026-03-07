/**
 * Plan 067: Question Popper — CLI Question Commands
 *
 * `cg question ask|get|answer|list` — the primary agent interface for asking
 * questions and receiving answers through the Chainglass web UI.
 *
 * AC-05: Blocking poll until answered
 * AC-06: Default timeout 600s, prints pending on expiry
 * AC-07: --timeout 0 returns immediately
 * AC-08: get returns answer or pending status
 * AC-09: list shows type, status, source, text, age
 * AC-10: answer submits from CLI (scripting/testing)
 * AC-13/14: Tmux context auto-detected
 * AC-34: Self-documenting --help for agents
 * DYK-01: SIGINT prints questionId for recovery
 * DYK-02: Poll retries on transient errors (5 consecutive failures to abort)
 * DYK-03: Source defaults to cg-question:${USER}
 * DYK-04: answer coerces type based on questionType
 */

import { getTmuxMeta } from '@chainglass/shared/event-popper';
import type { QuestionOut } from '@chainglass/shared/question-popper';
import chalk from 'chalk';
import type { Command } from 'commander';
import { wrapAction } from './command-helpers.js';
import {
  EventPopperClientError,
  type IEventPopperClient,
  createEventPopperClient,
  discoverServerUrl,
} from './event-popper-client.js';

// ── Defaults ──

const DEFAULT_TIMEOUT = 600;
const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_FAILURES = 5;

function defaultSource(prefix: string): string {
  return `${prefix}:${process.env.USER || 'unknown'}`;
}

// ── Exported Handlers (testable with FakeEventPopperClient) ──

export async function handleQuestionAsk(
  client: IEventPopperClient,
  options: {
    type: string;
    text: string;
    description?: string;
    options?: string[];
    default?: string;
    timeout: string;
    previousQuestionId?: string;
    source: string;
  }
): Promise<void> {
  const timeout = Number.parseInt(options.timeout, 10);
  if (Number.isNaN(timeout) || timeout < 0) {
    console.error(chalk.red('--timeout must be a non-negative integer'));
    process.exitCode = 1;
    return;
  }

  const body = {
    source: options.source,
    questionType: options.type,
    text: options.text,
    description: options.description ?? null,
    options: options.options ?? null,
    default: options.default ?? null,
    timeout,
    previousQuestionId: options.previousQuestionId ?? null,
    meta: { ...getTmuxMeta() },
  };

  const { questionId } = await client.askQuestion(body);

  // --timeout 0: return immediately (AC-07)
  if (timeout === 0) {
    console.log(JSON.stringify({ questionId, status: 'pending' }));
    return;
  }

  // DYK-01: SIGINT handler prints questionId for agent recovery
  const sigintHandler = () => {
    console.log(JSON.stringify({ questionId, status: 'interrupted' }));
    process.exit(0);
  };
  process.on('SIGINT', sigintHandler);
  process.on('SIGTERM', sigintHandler);

  try {
    const result = await pollForAnswer(client, questionId, timeout);
    console.log(JSON.stringify(result));
  } finally {
    process.removeListener('SIGINT', sigintHandler);
    process.removeListener('SIGTERM', sigintHandler);
  }
}

export async function handleQuestionGet(client: IEventPopperClient, id: string): Promise<void> {
  try {
    const question = await client.getQuestion(id);
    console.log(JSON.stringify(question));
  } catch (error) {
    if (error instanceof EventPopperClientError && error.isNotFound) {
      console.error(chalk.red(`Question not found: ${id}`));
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

export async function handleQuestionAnswer(
  client: IEventPopperClient,
  id: string,
  options: { answer: string; text?: string }
): Promise<void> {
  // DYK-04: GET question first to determine type, then coerce answer value
  let question: QuestionOut;
  try {
    question = await client.getQuestion(id);
  } catch (error) {
    if (error instanceof EventPopperClientError && error.isNotFound) {
      console.error(chalk.red(`Question not found: ${id}`));
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const coerced = coerceAnswer(options.answer, question.question.questionType);

  try {
    const updated = await client.answerQuestion(id, {
      answer: coerced,
      text: options.text ?? null,
    });
    console.log(JSON.stringify(updated));
  } catch (error) {
    if (error instanceof EventPopperClientError) {
      if (error.isNotFound) {
        console.error(chalk.red(`Question not found: ${id}`));
        process.exitCode = 1;
        return;
      }
      if (error.isConflict) {
        console.error(chalk.red(`Question already resolved: ${id}`));
        process.exitCode = 1;
        return;
      }
    }
    throw error;
  }
}

export async function handleQuestionList(
  client: IEventPopperClient,
  options: { status?: string; limit: string; json?: boolean }
): Promise<void> {
  const limit = Number.parseInt(options.limit, 10);
  const result = await client.listAll({
    status: options.status,
    limit: Number.isNaN(limit) ? 20 : limit,
  });

  if (options.json) {
    console.log(JSON.stringify(result));
    return;
  }

  // Human-readable table
  if (result.items.length === 0) {
    console.log(chalk.gray('No questions or alerts found.'));
    return;
  }

  console.log(
    chalk.bold(
      `${'Type'.padEnd(10)}${'Status'.padEnd(20)}${'Source'.padEnd(25)}${'Text'.padEnd(40)}Age`
    )
  );
  console.log('─'.repeat(105));

  for (const item of result.items) {
    const isQuestion = 'questionId' in item;
    const type = isQuestion ? 'question' : 'alert';
    const status = item.status;
    const source = item.source;
    const text = isQuestion
      ? (item as QuestionOut).question.text
      : (item as { alert: { text: string } }).alert.text;
    const createdAt = item.createdAt;
    const age = formatAge(createdAt);

    const statusColor =
      status === 'pending' || status === 'unread'
        ? chalk.yellow
        : status === 'answered' || status === 'acknowledged'
          ? chalk.green
          : chalk.gray;

    console.log(
      `${type.padEnd(10)}${statusColor(status.padEnd(20))}${source.slice(0, 24).padEnd(25)}${text.slice(0, 39).padEnd(40)}${age}`
    );
  }

  if (result.total > result.items.length) {
    console.log(chalk.gray(`\n... and ${result.total - result.items.length} more`));
  }
}

// ── Poll Loop (DYK-02: retry on transient errors) ──

async function pollForAnswer(
  client: IEventPopperClient,
  questionId: string,
  timeoutSeconds: number
): Promise<QuestionOut | { questionId: string; status: 'pending' }> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let consecutiveFailures = 0;

  while (Date.now() < deadline) {
    try {
      const question = await client.getQuestion(questionId);
      consecutiveFailures = 0;

      if (question.status !== 'pending') {
        return question;
      }
    } catch (error) {
      if (error instanceof EventPopperClientError && error.isTransient) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(
            chalk.red(
              `Server unreachable after ${MAX_CONSECUTIVE_FAILURES} attempts. Question ID: ${questionId}`
            )
          );
          return { questionId, status: 'pending' };
        }
        console.error(
          chalk.yellow(
            `Connection error (attempt ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}), retrying...`
          )
        );
      } else {
        throw error;
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }

  // Timeout (AC-06)
  return { questionId, status: 'pending' };
}

// ── Helpers ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** DYK-04: Coerce string answer to correct type based on questionType */
function coerceAnswer(raw: string, questionType: string): string | boolean | string[] {
  if (questionType === 'confirm') {
    const lower = raw.toLowerCase();
    if (lower === 'true' || lower === 'yes' || lower === 'y') return true;
    if (lower === 'false' || lower === 'no' || lower === 'n') return false;
    return raw;
  }
  if (questionType === 'multi') {
    return raw.split(',').map((s) => s.trim());
  }
  return raw;
}

function formatAge(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Command Registration (AC-34: agent-oriented help) ──

const QUESTION_HELP = `
Ask questions and receive answers through the Chainglass web UI.

When an AI agent or script needs human input, it runs 'cg question ask'.
The question appears in the Chainglass web UI as a notification. The human
answers through the UI, and the CLI returns the answer as JSON.

SUBCOMMANDS:
  ask      Post a question and wait for an answer (blocks by default)
  get      Check the status of a previously asked question
  answer   Submit an answer to a question (for scripting/testing)
  list     List all questions and alerts with their status

BLOCKING BEHAVIOR:
  By default, 'cg question ask' blocks for up to 600 seconds (10 minutes),
  polling every 2 seconds until the question is answered, dismissed, or
  needs clarification. Use --timeout to change the wait duration.

  --timeout 0     Return immediately with the question ID (fire-and-forget)
  --timeout 300   Wait up to 5 minutes
  --timeout 600   Wait up to 10 minutes (default)

RESPONSE STATUSES:
  pending               Question has not been answered yet
  answered              User provided an answer (check .answer field)
  needs-clarification   User requested more information (check .clarification)
  dismissed             User dismissed without answering
  interrupted           CLI was interrupted (SIGINT) — use 'get' to check later

QUESTION TYPES:
  text      Free-text answer (default)
  single    Single choice from --options list
  multi     Multiple choices from --options list
  confirm   Yes/no boolean answer

FOLLOW-UP QUESTIONS (chaining):
  Pass --previous-question-id <id> to link a new question to a previous one.
  The UI shows linked questions as a conversation thread. Each follow-up is
  a new question with its own ID and notification.

WHEN TO USE 'cg question ask' vs 'cg alert send':
  Use 'question' when you need an answer back (blocking, two-way).
  Use 'alert' when you just want to notify (fire-and-forget, one-way).

EXAMPLES:
  cg question ask --text "Deploy to production?" --type confirm
  cg question ask --text "Which env?" --type single --options staging production
  cg question ask --text "Summarize changes" --type text --timeout 0
  cg question ask --text "More detail needed" --previous-question-id abc123
  cg question get abc123
  cg question answer abc123 --answer "yes"
  cg question list --json
`;

export function registerQuestionCommands(program: Command): void {
  const question = program
    .command('question')
    .description('Ask questions and receive answers through the Chainglass web UI')
    .addHelpText('after', QUESTION_HELP);

  question
    .command('ask')
    .description('Post a question and wait for an answer')
    .requiredOption('--text <question>', 'The question to ask')
    .option('--type <type>', 'Question type: text|single|multi|confirm', 'text')
    .option('--description <markdown>', 'Detailed context (markdown)')
    .option('--options <choices...>', 'Choice options (for single/multi types)')
    .option('--default <value>', 'Default answer value')
    .option('--timeout <seconds>', 'Timeout in seconds (0 = no wait)', String(DEFAULT_TIMEOUT))
    .option('--previous-question-id <id>', 'Link to a previous question (chaining)')
    .option('--source <name>', 'Source identifier', defaultSource('cg-question'))
    .action(
      wrapAction(async (options) => {
        const url = discoverServerUrl();
        const client = createEventPopperClient(url);
        await handleQuestionAsk(client, options);
      })
    );

  question
    .command('get <id>')
    .description('Check the status of a question')
    .action(
      wrapAction(async (id: string) => {
        const url = discoverServerUrl();
        const client = createEventPopperClient(url);
        await handleQuestionGet(client, id);
      })
    );

  question
    .command('answer <id>')
    .description('Submit an answer to a question (for scripting/testing)')
    .requiredOption('--answer <value>', 'The answer value')
    .option('--text <freeform>', 'Optional freeform commentary')
    .action(
      wrapAction(async (id: string, options) => {
        const url = discoverServerUrl();
        const client = createEventPopperClient(url);
        await handleQuestionAnswer(client, id, options);
      })
    );

  question
    .command('list')
    .description('List all questions and alerts')
    .option('--status <filter>', 'Filter by status (e.g., pending, answered)')
    .option('--limit <n>', 'Maximum items to show', '20')
    .option('--json', 'Output raw JSON')
    .action(
      wrapAction(async (options) => {
        const url = discoverServerUrl();
        const client = createEventPopperClient(url);
        await handleQuestionList(client, options);
      })
    );
}
