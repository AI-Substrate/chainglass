/**
 * FileViewerPanel Component Tests
 *
 * Purpose: Verify mode toggle, save button, conflict handling, refresh, messages.
 * Acceptance Criteria: AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30
 *
 * Phase 4: File Browser — Plan 041
 * Fix FX001-7: Real viewer integration tests.
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

// Stub DiffViewer — the real one uses heavy deps that don't work in jsdom
vi.mock('@/components/viewers/diff-viewer', () => ({
  DiffViewer: ({
    diffData,
    error,
    isLoading,
  }: { diffData: string | null; error: string | null; isLoading?: boolean }) => (
    <div data-testid="diff-viewer">
      {isLoading
        ? 'Loading diff...'
        : diffData
          ? `Diff: ${diffData.slice(0, 50)}`
          : (error ?? 'No diff')}
    </div>
  ),
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

  describe('preview mode', () => {
    it('renders highlighted HTML when provided', () => {
      render(
        <FileViewerPanel
          {...baseProps}
          mode="preview"
          highlightedHtml='<pre class="shiki">const x = 1;</pre>'
        />
      );

      const wrapper = document.querySelector('.shiki-wrapper');
      expect(wrapper).not.toBeNull();
      expect(wrapper?.innerHTML).toContain('shiki');
    });

    it('renders markdown HTML via MarkdownPreview when provided', () => {
      render(
        <FileViewerPanel
          {...baseProps}
          mode="preview"
          language="markdown"
          markdownHtml="<h1>Hello</h1><p>World</p>"
        />
      );

      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('World')).toBeInTheDocument();
    });

    it('falls back to raw code when no highlightedHtml', () => {
      render(<FileViewerPanel {...baseProps} mode="preview" />);

      expect(screen.getByText(baseProps.content)).toBeInTheDocument();
    });
  });

  describe('edit mode', () => {
    it('renders CodeEditor with file content', async () => {
      render(<FileViewerPanel {...baseProps} mode="edit" editContent="edited" />);

      const editor = await screen.findByTestId('code-editor');
      expect(editor).toBeInTheDocument();
      expect(editor).toHaveTextContent('edited');
    });
  });

  describe('diff mode', () => {
    it('renders DiffViewer component', async () => {
      render(<FileViewerPanel {...baseProps} mode="diff" diffData="diff --git a/file" />);

      const viewer = await screen.findByTestId('diff-viewer');
      expect(viewer).toBeInTheDocument();
    });
  });

  describe('error states', () => {
    it('shows large file message', () => {
      render(<FileViewerPanel {...baseProps} content={null} errorType="file-too-large" />);

      expect(screen.getByText(/too large/i)).toBeInTheDocument();
    });

    it('shows binary file viewer when isBinary is true', () => {
      render(
        <FileViewerPanel
          {...baseProps}
          content={null}
          isBinary={true}
          binaryContentType="image/png"
          binarySize={1024}
          rawFileUrl="/api/workspaces/test/files/raw?file=image.png"
        />
      );

      expect(screen.getByText('Preview')).toBeInTheDocument();
    });
  });
});
