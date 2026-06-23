/**
 * Remote-view SDK registration (Plan 088 Phase 5 — T008).
 *
 * Binds handlers to the bootstrap-safe commands in the contribution manifest —
 * `list` and `detach`, which only fetch the NextAuth-gated proxy routes (T004/T005)
 * and toast the result, so they need no page refs and register at bootstrap. The
 * `attach` command opens the window picker via `setParams`, so it is registered in
 * `browser-client.tsx` (where the live closure lives), not here.
 *
 * Per ADR-0009: registerXxxSDK(sdk) pattern. Pattern: `041-file-browser/sdk/register.ts`.
 */
import type { IUSDK } from '@chainglass/shared/sdk';

import { remoteViewContribution } from './contribution';

/** Shape of `SessionSummary` for the toast — kept local so the SDK leaf needn't import the server type. */
interface RemoteViewSessionRow {
  sessionId: string;
  app: string;
  title: string;
}

export function registerRemoteViewSDK(sdk: IUSDK): void {
  for (const setting of remoteViewContribution.settings) {
    sdk.settings.contribute(setting);
  }

  const listCmd = remoteViewContribution.commands.find((c) => c.id === 'remote-view.list');
  if (listCmd) {
    sdk.commands.register({
      ...listCmd,
      handler: async () => {
        const res = await fetch('/api/remote-view/sessions');
        if (!res.ok) {
          sdk.toast.error(`Remote view: failed to list sessions (${res.status})`);
          return;
        }
        // GET /sessions returns { sessions: SessionSummary[] } (T005 — wrapped, not a bare array).
        const { sessions } = (await res.json()) as { sessions: RemoteViewSessionRow[] };
        if (sessions.length === 0) {
          sdk.toast.info('No active remote-view sessions');
          return;
        }
        const summary = sessions.map((s) => `${s.app} — ${s.title}`).join(', ');
        sdk.toast.info(`${sessions.length} remote-view session(s): ${summary}`);
      },
    });
  }

  const detachCmd = remoteViewContribution.commands.find((c) => c.id === 'remote-view.detach');
  if (detachCmd) {
    sdk.commands.register({
      ...detachCmd,
      handler: async (params: unknown) => {
        const { sessionId } = (params ?? {}) as { sessionId?: string };
        if (!sessionId) {
          sdk.toast.error('Remote view: detach requires a sessionId');
          return;
        }
        const res = await fetch(`/api/remote-view/sessions/${encodeURIComponent(sessionId)}`, {
          method: 'DELETE',
        });
        if (res.ok) sdk.toast.success(`Detached remote-view session ${sessionId}`);
        else sdk.toast.error(`Remote view: failed to detach (${res.status})`);
      },
    });
  }

  for (const binding of remoteViewContribution.keybindings) {
    sdk.keybindings.register(binding);
  }
}
