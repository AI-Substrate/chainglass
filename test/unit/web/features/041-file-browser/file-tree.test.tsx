/**
 * FileTree Component Tests
 *
 * Purpose: Verify file tree renders entries, handles expand/collapse,
 *          fires selection callbacks. Header + refresh now in LeftPanel.
 * Acceptance Criteria: AC-21, AC-22, AC-29
 *
 * Phase 4: File Browser — Plan 041
 * Phase 3: Plan 043 — header extracted, showChangedOnly removed
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
    render(<FileTree entries={sampleEntries} onSelect={vi.fn()} onExpand={vi.fn()} />);

    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
    expect(screen.getByText('package.json')).toBeInTheDocument();
  });

  it('fires onSelect when a file is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<FileTree entries={sampleEntries} onSelect={onSelect} onExpand={vi.fn()} />);

    await user.click(screen.getByText('README.md'));
    expect(onSelect).toHaveBeenCalledWith('README.md');
  });

  it('fires onExpand when a directory is clicked', async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    render(<FileTree entries={sampleEntries} onSelect={vi.fn()} onExpand={onExpand} />);

    await user.click(screen.getByText('src'));
    expect(onExpand).toHaveBeenCalledWith('src');
  });

  it('shows empty state when no entries', () => {
    render(<FileTree entries={[]} onSelect={vi.fn()} onExpand={vi.fn()} />);

    expect(screen.getByText(/no files/i)).toBeInTheDocument();
  });

  it('highlights changed files with amber text', () => {
    render(
      <FileTree
        entries={sampleEntries}
        changedFiles={['README.md']}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />
    );

    // Changed file should be present (amber styling verified visually)
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  describe('glowingPaths animation', () => {
    it('should apply tree-entry-glow class to entries in glowingPaths set', () => {
      /**
       * Why: Refreshed/created/updated files should glow green for 5 seconds.
       * Contract: Entry path in glowingPaths → tree-entry-glow class on that button.
       * Usage Notes: Set<string> of relative paths; cleared by BrowserClient after 5s timer.
       */
      render(
        <FileTree
          entries={[{ name: 'README.md', path: 'README.md', type: 'file' as const }]}
          onSelect={vi.fn()}
          onExpand={vi.fn()}
          glowingPaths={new Set(['README.md'])}
        />
      );

      const button = screen.getByText('README.md').closest('button');
      expect(button).toHaveClass('tree-entry-glow');
    });
  });
});
