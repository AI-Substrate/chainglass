/**
 * Notes CLI Commands — `cg notes`
 *
 * Subcommands: list, files, add, complete.
 * Primary interface for agent-driven note workflows.
 *
 * Plan 071: PR View & File Notes — Phase 3
 */

import { SHARED_DI_TOKENS } from '@chainglass/shared';
import type { Note, NoteFilter } from '@chainglass/shared/file-notes';
import { isNoteAddressee, isNoteAuthor, isNoteLinkType } from '@chainglass/shared/file-notes';
import type { INoteService } from '@chainglass/shared/interfaces';
import chalk from 'chalk';
import type { Command } from 'commander';
import { createCliProductionContainer } from '../lib/container.js';
import { noContextError, resolveOrOverrideContext, wrapAction } from './command-helpers.js';

// ── Types ──

interface ListOptions {
  json?: boolean;
  workspacePath?: string;
  file?: string;
  status?: string;
  to?: string;
  linkType?: string;
}

interface FilesOptions {
  json?: boolean;
  workspacePath?: string;
}

interface AddOptions {
  json?: boolean;
  workspacePath?: string;
  content: string;
  line?: string;
  to?: string;
  author?: string;
}

interface CompleteOptions {
  json?: boolean;
  workspacePath?: string;
  by?: string;
}

// ── Helpers ──

function truncate(text: string, maxLen: number): string {
  const oneLine = text.replace(/\n/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}

function formatNoteConsole(note: Note): string {
  const status = note.status === 'complete' ? chalk.green('✓') : chalk.yellow('○');
  const to = note.to ? chalk.dim(` → ${note.to}`) : '';
  const line =
    note.linkType === 'file' && note.targetMeta?.line ? chalk.dim(`:${note.targetMeta.line}`) : '';
  const content = truncate(note.content, 80);
  return `  ${status} ${chalk.cyan(note.id.slice(0, 8))}  ${chalk.white(note.target)}${line}${to}\n    ${content}`;
}

function jsonOutput(data: Record<string, unknown>): void {
  console.log(JSON.stringify(data, null, 2));
}

function errorOutput(
  json: boolean,
  errors: { code: string; message: string; action: string }[]
): void {
  if (json) {
    jsonOutput({ errors, notes: [], count: 0 });
  } else {
    for (const err of errors) {
      console.error(`${chalk.red('✗')} ${err.message} [${err.code}]`);
      console.error(`  ${err.action}`);
    }
  }
  process.exit(1);
}

async function resolveNoteService(workspacePath?: string, json = false) {
  const context = await resolveOrOverrideContext(workspacePath);
  if (!context) {
    errorOutput(json, noContextError(workspacePath));
    return null; // unreachable after process.exit
  }
  const container = createCliProductionContainer();
  const factory = container.resolve<(path: string) => INoteService>(
    SHARED_DI_TOKENS.NOTE_SERVICE_FACTORY
  );
  return {
    service: factory(context.worktreePath),
    worktreePath: context.worktreePath,
  };
}

// ── Handlers ──

async function handleNotesList(options: ListOptions): Promise<void> {
  const resolved = await resolveNoteService(options.workspacePath, options.json);
  if (!resolved) return;
  const { service, worktreePath } = resolved;

  const filter: NoteFilter = {};
  if (options.file) filter.target = options.file;
  if (options.status) filter.status = options.status as NoteFilter['status'];
  if (options.to) {
    if (!isNoteAddressee(options.to)) {
      errorOutput(options.json ?? false, [
        {
          code: 'E075',
          message: `Invalid --to value: ${options.to}`,
          action: 'Valid values: human, agent',
        },
      ]);
      return;
    }
    filter.to = options.to;
  }
  if (options.linkType) {
    if (!isNoteLinkType(options.linkType)) {
      errorOutput(options.json ?? false, [
        {
          code: 'E075',
          message: `Invalid --link-type value: ${options.linkType}`,
          action: 'Valid values: file, workflow, agent-run',
        },
      ]);
      return;
    }
    filter.linkType = options.linkType;
  }

  const result = await service.listNotes(worktreePath, filter);
  if (!result.ok) {
    errorOutput(options.json ?? false, [
      {
        code: 'E076',
        message: result.error,
        action: 'Check that the worktree path is valid',
      },
    ]);
    return;
  }

  if (options.json) {
    jsonOutput({ errors: [], notes: result.data, count: result.data.length });
    return;
  }

  if (result.data.length === 0) {
    console.log(chalk.dim('No notes found.'));
    return;
  }

  console.log(chalk.bold(`${result.data.length} note(s)\n`));
  for (const note of result.data) {
    console.log(formatNoteConsole(note));
  }
}

async function handleNotesFiles(options: FilesOptions): Promise<void> {
  const resolved = await resolveNoteService(options.workspacePath, options.json);
  if (!resolved) return;
  const { service, worktreePath } = resolved;

  const result = await service.listFilesWithNotes(worktreePath);
  if (!result.ok) {
    errorOutput(options.json ?? false, [
      {
        code: 'E076',
        message: result.error,
        action: 'Check that the worktree path is valid',
      },
    ]);
    return;
  }

  if (options.json) {
    // Count notes per file for JSON output
    const listResult = await service.listNotes(worktreePath, {
      status: 'open',
      linkType: 'file',
    });
    const counts = new Map<string, number>();
    if (listResult.ok) {
      for (const note of listResult.data) {
        counts.set(note.target, (counts.get(note.target) ?? 0) + 1);
      }
    }
    const files = result.data.map((path) => ({ path, count: counts.get(path) ?? 0 }));
    jsonOutput({ errors: [], files, count: files.length });
    return;
  }

  if (result.data.length === 0) {
    console.log(chalk.dim('No files with notes.'));
    return;
  }

  // Count notes per file for display
  const listResult = await service.listNotes(worktreePath, {
    status: 'open',
    linkType: 'file',
  });
  const counts = new Map<string, number>();
  if (listResult.ok) {
    for (const note of listResult.data) {
      counts.set(note.target, (counts.get(note.target) ?? 0) + 1);
    }
  }

  console.log(chalk.bold(`${result.data.length} file(s) with notes\n`));
  for (const filePath of result.data) {
    const count = counts.get(filePath) ?? 0;
    console.log(
      `  ${chalk.cyan(filePath)}  ${chalk.dim(`(${count} note${count !== 1 ? 's' : ''})`)}`
    );
  }
}

async function handleNotesAdd(file: string, options: AddOptions): Promise<void> {
  const resolved = await resolveNoteService(options.workspacePath, options.json);
  if (!resolved) return;
  const { service, worktreePath } = resolved;

  const author = options.author ?? 'human';
  if (!isNoteAuthor(author)) {
    errorOutput(options.json ?? false, [
      {
        code: 'E075',
        message: `Invalid --author value: ${author}`,
        action: 'Valid values: human, agent',
      },
    ]);
    return;
  }

  if (options.to && !isNoteAddressee(options.to)) {
    errorOutput(options.json ?? false, [
      {
        code: 'E075',
        message: `Invalid --to value: ${options.to}`,
        action: 'Valid values: human, agent',
      },
    ]);
    return;
  }

  const line = options.line ? Number.parseInt(options.line, 10) : undefined;
  if (options.line && (Number.isNaN(line) || (line !== undefined && line < 1))) {
    errorOutput(options.json ?? false, [
      {
        code: 'E075',
        message: `Invalid --line value: ${options.line}`,
        action: 'Line number must be a positive integer',
      },
    ]);
    return;
  }

  const result = await service.addNote(worktreePath, {
    linkType: 'file',
    target: file,
    content: options.content,
    author,
    to: options.to as 'human' | 'agent' | undefined,
    targetMeta: line ? { line } : undefined,
  });

  if (!result.ok) {
    errorOutput(options.json ?? false, [
      {
        code: 'E076',
        message: result.error,
        action: 'Check that the worktree path is writable',
      },
    ]);
    return;
  }

  if (options.json) {
    jsonOutput({ errors: [], note: result.data });
    return;
  }

  const lineStr = line ? `:${line}` : '';
  console.log(
    `${chalk.green('✓')} Note ${chalk.cyan(result.data.id.slice(0, 8))} added to ${chalk.white(file)}${chalk.dim(lineStr)}`
  );
}

async function handleNotesComplete(id: string, options: CompleteOptions): Promise<void> {
  const resolved = await resolveNoteService(options.workspacePath, options.json);
  if (!resolved) return;
  const { service, worktreePath } = resolved;

  const completedBy = options.by ?? 'human';
  if (!isNoteAuthor(completedBy)) {
    errorOutput(options.json ?? false, [
      {
        code: 'E075',
        message: `Invalid --by value: ${completedBy}`,
        action: 'Valid values: human, agent',
      },
    ]);
    return;
  }

  const result = await service.completeNote(worktreePath, id, completedBy);
  if (!result.ok) {
    if (options.json) {
      jsonOutput({ errors: [{ code: 'E077', message: result.error }], note: null });
    } else {
      console.error(`${chalk.red('✗')} ${result.error}`);
    }
    process.exit(1);
    return;
  }

  if (options.json) {
    jsonOutput({ errors: [], note: result.data });
    return;
  }

  console.log(`${chalk.green('✓')} Note ${chalk.cyan(id.slice(0, 8))} marked as complete`);
}

// ── Registration ──

export function registerNotesCommands(program: Command): void {
  const notes = program.command('notes').description('Create, list, and manage file notes');

  notes
    .command('list')
    .description('List notes with optional filters')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace path')
    .option('--file <path>', 'Filter notes for a specific file')
    .option('--status <status>', 'Filter by status (open, complete)')
    .option('--to <addressee>', 'Filter by addressee (human, agent)')
    .option('--link-type <type>', 'Filter by link type (file, workflow, agent-run)')
    .action(
      wrapAction(async (options: ListOptions) => {
        await handleNotesList(options);
      })
    );

  notes
    .command('files')
    .description('List files that have notes')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace path')
    .action(
      wrapAction(async (options: FilesOptions) => {
        await handleNotesFiles(options);
      })
    );

  notes
    .command('add <file>')
    .description('Add a note to a file')
    .requiredOption('--content <text>', 'Note content (markdown)')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace path')
    .option('--line <number>', 'Line number to attach note to')
    .option('--to <addressee>', 'Addressee (human, agent)')
    .option('--author <author>', 'Author type (human, agent)', 'human')
    .action(
      wrapAction(async (file: string, options: AddOptions) => {
        await handleNotesAdd(file, options);
      })
    );

  notes
    .command('complete <id>')
    .description('Mark a note as complete')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace path')
    .option('--by <actor>', 'Completed by (human, agent)', 'human')
    .action(
      wrapAction(async (id: string, options: CompleteOptions) => {
        await handleNotesComplete(id, options);
      })
    );
}
