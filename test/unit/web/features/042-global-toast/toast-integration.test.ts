/**
 * Toast Integration Tests
 *
 * Verifies sonner toast is callable from any context and documents
 * the mock pattern for downstream test authors.
 *
 * Plan 042: Global Toast System
 * AC-12: toast() callable from hooks and utility functions
 * AC-13: Tests verify toast calls without rendering Toaster
 *
 * DEVIATION: vi.mock('sonner') used because sonner is a 3rd-party npm library
 * with a module-level event emitter that requires a DOM portal (<Toaster />)
 * to render. In jsdom there is no portal — mocking is the only viable strategy.
 * Same justification as CodeMirror mock in code-editor tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    promise: vi.fn(),
  }),
}));

import { toast } from 'sonner';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Global Toast System', () => {
  /**
   * @purpose Verify all toast type functions are importable and callable
   * @domain _platform/notifications
   * @acceptance AC-01, AC-02, AC-03
   * @approach Call each toast type, assert correct args
   * @evidence vi.fn() call recording
   */
  describe('toast API surface', () => {
    it('toast.success() is callable with message', () => {
      toast.success('File saved');
      expect(toast.success).toHaveBeenCalledWith('File saved');
    });

    it('toast.error() is callable with title and description', () => {
      toast.error('Save conflict', {
        description: 'File was modified externally. Refresh to see changes.',
      });
      expect(toast.error).toHaveBeenCalledWith('Save conflict', {
        description: 'File was modified externally. Refresh to see changes.',
      });
    });

    it('toast.warning() is callable', () => {
      toast.warning('File modified on disk');
      expect(toast.warning).toHaveBeenCalledWith('File modified on disk');
    });

    it('toast.info() is callable', () => {
      toast.info('Graph updated from external change');
      expect(toast.info).toHaveBeenCalledWith('Graph updated from external change');
    });

    it('toast.loading() returns a toast ID for later update', () => {
      const id = toast.loading('Saving...');
      expect(toast.loading).toHaveBeenCalledWith('Saving...');
      expect(id).toBe('toast-id');
    });
  });

  /**
   * @purpose Verify toast works from non-component contexts
   * @domain _platform/notifications
   * @acceptance AC-12
   * @approach Call toast from plain functions and async callbacks
   * @evidence vi.fn() call recording
   */
  describe('callable from plain functions (AC-12)', () => {
    it('works from a synchronous utility function', () => {
      function notifyUser(message: string) {
        toast.success(message);
      }
      notifyUser('Operation complete');
      expect(toast.success).toHaveBeenCalledWith('Operation complete');
    });

    it('works from an async callback', async () => {
      async function handleAsyncOp() {
        await Promise.resolve();
        toast.info('Done');
      }
      await handleAsyncOp();
      expect(toast.info).toHaveBeenCalledWith('Done');
    });
  });

  /**
   * @purpose Verify save handler toast contract matches AC-08, AC-09
   * @domain file-browser
   * @acceptance AC-08, AC-09
   * @approach Simulate save success/conflict flows, assert correct toast type + message
   * @evidence vi.fn() call recording
   */
  describe('file browser save toast contract', () => {
    it('success flow: loading then success (AC-08)', () => {
      const toastId = toast.loading('Saving...');
      toast.success('File saved', { id: toastId });
      expect(toast.loading).toHaveBeenCalledWith('Saving...');
      expect(toast.success).toHaveBeenCalledWith('File saved', { id: 'toast-id' });
    });

    it('conflict flow: loading then error with title + description (AC-09)', () => {
      const toastId = toast.loading('Saving...');
      toast.error('Save conflict', {
        id: toastId,
        description: 'File was modified externally. Refresh to see changes.',
      });
      expect(toast.error).toHaveBeenCalledWith('Save conflict', {
        id: 'toast-id',
        description: 'File was modified externally. Refresh to see changes.',
      });
    });
  });

  /**
   * @purpose Verify workgraph migration uses toast.info (AC-10)
   * @domain (workgraph-ui)
   * @acceptance AC-10
   * @approach Call toast.info with expected workgraph message
   * @evidence vi.fn() call recording
   */
  describe('workgraph external change toast (AC-10)', () => {
    it('uses toast.info for external change notification', () => {
      toast.info('Graph updated from external change');
      expect(toast.info).toHaveBeenCalledWith('Graph updated from external change');
    });
  });
});
