import { InlineEditInput } from '@/features/041-file-browser/components/inline-edit-input';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Mock themed icon components — FileTree CRUD tests care about edit behavior, not icon resolution.
vi.mock('@/features/_platform/themes', () => ({
  FileIcon: ({ className }: { className?: string }) => (
    <img className={className} alt="" data-testid="file-icon" />
  ),
  FolderIcon: ({ className }: { className?: string }) => (
    <img className={className} alt="" data-testid="folder-icon" />
  ),
}));

describe('InlineEditInput', () => {
  /*
   * Test Doc:
   * - Why: Core contract — input must be visible and ready for typing on mount
   * - Contract: Auto-focuses via requestAnimationFrame (DYK-P2-01)
   * - Usage Notes: Used by both create mode (empty input) and rename mode (pre-filled)
   * - Quality Contribution: Verifies the foundation all other interactions depend on
   * - Worked Example: Mount with no initialValue, expect input focused after rAF tick
   */
  it('renders an input that receives focus on mount', async () => {
    const calls: string[] = [];
    render(
      <InlineEditInput onConfirm={(v) => calls.push(v)} onCancel={() => calls.push('cancel')} />
    );

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();

    await vi.waitFor(() => {
      expect(input).toHaveFocus();
    });
  });

  /*
   * Test Doc:
   * - Why: Primary confirm path — Enter submits the valid name
   * - Contract: onConfirm called with trimmed value on Enter
   * - Usage Notes: Invalid names block confirm; only valid names reach the callback
   * - Quality Contribution: Ensures the happy path from typing to commit works end-to-end
   * - Worked Example: Type "new-file.ts" + Enter → onConfirm receives "new-file.ts"
   */
  it('calls onConfirm with value when Enter is pressed', async () => {
    const user = userEvent.setup();
    const confirmed: string[] = [];
    render(<InlineEditInput onConfirm={(v) => confirmed.push(v)} onCancel={() => {}} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'new-file.ts{Enter}');

    expect(confirmed).toEqual(['new-file.ts']);
  });

  /*
   * Test Doc:
   * - Why: Primary cancel path — Escape discards without side effects
   * - Contract: onCancel called on Escape, onConfirm not called
   * - Usage Notes: Works in both create and rename mode
   * - Quality Contribution: Verifies cancel is clean with no accidental commits
   * - Worked Example: Type partial name + Escape → onCancel fires, no confirm
   */
  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    render(
      <InlineEditInput
        onConfirm={() => calls.push('confirm')}
        onCancel={() => calls.push('cancel')}
      />
    );

    const input = screen.getByRole('textbox');
    await user.type(input, 'partial{Escape}');

    expect(calls).toEqual(['cancel']);
  });

  /*
   * Test Doc:
   * - Why: Client-side validation prevents invalid names from reaching server
   * - Contract: Invalid chars show inline error, Enter does not fire onConfirm
   * - Usage Notes: Uses validateFileName from Phase 1 for git-portable validation
   * - Quality Contribution: Prevents bad filenames at the UI layer before server round-trip
   * - Worked Example: Type "bad:name" + Enter → error displayed, onConfirm not called
   */
  it('shows error for invalid filename and blocks confirm', async () => {
    const user = userEvent.setup();
    const confirmed: string[] = [];
    render(<InlineEditInput onConfirm={(v) => confirmed.push(v)} onCancel={() => {}} />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'bad:name{Enter}');

    expect(screen.getByText(/not allowed/)).toBeInTheDocument();
    expect(confirmed).toEqual([]);
  });

  /*
   * Test Doc:
   * - Why: Blur behavior differs for create (cancel) vs rename (commit) — DYK-P2-03
   * - Contract: Default commitOnBlur=false means blur cancels
   * - Usage Notes: Create mode passes commitOnBlur=false, rename passes true
   * - Quality Contribution: Verifies the safe default prevents accidental file creation on misclick
   * - Worked Example: Type name + blur → onCancel fires (not onConfirm)
   */
  it('cancels on blur when commitOnBlur is false (default)', () => {
    const calls: string[] = [];
    render(
      <InlineEditInput
        onConfirm={() => calls.push('confirm')}
        onCancel={() => calls.push('cancel')}
      />
    );

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'test.txt' } });
    fireEvent.blur(input);

    expect(calls).toEqual(['cancel']);
  });
});

// --- FileTree CRUD UI tests (FT-002) ---

import { DeleteConfirmationDialog } from '@/features/041-file-browser/components/delete-confirmation-dialog';
import { FileTree } from '@/features/041-file-browser/components/file-tree';

const sampleEntries = [
  { name: 'src', type: 'directory' as const, path: 'src' },
  { name: 'README.md', type: 'file' as const, path: 'README.md' },
];

describe('FileTree CRUD UI', () => {
  /*
   * Test Doc:
   * - Why: Root row must appear when CRUD callbacks exist for root-level creation
   * - Contract: Root row with "." label renders when onCreateFile is provided
   * - Usage Notes: Root row is hidden when no CRUD callbacks exist (backward-compatible)
   * - Quality Contribution: Verifies DYK-P2-02 root-level creation support
   * - Worked Example: Mount FileTree with onCreateFile → root row visible
   */
  it('shows root row when CRUD callbacks are provided', () => {
    render(
      <FileTree
        entries={sampleEntries}
        onSelect={() => {}}
        onExpand={() => {}}
        onCreateFile={() => {}}
      />
    );

    expect(screen.getByText('.')).toBeInTheDocument();
    expect(screen.getByLabelText('New file at root')).toBeInTheDocument();
  });

  /*
   * Test Doc:
   * - Why: Mutation UI must not appear without callbacks (backward-compatible)
   * - Contract: Root row absent when no CRUD callbacks provided
   * - Usage Notes: Existing FileTree consumers see zero visual changes
   * - Quality Contribution: Regression guard for backward compatibility (T008)
   * - Worked Example: Mount FileTree without callbacks → no root row
   */
  it('hides root row when no CRUD callbacks are provided', () => {
    render(<FileTree entries={sampleEntries} onSelect={() => {}} onExpand={() => {}} />);

    expect(screen.queryByText('.')).not.toBeInTheDocument();
  });

  /*
   * Test Doc:
   * - Why: F2/Enter must not trigger rename when pressed on action buttons
   * - Contract: data-tree-action buttons are excluded from keyboard rename target resolution
   * - Usage Notes: FT-001 fix — prevents hover button Enter from opening rename mode
   * - Quality Contribution: Prevents the real bug where Enter on hover buttons fires rename
   * - Worked Example: Focus on action button, press Enter → onRename not called
   */
  it('does not start rename when Enter is pressed on an action button', async () => {
    const user = userEvent.setup();
    const renames: string[] = [];
    render(
      <FileTree
        entries={sampleEntries}
        onSelect={() => {}}
        onExpand={() => {}}
        onRename={(path) => renames.push(path)}
      />
    );

    const refreshBtn = screen.getByLabelText('Refresh src');
    await user.click(refreshBtn);
    fireEvent.keyDown(refreshBtn, { key: 'Enter' });

    expect(renames).toEqual([]);
  });
});

describe('DeleteConfirmationDialog', () => {
  /*
   * Test Doc:
   * - Why: File deletion dialog must show correct prompt without recursive warning
   * - Contract: Files show "Delete 'name'?", folders show "and all its contents"
   * - Usage Notes: VS Code-style confirmation (DYK-02)
   * - Quality Contribution: Verifies both dialog variants render correct messaging
   * - Worked Example: Open dialog for file → "Delete 'README.md'?"
   */
  it('shows file-specific message for files and folder-specific for directories', () => {
    const { rerender } = render(
      <DeleteConfirmationDialog
        open={true}
        onOpenChange={() => {}}
        itemName="README.md"
        itemType="file"
        onConfirm={() => {}}
      />
    );

    expect(screen.getByText(/Delete "README.md"\?/)).toBeInTheDocument();
    expect(screen.queryByText(/all its contents/)).not.toBeInTheDocument();

    rerender(
      <DeleteConfirmationDialog
        open={true}
        onOpenChange={() => {}}
        itemName="src"
        itemType="directory"
        onConfirm={() => {}}
      />
    );

    expect(screen.getByText(/all its contents/)).toBeInTheDocument();
  });

  /*
   * Test Doc:
   * - Why: Confirm button must fire onConfirm callback
   * - Contract: Clicking Delete button calls onConfirm once
   * - Usage Notes: Phase 3 wires onConfirm to the deleteItem server action
   * - Quality Contribution: Verifies the critical confirm path works
   * - Worked Example: Open dialog, click Delete → onConfirm fires
   */
  it('fires onConfirm when Delete button is clicked', async () => {
    const user = userEvent.setup();
    const confirmed: boolean[] = [];
    render(
      <DeleteConfirmationDialog
        open={true}
        onOpenChange={() => {}}
        itemName="test.txt"
        itemType="file"
        onConfirm={() => confirmed.push(true)}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirmed).toEqual([true]);
  });
});
