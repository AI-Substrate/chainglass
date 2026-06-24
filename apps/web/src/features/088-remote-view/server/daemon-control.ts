import { z } from 'zod';
/**
 * Remote-view daemon-control surface — the host/daemon concerns the `/windows` and
 * `/health` routes proxy (Plan 088 Phase 5, T004).
 *
 * Deliberately SEPARATE from `IRemoteViewService` (the frozen Workshop-002 *session*
 * contract). Window enumeration is a host concern and `/health` is a daemon-liveness
 * concern — neither is a session operation, so they get their own small interface
 * rather than bloating the contract suite that runs verbatim against the real adapter.
 *
 * `createRealDaemonControl` is pure over its injected deps (one-shot spawn, ensureDaemon,
 * health fetch) so it is unit-testable with no child process or daemon; the production
 * wiring that binds the real node primitives lives in `remote-view-service.production.ts`.
 */
import { type WindowDescriptor, WindowDescriptorSchema } from '../protocol/messages';
import type { DaemonHealth, DaemonInfo } from './daemon-manager';

/** Leaf-light DI token (a bare string) so routes resolve the control WITHOUT importing the
 *  whole `di-container` module graph — the container registers against this same constant. */
export const REMOTE_VIEW_DAEMON_CONTROL_TOKEN = 'RemoteViewDaemonControl';

/** The daemon/host control surface the T004 routes depend on. */
export interface RemoteViewDaemonControl {
  /** Enumerate capturable host windows for the picker catalog (real impl spawns
   *  `streamd --list-windows`; the daemon's own surface stays single-window, F005/F006). */
  listWindows(): Promise<WindowDescriptor[]>;
  /** Ensure a healthy, version-matched daemon, then return its `/health` verdict. */
  health(): Promise<DaemonHealth>;
  /**
   * Ensure a healthy, version-matched daemon, then return its loopback listen port
   * (T001 — Phase 6). The `/token` route surfaces this so the browser can build the
   * real `ws://127.0.0.1:<port>/stream` url instead of the Phase-3 stub (DL-005). The
   * port is READ from the registry via `ensureDaemon()` — never recomputed (frozen
   * `port`-not-`webPort+offset` contract).
   *
   * `windowId` is the window the browser is about to stream. The daemon is one-window-per-spawn
   * (it captures a fixed window at startup), so the picked window must reach the spawn — `/token`
   * passes it here so a real attach brings up a daemon CAPTURING that window. Omitted = reuse a
   * running daemon (a deep-link re-fetch where one already exists).
   */
  daemonPort(windowId?: number): Promise<number>;
}

/** The `streamd --list-windows` stdout contract — the same `WindowDescriptor` the streamer reports. */
const WindowCatalogSchema = z.array(WindowDescriptorSchema);

/** Stable failure codes the routes translate to HTTP (AC-14: name the missing grant, never a
 *  silent empty list). `E_PERMISSION` ⇐ the daemon's exit-3 (Screen-Recording grant missing);
 *  `E_BUNDLE_MISSING` ⇐ the signed bundle was never installed (`just streamd-install`) — caught
 *  up front so `/health` + `/windows` both name it instead of an opaque non-zero exit / readiness
 *  timeout (T008). */
export type DaemonControlErrorCode = 'E_PERMISSION' | 'E_BUNDLE_MISSING' | 'E_INTERNAL';

export class DaemonControlError extends Error {
  constructor(
    readonly code: DaemonControlErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DaemonControlError';
  }
}

export interface RealDaemonControlDeps {
  /** Spawn/poll/version-handshake the daemon for an optional window, returning how to reach it. */
  ensureDaemon: (opts?: { windowId?: number }) => Promise<DaemonInfo>;
  /** Run `streamd --list-windows` one-shot → its stdout + exit code. Injected for tests. */
  runWindowList: () => Promise<{ stdout: string; exitCode: number }>;
  /** `GET /health` at a daemon port; null when unreachable. */
  fetchHealth: (daemonPort: number) => Promise<DaemonHealth | null>;
  /**
   * True iff the signed `streamd` bundle is installed (its inner binary exists). Injected so the
   * control stays pure over deps — production wires `() => existsSync(config.innerBinaryPath)`.
   * When supplied and `false`, every method fails fast with `E_BUNDLE_MISSING` BEFORE any spawn /
   * ensureDaemon work, so `/health` + `/windows` give one named, actionable error instead of a
   * non-zero exit (windows) or a readiness-timeout (health) for the same root cause (T008). Omit
   * it (the pre-T008 default) and no bundle check runs — back-compat for the existing call sites.
   */
  bundleInstalled?: () => boolean;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

/**
 * Daemon-backed control. Pure over `deps` — no child_process, no fetch, no daemon — so the
 * exit-code → error-code mapping and the schema-validated parse are deterministically unit-tested.
 */
export function createRealDaemonControl(deps: RealDaemonControlDeps): RemoteViewDaemonControl {
  /**
   * T008: fail fast with a named, actionable error when the bundle was never installed — BEFORE
   * any spawn / `streamd --list-windows` / ensureDaemon, so `/health` and `/windows` agree on the
   * bundle-installed state and both prescribe `just streamd-install` instead of an opaque failure.
   */
  function assertBundleInstalled(): void {
    if (deps.bundleInstalled && !deps.bundleInstalled()) {
      throw new DaemonControlError(
        'E_BUNDLE_MISSING',
        'the signed streamd bundle is not installed — run `just streamd-install`'
      );
    }
  }
  return {
    async listWindows(): Promise<WindowDescriptor[]> {
      assertBundleInstalled();
      const { stdout, exitCode } = await deps.runWindowList();
      if (exitCode === 3) {
        throw new DaemonControlError(
          'E_PERMISSION',
          'Screen Recording permission is required to enumerate windows. Grant it in System Settings → Privacy & Security → Screen Recording.'
        );
      }
      if (exitCode !== 0) {
        throw new DaemonControlError(
          'E_INTERNAL',
          `streamd --list-windows exited ${exitCode} (is the bundle installed? run \`just streamd-install\`)`
        );
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        throw new DaemonControlError(
          'E_INTERNAL',
          'streamd --list-windows returned non-JSON output'
        );
      }
      const result = WindowCatalogSchema.safeParse(parsed);
      if (!result.success) {
        throw new DaemonControlError(
          'E_INTERNAL',
          `window catalog failed schema validation: ${result.error.issues[0]?.message ?? 'unknown'}`
        );
      }
      return result.data;
    },

    async health(): Promise<DaemonHealth> {
      assertBundleInstalled();
      // ensureDaemon() runs the spawn/crash-respawn/version handshake (T001) BEFORE we read
      // health, so `/health` reflects a live, version-matched daemon — never a stale registry.
      const info = await deps.ensureDaemon();
      const verdict = await deps.fetchHealth(info.daemonPort);
      if (!verdict) {
        throw new DaemonControlError(
          'E_INTERNAL',
          `daemon became healthy via ensureDaemon() but /health was unreachable at port ${info.daemonPort}`
        );
      }
      return verdict;
    },

    async daemonPort(windowId?: number): Promise<number> {
      assertBundleInstalled();
      // Same ensureDaemon() the session adapter uses — idempotent (a running daemon for this window
      // is reused, never double-spawned). Passing the window makes a cold `/token` bring up a daemon
      // CAPTURING it (the daemon is one-window-per-spawn); omitting it reuses whatever's running.
      const info = await deps.ensureDaemon(windowId !== undefined ? { windowId } : undefined);
      return info.daemonPort;
    },
  };
}

/** Pinned loopback port the fake control reports (overridable per test via the spread below). */
export const FAKE_DAEMON_PORT = 47820;

/**
 * Deterministic fake the route tests inject (the `/windows`+`/health` analogue of
 * `FakeRemoteViewService`). Returns the pinned `FAKE_WINDOW`-class catalog and a healthy verdict;
 * overridable so a test can force a permission error or an empty catalog.
 */
export function createFakeDaemonControl(
  overrides: Partial<RemoteViewDaemonControl> = {}
): RemoteViewDaemonControl {
  return {
    async listWindows(): Promise<WindowDescriptor[]> {
      return [
        {
          id: 34202,
          app: 'Godot',
          title: 'spike-target',
          pixelWidth: 800,
          pixelHeight: 656,
          scale: 2,
        },
      ];
    },
    async health(): Promise<DaemonHealth> {
      return {
        ok: true,
        daemonVersion: '0.0.0-fake',
        protocolVersion: 1,
        permissions: { screenRecording: 'granted', accessibility: 'granted' },
      };
    },
    async daemonPort(): Promise<number> {
      return FAKE_DAEMON_PORT;
    },
    ...overrides,
  };
}
