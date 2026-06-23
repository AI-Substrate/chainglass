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
  type RealDaemonControlDeps,
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
    const control = createRealDaemonControl(deps({ runWindowList: async () => ({ stdout: '', exitCode: 3 }) }));
    await expect(control.listWindows()).rejects.toMatchObject({ code: 'E_PERMISSION' });
  });

  it('maps any other non-zero exit → E_INTERNAL', async () => {
    const control = createRealDaemonControl(deps({ runWindowList: async () => ({ stdout: '', exitCode: 127 }) }));
    await expect(control.listWindows()).rejects.toMatchObject({ code: 'E_INTERNAL' });
  });

  it('rejects non-JSON stdout with E_INTERNAL (never a silent empty list)', async () => {
    const control = createRealDaemonControl(deps({ runWindowList: async () => ({ stdout: 'not json', exitCode: 0 }) }));
    await expect(control.listWindows()).rejects.toMatchObject({ code: 'E_INTERNAL' });
  });

  it('rejects a catalog that violates WindowDescriptor schema with E_INTERNAL', async () => {
    // `id` as a string is the kind of drift a daemon-version skew could produce — must not
    // surface as a half-typed window the picker then renders.
    const bad = JSON.stringify([{ id: 'nope', app: 'X', title: 't', pixelWidth: 1, pixelHeight: 1, scale: 1 }]);
    const control = createRealDaemonControl(deps({ runWindowList: async () => ({ stdout: bad, exitCode: 0 }) }));
    await expect(control.listWindows()).rejects.toMatchObject({ code: 'E_INTERNAL' });
  });

  it('returns an empty catalog as [] (no windows is not an error)', async () => {
    const control = createRealDaemonControl(deps({ runWindowList: async () => ({ stdout: '[]', exitCode: 0 }) }));
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
