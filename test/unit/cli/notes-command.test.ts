/**
 * Notes Command — Unit Tests
 *
 * Why: Validates CLI notes subcommands (list, files, add, complete).
 * Contract: Each subcommand produces correct console and JSON output.
 * Usage Notes: Tests use DI seam — FakeNoteService injected via container factory.
 * Quality Contribution: Ensures agent/human note workflows work from terminal.
 * Worked Example: add note → list → verify in output; complete → verify status change.
 *
 * Plan 071: PR View & File Notes — Phase 3
 */

import { SHARED_DI_TOKENS } from '@chainglass/shared';
import { FakeNoteService } from '@chainglass/shared/fakes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockContext = { worktreePath: '/tmp/test-worktree', slug: 'test', name: 'Test' };
let fakeService: FakeNoteService;

// Mock workspace resolution (required — resolves from CWD or --workspace-path)
vi.mock('../../../apps/cli/src/commands/command-helpers.js', () => ({
  resolveOrOverrideContext: vi.fn(),
  noContextError: vi.fn(() => [
    {
      code: 'E074',
      message: 'No workspace context found',
      action: 'Current directory is not inside a registered workspace.',
    },
  ]),
  createOutputAdapter: vi.fn(),
  wrapAction: <T extends unknown[]>(handler: (...args: T) => Promise<void>) => handler,
}));

// Mock DI container to inject FakeNoteService via factory seam
vi.mock('../../../apps/cli/src/lib/container.js', () => ({
  createCliProductionContainer: vi.fn(() => ({
    resolve: (token: string) => {
      if (token === SHARED_DI_TOKENS.NOTE_SERVICE_FACTORY) {
        return (_worktreePath: string) => fakeService;
      }
      throw new Error(`Unexpected DI token: ${token}`);
    },
  })),
}));

import { resolveOrOverrideContext } from '../../../apps/cli/src/commands/command-helpers.js';

// Helper to capture console output
function captureOutput() {
  const logs: string[] = [];
  const errors: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
  return {
    logs,
    errors,
    restore: () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    },
    allOutput: () => logs.join('\n'),
    allErrors: () => errors.join('\n'),
  };
}

import { Command } from 'commander';
import { registerNotesCommands } from '../../../apps/cli/src/commands/notes.command.js';

function createTestProgram() {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  registerNotesCommands(program);
  return program;
}

describe('cg notes', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fakeService = new FakeNoteService();
    vi.mocked(resolveOrOverrideContext).mockResolvedValue(mockContext as never);
    // Prevent process.exit from actually exiting
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
    exitSpy.mockRestore();
    fakeService.reset();
  });

  describe('notes list', () => {
    /**
     * Why: Empty state is the first thing users see.
     * Contract: Shows "No notes found." when no notes exist.
     * Usage Notes: Default list with no filters.
     * Quality Contribution: Ensures graceful empty state.
     * Worked Example: `cg notes list` in fresh worktree → "No notes found."
     */
    it('shows empty state when no notes exist', async () => {
      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync(['node', 'cg', 'notes', 'list']);
      output.restore();

      expect(output.allOutput()).toContain('No notes found');
    });

    /**
     * Why: Core list functionality with notes present.
     * Contract: Shows note count and note content.
     * Usage Notes: Notes displayed with truncated content.
     * Quality Contribution: Proves list display works.
     * Worked Example: `cg notes list` → "2 note(s)" with file paths.
     */
    it('lists notes with count and content', async () => {
      await fakeService.addNote('/tmp/test', {
        linkType: 'file',
        target: 'src/app.ts',
        content: 'Fix auth bug',
        author: 'human',
      });
      await fakeService.addNote('/tmp/test', {
        linkType: 'file',
        target: 'src/index.ts',
        content: 'Add tests',
        author: 'agent',
      });

      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync(['node', 'cg', 'notes', 'list']);
      output.restore();

      expect(output.allOutput()).toContain('2 note(s)');
      expect(output.allOutput()).toContain('src/app.ts');
      expect(output.allOutput()).toContain('Fix auth bug');
    });

    /**
     * Why: File filter is the most common query pattern for agents.
     * Contract: --file filters to specific target.
     * Usage Notes: `cg notes list --file src/app.ts`
     * Quality Contribution: Ensures agents can query per-file notes.
     * Worked Example: 2 notes on different files → --file shows only 1.
     */
    it('filters by --file', async () => {
      await fakeService.addNote('/tmp/test', {
        linkType: 'file',
        target: 'src/app.ts',
        content: 'Fix this',
        author: 'human',
      });
      await fakeService.addNote('/tmp/test', {
        linkType: 'file',
        target: 'src/other.ts',
        content: 'Not this',
        author: 'human',
      });

      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync(['node', 'cg', 'notes', 'list', '--file', 'src/app.ts']);
      output.restore();

      expect(output.allOutput()).toContain('1 note(s)');
      expect(output.allOutput()).toContain('Fix this');
      expect(output.allOutput()).not.toContain('Not this');
    });

    /**
     * Why: JSON mode is the primary agent consumption interface.
     * Contract: Outputs structured JSON with errors, notes, count.
     * Usage Notes: `cg notes list --json`
     * Quality Contribution: Machine-readable output for agents.
     * Worked Example: `cg notes list --json` → `{"errors":[],"notes":[...],"count":1}`
     */
    it('outputs JSON with --json flag', async () => {
      await fakeService.addNote('/tmp/test', {
        linkType: 'file',
        target: 'src/app.ts',
        content: 'Review',
        author: 'human',
        to: 'agent',
      });

      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync(['node', 'cg', 'notes', 'list', '--json']);
      output.restore();

      const parsed = JSON.parse(output.allOutput());
      expect(parsed.errors).toEqual([]);
      expect(parsed.notes).toHaveLength(1);
      expect(parsed.count).toBe(1);
      expect(parsed.notes[0].target).toBe('src/app.ts');
      expect(parsed.notes[0].to).toBe('agent');
    });

    /**
     * Why: Addressee filter is critical for agent workflows.
     * Contract: --to filters notes addressed to specific audience.
     * Usage Notes: `cg notes list --to agent`
     * Quality Contribution: Agents can find notes directed to them.
     * Worked Example: human-to-agent note + human-to-human note → --to agent shows 1.
     */
    it('filters by --to', async () => {
      await fakeService.addNote('/tmp/test', {
        linkType: 'file',
        target: 'a.ts',
        content: 'For agent',
        author: 'human',
        to: 'agent',
      });
      await fakeService.addNote('/tmp/test', {
        linkType: 'file',
        target: 'b.ts',
        content: 'For human',
        author: 'agent',
        to: 'human',
      });

      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync(['node', 'cg', 'notes', 'list', '--json', '--to', 'agent']);
      output.restore();

      const parsed = JSON.parse(output.allOutput());
      expect(parsed.notes).toHaveLength(1);
      expect(parsed.notes[0].content).toBe('For agent');
    });
  });

  describe('notes files', () => {
    /**
     * Why: Files subcommand shows overview of which files have notes.
     * Contract: Shows file paths with note counts.
     * Usage Notes: `cg notes files`
     * Quality Contribution: Quick way to see where notes are.
     * Worked Example: 2 notes on a.ts, 1 on b.ts → shows both with counts.
     */
    it('lists files with note counts', async () => {
      await fakeService.addNote('/tmp/test', {
        linkType: 'file',
        target: 'src/app.ts',
        content: 'Note 1',
        author: 'human',
      });
      await fakeService.addNote('/tmp/test', {
        linkType: 'file',
        target: 'src/app.ts',
        content: 'Note 2',
        author: 'human',
      });
      await fakeService.addNote('/tmp/test', {
        linkType: 'file',
        target: 'src/index.ts',
        content: 'Note 3',
        author: 'human',
      });

      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync(['node', 'cg', 'notes', 'files']);
      output.restore();

      expect(output.allOutput()).toContain('2 file(s) with notes');
      expect(output.allOutput()).toContain('src/app.ts');
      expect(output.allOutput()).toContain('src/index.ts');
    });

    /**
     * Why: Empty state for files subcommand.
     * Contract: Shows "No files with notes." when empty.
     * Usage Notes: `cg notes files` in fresh worktree.
     * Quality Contribution: Graceful empty state.
     * Worked Example: `cg notes files` → "No files with notes."
     */
    it('shows empty state when no files have notes', async () => {
      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync(['node', 'cg', 'notes', 'files']);
      output.restore();

      expect(output.allOutput()).toContain('No files with notes');
    });

    /**
     * Why: JSON mode for files subcommand.
     * Contract: Outputs structured JSON with file paths and counts.
     * Usage Notes: `cg notes files --json`
     * Quality Contribution: Machine-readable file list.
     * Worked Example: `cg notes files --json` → `{"errors":[],"files":[...],"count":1}`
     */
    it('outputs JSON with --json flag', async () => {
      await fakeService.addNote('/tmp/test', {
        linkType: 'file',
        target: 'src/app.ts',
        content: 'Note 1',
        author: 'human',
      });

      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync(['node', 'cg', 'notes', 'files', '--json']);
      output.restore();

      const parsed = JSON.parse(output.allOutput());
      expect(parsed.errors).toEqual([]);
      expect(parsed.files).toHaveLength(1);
      expect(parsed.files[0].path).toBe('src/app.ts');
      expect(parsed.files[0].count).toBe(1);
    });
  });

  describe('notes add', () => {
    /**
     * Why: Core note creation from CLI.
     * Contract: Creates note with correct fields, prints confirmation.
     * Usage Notes: `cg notes add src/app.ts --content "Fix auth"`
     * Quality Contribution: Proves note creation works end-to-end.
     * Worked Example: add → verify note created in service.
     */
    it('creates a note with default author human', async () => {
      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync([
        'node',
        'cg',
        'notes',
        'add',
        'src/app.ts',
        '--content',
        'Fix auth',
      ]);
      output.restore();

      expect(output.allOutput()).toContain('added to');
      expect(output.allOutput()).toContain('src/app.ts');

      const notes = fakeService.getAllNotes();
      expect(notes).toHaveLength(1);
      expect(notes[0].target).toBe('src/app.ts');
      expect(notes[0].content).toBe('Fix auth');
      expect(notes[0].author).toBe('human');
    });

    /**
     * Why: Line targeting allows precise note placement.
     * Contract: --line sets targetMeta.line.
     * Usage Notes: `cg notes add src/app.ts --content "..." --line 42`
     * Quality Contribution: Proves line-level targeting.
     * Worked Example: add with --line 42 → verify targetMeta.line = 42.
     */
    it('creates a note with --line and --to', async () => {
      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync([
        'node',
        'cg',
        'notes',
        'add',
        'src/app.ts',
        '--content',
        'Fix this line',
        '--line',
        '42',
        '--to',
        'agent',
      ]);
      output.restore();

      const notes = fakeService.getAllNotes();
      expect(notes).toHaveLength(1);
      expect(notes[0].linkType).toBe('file');
      if (notes[0].linkType === 'file') {
        expect(notes[0].targetMeta?.line).toBe(42);
      }
      expect(notes[0].to).toBe('agent');
    });

    /**
     * Why: Agents need to identify themselves as author.
     * Contract: --author agent sets author field.
     * Usage Notes: `cg notes add src/app.ts --content "..." --author agent`
     * Quality Contribution: Proves agent authorship works.
     * Worked Example: add with --author agent → verify author = 'agent'.
     */
    it('supports --author agent', async () => {
      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync([
        'node',
        'cg',
        'notes',
        'add',
        'src/app.ts',
        '--content',
        'Agent note',
        '--author',
        'agent',
      ]);
      output.restore();

      const notes = fakeService.getAllNotes();
      expect(notes[0].author).toBe('agent');
    });

    /**
     * Why: JSON output for programmatic use.
     * Contract: --json outputs created note as JSON.
     * Usage Notes: `cg notes add src/app.ts --content "..." --json`
     * Quality Contribution: Machine-readable note creation.
     * Worked Example: add --json → `{"errors":[],"note":{...}}`
     */
    it('outputs JSON with --json flag', async () => {
      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync([
        'node',
        'cg',
        'notes',
        'add',
        'src/app.ts',
        '--content',
        'Test note',
        '--json',
      ]);
      output.restore();

      const parsed = JSON.parse(output.allOutput());
      expect(parsed.errors).toEqual([]);
      expect(parsed.note.target).toBe('src/app.ts');
      expect(parsed.note.content).toBe('Test note');
    });
  });

  describe('notes complete', () => {
    /**
     * Why: Completion is the core workflow for note resolution.
     * Contract: Marks note as complete, prints confirmation.
     * Usage Notes: `cg notes complete <id>`
     * Quality Contribution: Proves completion workflow.
     * Worked Example: add → complete → verify status changed.
     */
    it('marks a note as complete', async () => {
      const added = await fakeService.addNote('/tmp/test', {
        linkType: 'file',
        target: 'src/app.ts',
        content: 'Fix this',
        author: 'human',
      });
      if (!added.ok) throw new Error('addNote failed');

      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync(['node', 'cg', 'notes', 'complete', added.data.id]);
      output.restore();

      expect(output.allOutput()).toContain('marked as complete');

      const notes = fakeService.getAllNotes();
      expect(notes[0].status).toBe('complete');
      expect(notes[0].completedBy).toBe('human');
    });

    /**
     * Why: Error handling for invalid note IDs.
     * Contract: Shows error when note not found, exits with code 1.
     * Usage Notes: `cg notes complete nonexistent-id`
     * Quality Contribution: Graceful error for bad IDs.
     * Worked Example: complete nonexistent → error message + exit 1.
     */
    it('shows error for non-existent note', async () => {
      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync(['node', 'cg', 'notes', 'complete', 'nonexistent']);
      output.restore();

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    /**
     * Why: JSON output for programmatic completion.
     * Contract: --json outputs completed note as JSON.
     * Usage Notes: `cg notes complete <id> --json`
     * Quality Contribution: Machine-readable completion response.
     * Worked Example: complete --json → `{"errors":[],"note":{status:"complete"}}`
     */
    it('outputs JSON with --json flag', async () => {
      const added = await fakeService.addNote('/tmp/test', {
        linkType: 'file',
        target: 'a.ts',
        content: 'Done',
        author: 'human',
      });
      if (!added.ok) throw new Error('addNote failed');

      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync(['node', 'cg', 'notes', 'complete', added.data.id, '--json']);
      output.restore();

      const parsed = JSON.parse(output.allOutput());
      expect(parsed.errors).toEqual([]);
      expect(parsed.note.status).toBe('complete');
      expect(parsed.note.completedBy).toBe('human');
    });
  });

  describe('workspace context', () => {
    /**
     * Why: All commands require workspace context.
     * Contract: Shows error when no workspace found.
     * Usage Notes: Running in non-workspace directory.
     * Quality Contribution: Ensures clear error messaging.
     * Worked Example: run in /tmp → "No workspace context found".
     */
    it('shows error when no workspace context', async () => {
      vi.mocked(resolveOrOverrideContext).mockResolvedValue(null);

      const output = captureOutput();
      const program = createTestProgram();
      await program.parseAsync(['node', 'cg', 'notes', 'list']);
      output.restore();

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
