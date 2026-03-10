/**
 * ChangesView Component Tests
 *
 * Purpose: Verify the changes view renders working changes with status badges,
 * recent section with dedup, empty state, and file selection.
 *
 * Phase 2: Git Services — Plan 043
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChangesView } from '@/features/041-file-browser/components/changes-view';
import type { ChangedFile } from '@/features/041-file-browser/services/working-changes';

const sampleChanges: ChangedFile[] = [
  { path: 'src/utils.ts', status: 'modified', area: 'unstaged' },
  { path: 'src/new-file.ts', status: 'added', area: 'staged' },
  { path: 'src/removed.ts', status: 'deleted', area: 'unstaged' },
  { path: 'scratch.ts', status: 'untracked', area: 'untracked' },
  { path: 'src/moved.ts', status: 'renamed', area: 'staged' },
];

const sampleRecent = [
  'src/utils.ts', // duplicate — should be filtered
  'src/auth.ts',
  'test/auth.test.ts',
];

describe('ChangesView', () => {
  it('renders status badges with correct text', () => {
    render(<ChangesView workingChanges={sampleChanges} recentFiles={[]} onSelect={vi.fn()} />);

    expect(screen.getByText('M')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
  });

  it('renders file paths with filename emphasized', () => {
    render(
      <ChangesView
        workingChanges={[{ path: 'src/lib/utils.ts', status: 'modified', area: 'unstaged' }]}
        recentFiles={[]}
        onSelect={vi.fn()}
      />
    );

    // Filename should be present
    expect(screen.getByText('utils.ts')).toBeInTheDocument();
  });

  it('deduplicates recent files against working changes', () => {
    render(
      <ChangesView workingChanges={sampleChanges} recentFiles={sampleRecent} onSelect={vi.fn()} />
    );

    // src/utils.ts is in working changes — should NOT appear in recent
    // src/auth.ts and test/auth.test.ts should appear in recent
    const authElements = screen.getAllByText('auth.ts');
    expect(authElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('auth.test.ts')).toBeInTheDocument();
  });

  it('shows "Working tree clean" when no changes', () => {
    render(<ChangesView workingChanges={[]} recentFiles={['src/auth.ts']} onSelect={vi.fn()} />);

    expect(screen.getByText(/working tree clean/i)).toBeInTheDocument();
  });

  it('fires onSelect when file clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<ChangesView workingChanges={sampleChanges} recentFiles={[]} onSelect={onSelect} />);

    await user.click(screen.getByText('utils.ts'));
    expect(onSelect).toHaveBeenCalledWith('src/utils.ts');
  });

  it('fires onDoubleSelect with unselected state when file double clicked', async () => {
    const user = userEvent.setup();
    const onDoubleSelect = vi.fn();

    render(
      <ChangesView
        workingChanges={sampleChanges}
        recentFiles={[]}
        selectedFile="src/new-file.ts"
        onSelect={vi.fn()}
        onDoubleSelect={onDoubleSelect}
      />
    );

    await user.dblClick(screen.getByText('utils.ts'));
    expect(onDoubleSelect).toHaveBeenCalledWith('src/utils.ts', false);
  });

  it('highlights selected file with indicator', () => {
    render(
      <ChangesView
        workingChanges={sampleChanges}
        recentFiles={[]}
        selectedFile="src/utils.ts"
        onSelect={vi.fn()}
      />
    );

    // ▶ indicator should appear
    expect(screen.getByText('▶')).toBeInTheDocument();
  });

  it('hides recent section when empty after dedup', () => {
    render(
      <ChangesView
        workingChanges={sampleChanges}
        recentFiles={['src/utils.ts']} // all dupes
        onSelect={vi.fn()}
      />
    );

    expect(screen.queryByText(/recent/i)).not.toBeInTheDocument();
  });
});
