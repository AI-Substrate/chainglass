/**
 * Plan 088 Phase 5 — T004: the daemon-control surface behind `/windows` + `/health`.
 *
 * Determinism: pure over injected deps — no child process, no fetch, no daemon. Proves the
 * `streamd --list-windows` exit-code → error-code mapping, the schema-validated catalog parse
 * (a malformed daemon must not surface as a half-typed window list), and that `health()` runs
 * the daemon handshake before reading the verdict.
 */
import {
  type DaemonControlError,
  FAKE_DAEMON_PORT,
  type RealDaemonControlDeps,
  createFakeDaemonControl,
  createRealDaemonControl,
} from '@/features/088-remote-view/server/daemon-control';
import type { DaemonHealth, DaemonInfo } from '@/features/088-remote-view/server/daemon-manager';
import { describe, expect, it, vi } from 'vitest';

const GOOD_CATALOG = JSON.stringify([
  { id: 1, app: 'Godot', title: 'game', pixelWidth: 800, pixelHeight: 656, scale: 2 },
  { id: 2, app: 'Simulator', title: 'iPhone 15', pixelWidth: 1170, pixelHeight: 2532, scale: 3 },
]);

const HEALTHY: DaemonHealth = {
  ok: true,
  daemonVersion: '1.2.3',
  protocolVersion: 1,
  permissions: { screenRecording: 'granted', accessibility: 'granted' },
};

const INFO: DaemonInfo = { daemonPort: 6001, daemonVersion: '1.2.3', protocolVersion: 1 };

function deps(over: Partial<RealDaemonControlDeps> = {}): RealDaemonControlDeps {
  return {
    ensureDaemon: vi.fn(async () => INFO),
    runWindowList: vi.fn(async () => ({ stdout: GOOD_CATALOG, exitCode: 0 })),
    fetchHealth: vi.fn(async () => HEALTHY),
    ...over,
  };
}

describe('createRealDaemonControl — listWindows()', () => {
  it('parses a valid catalog into WindowDescriptor[]', async () => {
    const control = createRealDaemonControl(deps());
    const windows = await control.listWindows();
    expect(windows).toHaveLength(2);
    expect(windows[1]).toEqual({
      id: 2,
      app: 'Simulator',
      title: 'iPhone 15',
      pixelWidth: 1170,
      pixelHeight: 2532,
      scale: 3,
    });
  });

  it('maps exit code 3 → E_PERMISSION (missing Screen Recording grant, AC-14)', async () => {
    const control = createRealDaemonControl(
      deps({ runWindowList: async () => ({ stdout: '', exitCode: 3 }) })
    );
    await expect(control.listWindows()).rejects.toMatchObject({ code: 'E_PERMISSION' });
  });

  it('maps any other non-zero exit → E_INTERNAL', async () => {
    const control = createRealDaemonControl(
      deps({ runWindowList: async () => ({ stdout: '', exitCode: 127 }) })
    );
    await expect(control.listWindows()).rejects.toMatchObject({ code: 'E_INTERNAL' });
  });

  it('rejects non-JSON stdout with E_INTERNAL (never a silent empty list)', async () => {
    const control = createRealDaemonControl(
      deps({ runWindowList: async () => ({ stdout: 'not json', exitCode: 0 }) })
    );
    await expect(control.listWindows()).rejects.toMatchObject({ code: 'E_INTERNAL' });
  });

  it('rejects a catalog that violates WindowDescriptor schema with E_INTERNAL', async () => {
    // `id` as a string is the kind of drift a daemon-version skew could produce — must not
    // surface as a half-typed window the picker then renders.
    const bad = JSON.stringify([
      { id: 'nope', app: 'X', title: 't', pixelWidth: 1, pixelHeight: 1, scale: 1 },
    ]);
    const control = createRealDaemonControl(
      deps({ runWindowList: async () => ({ stdout: bad, exitCode: 0 }) })
    );
    await expect(control.listWindows()).rejects.toMatchObject({ code: 'E_INTERNAL' });
  });

  it('returns an empty catalog as [] (no windows is not an error)', async () => {
    const control = createRealDaemonControl(
      deps({ runWindowList: async () => ({ stdout: '[]', exitCode: 0 }) })
    );
    await expect(control.listWindows()).resolves.toEqual([]);
  });
});

describe('createRealDaemonControl — health()', () => {
  it('runs ensureDaemon() BEFORE reading the verdict, then returns it', async () => {
    const order: string[] = [];
    const control = createRealDaemonControl(
      deps({
        ensureDaemon: vi.fn(async () => {
          order.push('ensure');
          return INFO;
        }),
        fetchHealth: vi.fn(async () => {
          order.push('fetch');
          return HEALTHY;
        }),
      })
    );
    await expect(control.health()).resolves.toEqual(HEALTHY);
    expect(order).toEqual(['ensure', 'fetch']); // handshake first, then health — never a stale read
  });

  it('throws E_INTERNAL when /health is unreachable after a successful ensureDaemon()', async () => {
    const control = createRealDaemonControl(deps({ fetchHealth: async () => null }));
    await expect(control.health()).rejects.toMatchObject({ code: 'E_INTERNAL' });
  });
});

describe('createRealDaemonControl — daemonPort() (T001, Phase 6)', () => {
  it('returns the loopback port read from ensureDaemon() (registry `port`, never recomputed)', async () => {
    // The `/token` route surfaces this so the browser builds `ws://127.0.0.1:<port>/stream`
    // (DL-005, kills the Phase-3 stub). The port is whatever ensureDaemon() resolved — 6001 here.
    const control = createRealDaemonControl(deps());
    await expect(control.daemonPort()).resolves.toBe(6001);
  });

  it('propagates an ensureDaemon() failure — a daemon that will not come up has no port', async () => {
    const control = createRealDaemonControl(
      deps({
        ensureDaemon: vi.fn(async () => {
          throw new Error('spawn failed');
        }),
      })
    );
    // The route swallows this into an omitted `daemonPort` (token still issued); the control
    // itself must surface the failure honestly, never a fabricated port.
    await expect(control.daemonPort()).rejects.toThrow('spawn failed');
  });
});

describe('createRealDaemonControl — bundle-installed guard (T008)', () => {
  it('listWindows() fails fast with E_BUNDLE_MISSING when the bundle is absent — before any spawn', async () => {
    const runWindowList = vi.fn(async () => ({ stdout: GOOD_CATALOG, exitCode: 0 }));
    const control = createRealDaemonControl(deps({ runWindowList, bundleInstalled: () => false }));
    await expect(control.listWindows()).rejects.toMatchObject({ code: 'E_BUNDLE_MISSING' });
    expect(runWindowList).not.toHaveBeenCalled(); // named up front, never a guessed non-zero exit
  });

  it('health() fails fast with E_BUNDLE_MISSING when the bundle is absent — before ensureDaemon()', async () => {
    const ensureDaemon = vi.fn(async () => INFO);
    const control = createRealDaemonControl(deps({ ensureDaemon, bundleInstalled: () => false }));
    await expect(control.health()).rejects.toMatchObject({ code: 'E_BUNDLE_MISSING' });
    expect(ensureDaemon).not.toHaveBeenCalled(); // /health agrees with /windows, no readiness timeout
  });

  it('daemonPort() fails fast with E_BUNDLE_MISSING when the bundle is absent', async () => {
    const control = createRealDaemonControl(deps({ bundleInstalled: () => false }));
    await expect(control.daemonPort()).rejects.toMatchObject({ code: 'E_BUNDLE_MISSING' });
  });

  it('runs normally when the bundle IS installed (predicate true)', async () => {
    const control = createRealDaemonControl(deps({ bundleInstalled: () => true }));
    await expect(control.listWindows()).resolves.toHaveLength(2);
    await expect(control.health()).resolves.toMatchObject({ ok: true });
  });

  it('omitting the predicate skips the bundle check entirely (pre-T008 back-compat)', async () => {
    const control = createRealDaemonControl(deps()); // no bundleInstalled
    await expect(control.listWindows()).resolves.toHaveLength(2);
    await expect(control.daemonPort()).resolves.toBe(6001);
  });
});

describe('createRealDaemonControl — daemonPort(windowId) (live-capture spawn)', () => {
  it('passes the window through to ensureDaemon so the daemon spawns CAPTURING it', async () => {
    // The daemon is one-window-per-spawn; `/token?windowId=` must reach the spawn or the daemon
    // comes up windowless and dies (the live-attach bug). This pins the window threading.
    const ensureDaemon = vi.fn(async () => INFO);
    const control = createRealDaemonControl(deps({ ensureDaemon }));

    const port = await control.daemonPort(649);

    expect(ensureDaemon).toHaveBeenCalledWith({ windowId: 649 });
    expect(port).toBe(INFO.daemonPort);
  });

  it('with no window reuses a running daemon (the deep-link /token re-fetch path)', async () => {
    const ensureDaemon = vi.fn(async () => INFO);
    const control = createRealDaemonControl(deps({ ensureDaemon }));

    await control.daemonPort();

    expect(ensureDaemon).toHaveBeenCalledWith(undefined); // reuse-only, never a windowed spawn
  });
});

describe('createFakeDaemonControl — daemonPort()', () => {
  it('returns the pinned fake port', async () => {
    await expect(createFakeDaemonControl().daemonPort()).resolves.toBe(FAKE_DAEMON_PORT);
  });

  it('honours a per-test override', async () => {
    const control = createFakeDaemonControl({ daemonPort: async () => 9999 });
    await expect(control.daemonPort()).resolves.toBe(9999);
  });
});
