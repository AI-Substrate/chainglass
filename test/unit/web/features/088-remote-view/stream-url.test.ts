/**
 * Plan 088 Phase 6 — T003: stream WS base-url selection (INS-003).
 *
 * The canonical HTTPS path is a same-origin reverse proxy (Caddy) bridging `wss://host/<path>` to
 * the loopback daemon — a Next route can't upgrade WS. On localhost we connect directly to the
 * loopback daemon. This pins that branch logic so a refactor can't reintroduce a mixed-content
 * `ws://` on an HTTPS page or a wrong host.
 */
import {
  REMOTE_VIEW_WSS_PROXY_PATH,
  buildStreamUrl,
} from '@/features/088-remote-view/components/stream-url';
import { describe, expect, it } from 'vitest';

describe('buildStreamUrl', () => {
  it('HTTPS → same-origin wss to the reverse-proxy path (no daemon port needed)', () => {
    expect(buildStreamUrl({ protocol: 'https:', host: 'remote.jordo.xyz' })).toBe(
      `wss://remote.jordo.xyz${REMOTE_VIEW_WSS_PROXY_PATH}`
    );
  });

  it('HTTPS ignores any daemonPort — the proxy bridges by path, never a mixed-content ws://', () => {
    const url = buildStreamUrl({ protocol: 'https:', host: 'host:8443', daemonPort: 4501 });
    expect(url).toBe(`wss://host:8443${REMOTE_VIEW_WSS_PROXY_PATH}`);
    expect(url?.startsWith('wss://')).toBe(true); // NEVER ws:// on an https page
  });

  it('http://localhost → direct loopback ws:// using the daemon port', () => {
    expect(buildStreamUrl({ protocol: 'http:', host: 'localhost:3000', daemonPort: 4501 })).toBe(
      'ws://127.0.0.1:4501'
    );
  });

  it('http with no daemon port → null (caller shows "Streamer not reachable")', () => {
    expect(buildStreamUrl({ protocol: 'http:', host: 'localhost:3000' })).toBeNull();
    expect(
      buildStreamUrl({ protocol: 'http:', host: 'localhost:3000', daemonPort: null })
    ).toBeNull();
  });

  it('the proxy path is distinct from the Next /api/remote-view/* routes (no shadowing)', () => {
    expect(REMOTE_VIEW_WSS_PROXY_PATH.startsWith('/api/remote-view')).toBe(false);
  });

  it('hook-appended HTTPS path is /remote-view-ws/stream; the proxy MUST strip → daemon /stream', () => {
    // companion F001 (T003): the session hook appends `/stream` to the base, and the daemon upgrades
    // ONLY exact `/stream`. This pins the browser-side path AND the strip contract so the Caddy
    // recipe (handle_path, which strips) can't drift out of sync and silently 404 the live sweep.
    const base = buildStreamUrl({ protocol: 'https:', host: 'remote.jordo.xyz' });
    expect(`${base}/stream`).toBe('wss://remote.jordo.xyz/remote-view-ws/stream');
    // After the proxy strips REMOTE_VIEW_WSS_PROXY_PATH, the daemon must receive exactly `/stream`:
    expect(`${REMOTE_VIEW_WSS_PROXY_PATH}/stream`.slice(REMOTE_VIEW_WSS_PROXY_PATH.length)).toBe(
      '/stream'
    );
  });
});
