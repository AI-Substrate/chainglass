// @vitest-environment node
/**
 * Plan 088 Phase 5 — T008: remote-view SDK contribution (palette commands).
 *
 * Two units: the static contribution manifest (`remote-view.list/attach/detach`
 * with Zod params), and `registerRemoteViewSDK(sdk)` which binds handlers for the
 * bootstrap-safe commands (`list` + `detach` — pure fetch+toast). `attach` opens
 * the window picker via `setParams`, so its handler is page-level (registered in
 * browser-client.tsx where `setParams` lives, mirroring file-browser's
 * openRecentFeed/openFileAtLine) and is NOT registered here.
 *
 * Built against a REAL `IUSDK` assembled from the actual SDK services (no cast) +
 * a spy toast, so `commands.list`/`execute` exercise the real registry.
 */
import { remoteViewContribution } from '@/features/088-remote-view/sdk/contribution';
import { registerRemoteViewSDK } from '@/features/088-remote-view/sdk/register';
import { CommandRegistry } from '@/lib/sdk/command-registry';
import { ContextKeyService } from '@/lib/sdk/context-key-service';
import { KeybindingService } from '@/lib/sdk/keybinding-service';
import { SettingsStore } from '@/lib/sdk/settings-store';
import type { IUSDK } from '@chainglass/shared/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

function makeSdk() {
  const context = new ContextKeyService();
  const commands = new CommandRegistry(context, () => {});
  const settings = new SettingsStore();
  const keybindings = new KeybindingService(context);
  const toasts: Array<{ level: string; message: string }> = [];
  const toast = {
    success: (message: string) => {
      toasts.push({ level: 'success', message });
    },
    error: (message: string) => {
      toasts.push({ level: 'error', message });
    },
    info: (message: string) => {
      toasts.push({ level: 'info', message });
    },
    warning: (message: string) => {
      toasts.push({ level: 'warning', message });
    },
  };
  const sdk: IUSDK = { commands, settings, context, keybindings, toast };
  return { sdk, toasts };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('remote-view SDK contribution manifest (T008)', () => {
  it('declares list/attach/detach under the remote-view domain', () => {
    /*
    Test Doc:
    - Why: agents drive remote-view from the palette (AC-8 SDK half); the manifest is what surfaces the verbs.
    - Contract: remoteViewContribution.domain === 'remote-view'; commands = remote-view.{list,attach,detach}, all domain-tagged.
    - Usage Notes: pattern mirrors 041-file-browser/sdk/contribution.ts; handlers bound at register time, not here.
    - Quality Contribution: pins the palette verb set.
    - Worked Example: ids sorted → [attach, detach, list].
    */
    expect(remoteViewContribution.domain).toBe('remote-view');
    const ids = remoteViewContribution.commands.map((c) => c.id).sort();
    expect(ids).toEqual(['remote-view.attach', 'remote-view.detach', 'remote-view.list']);
    for (const c of remoteViewContribution.commands) expect(c.domain).toBe('remote-view');
  });

  it('attach accepts no args (picker) or a windowId; detach requires a sessionId', () => {
    /*
    Test Doc:
    - Why: "attach with no args opens the picker" (Workshop 001 entry); a programmatic attach passes a windowId; detach targets one session.
    - Contract: attach.params parses {} and {windowId}; detach.params parses {sessionId} but rejects {}.
    - Usage Notes: Zod params validated by the command registry before the handler runs.
    - Quality Contribution: pins the param contracts the CLI/MCP (T009/T010) mirror.
    - Worked Example: attach {} ok; attach {windowId:42} ok; detach {} rejected.
    */
    const attach = remoteViewContribution.commands.find((c) => c.id === 'remote-view.attach');
    expect(attach?.params.safeParse({}).success).toBe(true);
    expect(attach?.params.safeParse({ windowId: 42 }).success).toBe(true);
    const detach = remoteViewContribution.commands.find((c) => c.id === 'remote-view.detach');
    expect(detach?.params.safeParse({ sessionId: 'ses_1' }).success).toBe(true);
    expect(detach?.params.safeParse({}).success).toBe(false);
  });
});

describe('registerRemoteViewSDK (T008)', () => {
  it('registers the bootstrap-safe list + detach commands in the palette', () => {
    /*
    Test Doc:
    - Why: list/detach need no page refs (pure fetch+toast), so they register at bootstrap; attach is page-level (setParams).
    - Contract: after registerRemoteViewSDK(sdk), commands.list({domain:'remote-view'}) === [detach, list].
    - Usage Notes: attach is intentionally absent here — registered in browser-client.tsx.
    - Quality Contribution: pins which verbs the bootstrap path owns.
    - Worked Example: register → palette has remote-view.detach + remote-view.list.
    */
    const { sdk } = makeSdk();
    registerRemoteViewSDK(sdk);
    const ids = sdk.commands
      .list({ domain: 'remote-view' })
      .map((c) => c.id)
      .sort();
    expect(ids).toEqual(['remote-view.detach', 'remote-view.list']);
  });

  it('list → GET /sessions and toasts the active sessions', async () => {
    /*
    Test Doc:
    - Why: `remote-view list` lets an agent see live sessions (AC-8); the route returns { sessions: SessionSummary[] }.
    - Contract: execute('remote-view.list') → fetch('/api/remote-view/sessions'); a non-empty list is toasted.
    - Usage Notes: GET /sessions wraps the array as { sessions } (T005) — the handler reads .sessions.
    - Quality Contribution: pins the read verb + the wrapped-shape parse.
    - Worked Example: one Godot session → toast mentions 'Godot'.
    */
    const { sdk, toasts } = makeSdk();
    registerRemoteViewSDK(sdk);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        sessions: [
          { sessionId: 's1', windowId: 1, app: 'Godot', title: 'spike', state: 'streaming' },
        ],
      }),
    }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    await sdk.commands.execute('remote-view.list', {});
    expect(fetchMock).toHaveBeenCalledWith('/api/remote-view/sessions');
    expect(toasts.some((t) => t.message.includes('Godot'))).toBe(true);
  });

  it('detach → DELETE /sessions/<id> and toasts success', async () => {
    /*
    Test Doc:
    - Why: `remote-view detach <id>` tears down a session (AC-8); the route is DELETE /sessions/{id}.
    - Contract: execute('remote-view.detach',{sessionId}) → fetch DELETE '/api/remote-view/sessions/<id>'; success toast.
    - Usage Notes: sessionId is URL-encoded; mirrors the daemon DELETE contract proxied by T005.
    - Quality Contribution: pins the destructive verb's wiring.
    - Worked Example: detach ses_42 → DELETE /api/remote-view/sessions/ses_42 + success toast.
    */
    const { sdk, toasts } = makeSdk();
    registerRemoteViewSDK(sdk);
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    await sdk.commands.execute('remote-view.detach', { sessionId: 'ses_42' });
    expect(fetchMock).toHaveBeenCalledWith('/api/remote-view/sessions/ses_42', {
      method: 'DELETE',
    });
    expect(toasts.some((t) => t.level === 'success')).toBe(true);
  });
});
