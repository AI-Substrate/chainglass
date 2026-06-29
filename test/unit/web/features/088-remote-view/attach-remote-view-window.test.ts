// @vitest-environment node
/**
 * Plan 088 Phase 5 — F003 fix (companion HIGH on T008): the `remote-view.attach`
 * windowId path must not fail silently. `attachRemoteViewWindow` POSTs to
 * `/api/remote-view/sessions`; success is silent (the SSE 'attached' envelope
 * pushes the view), but any non-OK response or thrown fetch surfaces an error toast.
 */
import { attachRemoteViewWindow } from '@/features/088-remote-view/sdk/attach-remote-view-window';
import type { IUSDK } from '@chainglass/shared/sdk';
import { describe, expect, it, vi } from 'vitest';

function toastSpy() {
  const calls: Array<{ level: string; message: string }> = [];
  const toast: IUSDK['toast'] = {
    success: (message) => calls.push({ level: 'success', message }),
    error: (message) => calls.push({ level: 'error', message }),
    info: (message) => calls.push({ level: 'info', message }),
    warning: (message) => calls.push({ level: 'warning', message }),
  };
  return { calls, toast };
}

describe('attachRemoteViewWindow — no silent failure (F003)', () => {
  it('POSTs { windowId } and stays silent on success (SSE drives the push)', async () => {
    const { calls, toast } = toastSpy();
    const fetchFn = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ sessionId: 's1' }),
    }));
    await attachRemoteViewWindow(42, { toast, fetchFn: fetchFn as unknown as typeof fetch });
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/remote-view/sessions',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ windowId: 42 }) })
    );
    expect(calls).toHaveLength(0); // success is silent
  });

  it('error-toasts a non-OK response (names the route error)', async () => {
    const { calls, toast } = toastSpy();
    const fetchFn = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'E_INTERNAL', message: 'daemon down' }),
    }));
    await attachRemoteViewWindow(42, { toast, fetchFn: fetchFn as unknown as typeof fetch });
    expect(calls.some((c) => c.level === 'error' && c.message.includes('E_INTERNAL'))).toBe(true);
  });

  it('error-toasts a thrown fetch (network failure)', async () => {
    const { calls, toast } = toastSpy();
    const fetchFn = vi.fn(async () => {
      throw new Error('connection refused');
    });
    await attachRemoteViewWindow(42, { toast, fetchFn: fetchFn as unknown as typeof fetch });
    expect(calls.some((c) => c.level === 'error' && c.message.includes('refused'))).toBe(true);
  });
});
