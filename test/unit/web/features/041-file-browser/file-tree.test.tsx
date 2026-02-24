/**
 * FileTree Component Tests
 *
 * Purpose: Verify file tree renders entries, handles expand/collapse,
 *          fires selection callbacks, and supports changed-only filter.
 * Acceptance Criteria: AC-21, AC-22, AC-23
 *
 * Phase 4: File Browser — Plan 041
 * DYK-P4-01: Receives entries as props, fires onExpand for lazy loading
 */

import { FileTree } from '@/features/041-file-browser/components/file-tree';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const sampleEntries = [
  { name: 'src', type: 'directory' as const, path: 'src' },
  { name: 'README.md', type: 'file' as const, path: 'README.md' },
  { name: 'package.json', type: 'file' as const, path: 'package.json' },
];

describe('FileTree', () => {
  it('renders file and directory entries', () => {
    render(
      <FileTree entries={sampleEntries} onSelect={vi.fn()} onExpand={vi.fn()} onRefresh={vi.fn()} />
    );

    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('package.json')).toBeInTheDocument();
  });

  it('fires onSelect when a file is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <FileTree
        entries={sampleEntries}
        onSelect={onSelect}
        onExpand={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    await user.click(screen.getByText('README.md'));
    expect(onSelect).toHaveBeenCalledWith('README.md');
  });

  it('fires onExpand when a directory is clicked', async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    render(
      <FileTree
        entries={sampleEntries}
        onSelect={vi.fn()}
        onExpand={onExpand}
        onRefresh={vi.fn()}
      />
    );

    await user.click(screen.getByText('src'));
    expect(onExpand).toHaveBeenCalledWith('src');
  });

  it('shows refresh button that fires onRefresh', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(
      <FileTree
        entries={sampleEntries}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        onRefresh={onRefresh}
      />
    );

    const refreshBtn = screen.getByRole('button', { name: /refresh file tree/i });
    await user.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('shows empty state when no entries', () => {
    render(<FileTree entries={[]} onSelect={vi.fn()} onExpand={vi.fn()} onRefresh={vi.fn()} />);

    expect(screen.getByText(/no files/i)).toBeInTheDocument();
  });

  it('filters entries when changedFiles provided', () => {
    render(
      <FileTree
        entries={sampleEntries}
        changedFiles={['README.md']}
        showChangedOnly={true}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        onRefresh={vi.fn()}
      />
    );

    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.queryByText('package.json')).not.toBeInTheDocument();
  });
});
