/**
 * Plan 088 Phase 6 — T001 keystone backstop (companion F001).
 *
 * The keystone risk: the panel must turn the `/token` response's `daemonPort` into the real
 * `ws://127.0.0.1:<port>` Viewport url, and the Phase-3 `__REMOTE_VIEW_WS_URL__` stub must stay
 * gone. The in-browser frame DECODE is owned by the T009 live sweep (jsdom has no WebCodecs), so
 * here we stub the Viewport and assert ONLY the url composition + the daemon-unreachable branches —
 * a focused guard so a refactor can't silently reintroduce the stub or break the url.
 */
import { RemoteViewPanel } from '@/features/088-remote-view/components/remote-view-panel';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the Viewport so the panel test never touches WebCodecs/WebSocket — capture its url prop.
vi.mock('@/features/088-remote-view/components/viewport', () => ({
  Viewport: ({ url, session }: { url: string; session: string }) => (
    <div data-testid="vp-stub" data-url={url} data-session={session} />
  ),
}));
// The picker/loaders aren't under test; stub them so rv==null renders without any network.
vi.mock('@/features/088-remote-view/hooks/use-remote-view-windows', () => ({
  useRemoteViewWindows: () => ({ windows: [], loading: false, error: null, refresh: vi.fn() }),
}));
vi.mock('@/features/088-remote-view/hooks/use-remote-view-displays', () => ({
  useRemoteViewDisplays: () => ({ displays: [], loading: false, error: null, refresh: vi.fn() }),
}));
// The T004 preflight health hook isn't under test here (it has its own spec); stub it so the
// picker-mode render stays network-free and the url-composition assertions below are unaffected.
vi.mock('@/features/088-remote-view/hooks/use-remote-view-health', () => ({
  useRemoteViewHealth: () => ({ permissions: null, loading: false, error: null, refresh: vi.fn() }),
}));

const baseProps = {
  slug: 'ws',
  worktreePath: '/tmp/wt',
  onPickWindow: vi.fn(),
  onReturnToPicker: vi.fn(),
  onClose: vi.fn(),
};

/** Minimal fetch Response double — the panel only reads `.ok` + `.json()`. */
function tokenResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => body } as Response;
}

describe('RemoteViewPanel — daemon WS url composition (T001 keystone)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds ws://127.0.0.1:<daemonPort> from /token and passes it to the Viewport', async () => {
    const fetchMock = vi.fn(async () =>
      tokenResponse({ token: 't', expiresIn: 300, daemonPort: 4501 })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<RemoteViewPanel {...baseProps} rv="ses_abc" />);

    await waitFor(() => expect(screen.queryByTestId('vp-stub')).not.toBeNull());
    const vp = screen.getByTestId('vp-stub');
    expect(vp.getAttribute('data-url')).toBe('ws://127.0.0.1:4501'); // NOT the old stub / not empty
    expect(vp.getAttribute('data-session')).toBe('ses_abc');
    expect(fetchMock).toHaveBeenCalledWith('/api/remote-view/token'); // the port really came from /token
  });

  it('shows the daemon-unreachable card (no Viewport) when /token omits daemonPort', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => tokenResponse({ token: 't', expiresIn: 300 }))
    );

    render(<RemoteViewPanel {...baseProps} rv="ses_abc" />);

    await waitFor(() =>
      expect(screen.queryByTestId('remote-view-daemon-unreachable')).not.toBeNull()
    );
    expect(screen.queryByTestId('vp-stub')).toBeNull();
  });

  it('shows the daemon-unreachable card when the /token fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => tokenResponse({ error: 'nope' }, false))
    );

    render(<RemoteViewPanel {...baseProps} rv="ses_abc" />);

    await waitFor(() =>
      expect(screen.queryByTestId('remote-view-daemon-unreachable')).not.toBeNull()
    );
  });

  it('renders the picker and never fetches /token when rv is null', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<RemoteViewPanel {...baseProps} rv={null} />);

    expect(screen.queryByTestId('vp-stub')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('on HTTPS builds same-origin wss://host/<path> and does NOT fetch /token (T003)', async () => {
    // The reverse proxy bridges the path to the loopback daemon, so the client needs no daemon
    // port — and must NEVER open a mixed-content ws:// from an https page.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', {
      protocol: 'https:',
      host: 'remote.jordo.xyz',
      href: 'https://remote.jordo.xyz/',
    });

    render(<RemoteViewPanel {...baseProps} rv="ses_abc" />);

    await waitFor(() => expect(screen.queryByTestId('vp-stub')).not.toBeNull());
    expect(screen.getByTestId('vp-stub').getAttribute('data-url')).toBe(
      'wss://remote.jordo.xyz/remote-view-ws'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
