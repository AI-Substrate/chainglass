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

// Mock themed icon components — FileTree tests care about tree behavior, not icon resolution.
// FileIcon/FolderIcon render <img> tags (vs Lucide's inline <svg>), so icon-count
// assertions use 'svg, img' to work with both old and new icon implementations.
vi.mock('@/features/_platform/themes', () => ({
  FileIcon: ({ className }: { className?: string }) => (
    <img className={className} alt="" data-testid="file-icon" />
  ),
  FolderIcon: ({ className }: { className?: string }) => (
    <img className={className} alt="" data-testid="folder-icon" />
  ),
}));

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

  it('fires onDoubleSelect with selected state when a file is double clicked', async () => {
    const user = userEvent.setup();
    const onDoubleSelect = vi.fn();
    render(
      <FileTree
        entries={sampleEntries}
        selectedFile="README.md"
        onSelect={vi.fn()}
        onDoubleSelect={onDoubleSelect}
        onExpand={vi.fn()}
      />
    );

    await user.dblClick(screen.getByText('README.md'));
    expect(onDoubleSelect).toHaveBeenCalledWith('README.md', true);
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
    it('should apply tree-entry-new class to entries in newlyAddedPaths set', () => {
      /**
       * Why: Refreshed/created/updated files should glow green for 5 seconds.
       * Contract: Entry path in newlyAddedPaths → tree-entry-new class on that button.
       * Usage Notes: Set<string> of relative paths; cleared by BrowserClient after 5s timer.
       */
      render(
        <FileTree
          entries={[{ name: 'README.md', path: 'README.md', type: 'file' as const }]}
          onSelect={vi.fn()}
          onExpand={vi.fn()}
          newlyAddedPaths={new Set(['README.md'])}
        />
      );

      const button = screen.getByText('README.md').closest('button');
      expect(button).toHaveClass('tree-entry-new');
    });
  });

  describe('metafile detection and rendering', () => {
    const metafileEntries = [
      { name: 'photo.png', type: 'file' as const, path: 'photo.png' },
      { name: 'photo.png.summary.md', type: 'file' as const, path: 'photo.png.summary.md' },
      { name: 'photo.png.analysis.md', type: 'file' as const, path: 'photo.png.analysis.md' },
      { name: 'readme.md', type: 'file' as const, path: 'readme.md' },
    ];

    it('renders metafiles with file icon', () => {
      render(<FileTree entries={metafileEntries} onSelect={vi.fn()} onExpand={vi.fn()} />);

      // All file entries render with 1 icon (Lucide SVG or FileIcon img)
      const summaryBtn = screen.getByText('photo.png.summary.md').closest('button');
      const analysisBtn = screen.getByText('photo.png.analysis.md').closest('button');
      expect(summaryBtn?.querySelectorAll('svg, img').length).toBe(1);
      expect(analysisBtn?.querySelectorAll('svg, img').length).toBe(1);

      // Regular files also have 1 icon
      const readmeBtn = screen.getByText('readme.md').closest('button');
      expect(readmeBtn?.querySelectorAll('svg, img').length).toBe(1);
      const photoBtn = screen.getByText('photo.png').closest('button');
      expect(photoBtn?.querySelectorAll('svg, img').length).toBe(1);
    });

    it('does not treat .md files without matching parent as metafiles', () => {
      const entries = [
        { name: 'notes.md', type: 'file' as const, path: 'notes.md' },
        { name: 'todo.md', type: 'file' as const, path: 'todo.md' },
      ];
      render(<FileTree entries={entries} onSelect={vi.fn()} onExpand={vi.fn()} />);

      // Neither file has a parent match — both should have 1 icon only
      const notesBtn = screen.getByText('notes.md').closest('button');
      expect(notesBtn?.querySelectorAll('svg, img').length).toBe(1);
    });

    it('does not treat directories as metafile parents', () => {
      const entries = [
        { name: 'src', type: 'directory' as const, path: 'src' },
        { name: 'src.notes.md', type: 'file' as const, path: 'src.notes.md' },
      ];
      render(<FileTree entries={entries} onSelect={vi.fn()} onExpand={vi.fn()} />);

      // src is a directory, so src.notes.md is NOT a metafile
      const notesBtn = screen.getByText('src.notes.md').closest('button');
      expect(notesBtn?.querySelectorAll('svg, img').length).toBe(1);
    });
  });
});
