/**
 * FileViewerPanel Component Tests
 *
 * Purpose: Verify mode toggle, save button, conflict handling, refresh, messages.
 * Acceptance Criteria: AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30
 *
 * Phase 4: File Browser — Plan 041
 */

import { FileViewerPanel } from '@/features/041-file-browser/components/file-viewer-panel';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Stub CodeMirror for jsdom
vi.mock('@uiw/react-codemirror', () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => <div data-testid="code-editor">{value}</div>,
}));

describe('FileViewerPanel', () => {
  const baseProps = {
    filePath: 'src/index.ts',
    content: 'export const x = 1;',
    language: 'typescript',
    mtime: '2026-02-24T00:00:00Z',
    mode: 'preview' as const,
    onModeChange: vi.fn(),
    onSave: vi.fn(),
    onRefresh: vi.fn(),
  };

  describe('mode toggle', () => {
    it('renders Edit, Preview, and Diff mode buttons', () => {
      render(<FileViewerPanel {...baseProps} />);

      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /diff/i })).toBeInTheDocument();
    });

    it('fires onModeChange when mode button clicked', async () => {
      const user = userEvent.setup();
      const onModeChange = vi.fn();
      render(<FileViewerPanel {...baseProps} onModeChange={onModeChange} />);

      await user.click(screen.getByRole('button', { name: /edit/i }));
      expect(onModeChange).toHaveBeenCalledWith('edit');
    });
  });

  describe('save', () => {
    it('shows save button in edit mode', () => {
      render(<FileViewerPanel {...baseProps} mode="edit" />);

      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });

    it('hides save button in preview mode', () => {
      render(<FileViewerPanel {...baseProps} mode="preview" />);

      expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    });

    it('shows conflict error when provided', () => {
      render(<FileViewerPanel {...baseProps} mode="edit" conflictError="File changed on disk" />);

      expect(screen.getByText(/conflict/i)).toBeInTheDocument();
    });
  });

  describe('refresh', () => {
    it('shows refresh button', () => {
      render(<FileViewerPanel {...baseProps} />);

      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
    });
  });

  describe('error states', () => {
    it('shows large file message', () => {
      render(<FileViewerPanel {...baseProps} content={null} errorType="file-too-large" />);

      expect(screen.getByText(/too large/i)).toBeInTheDocument();
    });

    it('shows binary file message', () => {
      render(<FileViewerPanel {...baseProps} content={null} errorType="binary-file" />);

      expect(screen.getByText('Binary file')).toBeInTheDocument();
    });
  });
});
