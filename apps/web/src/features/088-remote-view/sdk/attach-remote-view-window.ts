/**
 * Attach a remote-view window from the SDK palette (Plan 088 Phase 5 — T008 / F003 fix).
 *
 * Extracted from the `remote-view.attach` page handler so the failure path is
 * unit-testable (companion HIGH F003: the inline handler ignored `res.ok`, so a
 * failed attach looked successful with no feedback). On success we stay silent —
 * the T006 SSE `attached` envelope drives the content-area push; on any failure
 * (non-OK response or a thrown fetch) we surface an SDK error toast.
 */
import type { IUSDK } from '@chainglass/shared/sdk';

export async function attachRemoteViewWindow(
  windowId: number,
  deps: { toast: IUSDK['toast']; fetchFn?: typeof fetch }
): Promise<void> {
  const fetchFn = deps.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await fetchFn('/api/remote-view/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ windowId }),
    });
  } catch (err) {
    deps.toast.error(
      `Remote view: attach failed (${err instanceof Error ? err.message : 'network error'})`
    );
    return;
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      const named = `${body.error ?? ''} ${body.message ?? ''}`.trim();
      if (named) detail = named;
    } catch {
      /* non-JSON body — keep the HTTP status */
    }
    deps.toast.error(`Remote view: attach failed (${detail})`);
  }
  // Success: silent — the SSE 'attached' envelope (T006) pushes the content area.
}
