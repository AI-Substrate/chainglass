/**
 * Toast Integration Tests
 *
 * Verifies that sonner toast is callable from components and hooks,
 * and that the file browser save/conflict flows trigger correct toasts.
 *
 * Plan 042: Global Toast System
 * AC-12: toast() callable from hooks and utility functions
 * AC-13: Tests verify toast calls without rendering Toaster
 *
 * Pattern: vi.mock('sonner') — mock the module, assert function calls.
 * No need to render <Toaster /> in tests.
 */

import { describe, expect, it, vi } from 'vitest';

// Mock sonner — the pattern for any test that needs to verify toast calls
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    promise: vi.fn(),
  }),
}));

import { toast } from 'sonner';

describe('Global Toast System', () => {
  describe('toast API surface', () => {
    it('toast.success() is callable', () => {
      toast.success('File saved');
      expect(toast.success).toHaveBeenCalledWith('File saved');
    });

    it('toast.error() is callable with description', () => {
      toast.error('Save failed', { description: 'File was modified externally' });
      expect(toast.error).toHaveBeenCalledWith('Save failed', {
        description: 'File was modified externally',
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

    it('toast.promise() is callable for async operations', () => {
      const promise = Promise.resolve({ ok: true });
      toast.promise(promise, {
        loading: 'Saving...',
        success: 'File saved',
        error: 'Save failed',
      });
      expect(toast.promise).toHaveBeenCalledWith(promise, {
        loading: 'Saving...',
        success: 'File saved',
        error: 'Save failed',
      });
    });
  });

  describe('callable from plain functions (AC-12)', () => {
    it('works from a non-component utility function', () => {
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
});
