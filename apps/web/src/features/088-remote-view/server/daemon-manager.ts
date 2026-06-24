import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/**
 * Web-side daemon manager — spawn-on-demand, readiness poll, version handshake.
 *
 * Owns the native `streamd` lifecycle from the Node side (Workshop 004): on the
 * first remote-view use it lazily spawns the signed bundle's inner binary,
 * detached, then polls the per-web-port registry file + `GET /health` until the
 * daemon is listening, and finally runs a protocol-version handshake. A healthy,
 * version-matched daemon is reused; a crashed one is respawned; a version-stale
 * one is gracefully shut down and respawned; a daemon that can't be brought to a
 * matching version surfaces an actionable `just streamd-install` error.
 *
 * Spawn attribution (Phase 1 spike §1.5b): TCC grants key on the bundle identity
 * (bundle id + signing cert), independent of path/binary — so we spawn the inner
 * binary `…/Contents/MacOS/streamd` directly (detached), which keeps the grant
 * without needing LaunchServices `open -a`. (Workshop 004 predates the spike's
 * resolution; the spike + Phase 4 export supersede it.)
 *
 * The registry contract is FROZEN by Phase 4: `.chainglass/streamd-<webPort>.json`
 * with a `port` field (the daemon's listen port — NOT `daemonPort`). This manager
 * only READS it; `daemonPort` exposed to HTTP responses is read from `port`, never
 * derived from `webPort + offset`.
 *
 * I/O is injected (spawn / health fetch / shutdown / sleep / clock) so the spawn
 * lifecycle is unit-tested deterministically against a temp registry dir.
 *
 * Plan 088 Phase 5 — T001.
 */
import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';

/** The FROZEN registry-file shape the daemon writes (Phase 4). */
export interface RegistryEntry {
  pid: number;
  /** The daemon's listen port. Registry field is `port` — never `daemonPort`. */
  port: number;
  protocolVersion: number;
  daemonVersion: string;
  bundleId: string;
  bundlePath: string;
  startedAt: string;
}

/** macOS TCC grant state — mirrors the Phase 4 daemon's /health (no boolean drift, F002). */
export type PermissionGrant = 'granted' | 'denied' | 'not-determined';

/** `GET /health` payload (no auth) — Workshop 004 control API. */
export interface DaemonHealth {
  ok: boolean;
  daemonVersion: string;
  protocolVersion: number;
  permissions: {
    screenRecording: PermissionGrant;
    accessibility: PermissionGrant;
  };
}

/** What `ensureDaemon()` hands back to the proxy routes. */
export interface DaemonInfo {
  /** Read from the registry `port` field — the single source of truth (never derived). */
  daemonPort: number;
  daemonVersion: string;
  protocolVersion: number;
}

export interface DaemonManagerConfig {
  /** The web server's listen port — keys the registry file and the default offset. */
  webPort: number;
  /** Workspace root holding `.chainglass/`. */
  workspaceRoot: string;
  /** Absolute path to the signed bundle's inner binary (`…/Contents/MacOS/streamd`). */
  innerBinaryPath: string;
  /** Absolute path to the bootstrap-code JSON the daemon verifies tokens against. */
  bootstrapPath: string;
  /** `CG_REMOTE_VIEW__DAEMON_PORT` override (ADR-0003); defaults to `webPort + 1501`. */
  daemonPortOverride?: number;
  /** Protocol version this web build speaks; a mismatch drives a respawn. */
  expectedProtocolVersion: number;
  /** How long to wait for a spawned daemon to become healthy (default 5000ms). */
  readinessTimeoutMs?: number;
  /** Poll cadence while waiting for readiness (default 100ms). */
  pollIntervalMs?: number;
}

export interface DaemonManagerDeps {
  /**
   * Spawn the daemon binary detached (fire-and-forget). `extraEnv` is merged OVER `process.env`
   * by the implementation — it carries `CG_REMOTE_VIEW__WINDOW_ID` (the daemon captures ONE window,
   * fixed at spawn — `Capture.swift`/`main.swift`; without it the binary aborts) + the daemon port.
   */
  spawnDaemon: (binaryPath: string, args: string[], extraEnv?: Record<string, string>) => void;
  /** `GET /health` for a daemon port; resolves null when unreachable. */
  fetchHealth: (daemonPort: number) => Promise<DaemonHealth | null>;
  /** `POST /shutdown` for a graceful upgrade exit. */
  shutdownDaemon: (daemonPort: number) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /**
   * Central event notifier (T006) — emits `remote-view` `daemon-state` envelopes
   * (`ready` on a healthy handshake, `down` on a failed one) so open clients can
   * reflect the daemon lifecycle. OPTIONAL: the T001 manager tests construct the
   * manager without one, so a missing notifier is a silent no-op.
   */
  notifier?: ICentralEventNotifier;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface EnsureDaemonOptions {
  /**
   * The window to capture. The daemon is ONE-window-per-spawn (capture is fixed at startup and
   * cannot re-target), so attach/detach pass the session's window and the manager (re)spawns a
   * daemon for it. `/health` + `/token` omit it: they only REUSE a running daemon (they have no
   * window) and must never cold-spawn a windowless one (which the binary refuses to start).
   */
  windowId?: number;
}

export interface DaemonManager {
  /** Ensure a healthy, version-matched daemon for `windowId` is running; return how to reach it. */
  ensureDaemon: (opts?: EnsureDaemonOptions) => Promise<DaemonInfo>;
}

/** Terminal sidecar owns `webPort + 1500`; remote view takes `+1501` (Workshop 004). */
const DEFAULT_PORT_OFFSET = 1501;
const DEFAULT_READINESS_TIMEOUT_MS = 5000;
const DEFAULT_POLL_INTERVAL_MS = 100;

/** Per-web-port registry file (mirrors terminal `terminal-sidecar-<port>.pids.json`). */
export function streamdRegistryPath(workspaceRoot: string, webPort: number): string {
  return join(workspaceRoot, '.chainglass', `streamd-${webPort}.json`);
}

/** Read + minimally validate the registry entry; null on any read/parse failure. */
function readRegistryEntry(path: string): RegistryEntry | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as RegistryEntry;
    return typeof parsed?.port === 'number' && parsed.port > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function createDaemonManager(
  config: DaemonManagerConfig,
  deps: DaemonManagerDeps
): DaemonManager {
  const registryPath = streamdRegistryPath(config.workspaceRoot, config.webPort);
  const spawnPort = config.daemonPortOverride ?? config.webPort + DEFAULT_PORT_OFFSET;
  const timeoutMs = config.readinessTimeoutMs ?? DEFAULT_READINESS_TIMEOUT_MS;
  const pollMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  const versionOk = (h: DaemonHealth): boolean =>
    h.protocolVersion === config.expectedProtocolVersion;

  /** Resolve to a live, /health-ok daemon from the registry, or null. */
  async function resolveHealthy(): Promise<{
    entry: RegistryEntry;
    health: DaemonHealth;
  } | null> {
    const entry = readRegistryEntry(registryPath);
    if (!entry) return null;
    const health = await deps.fetchHealth(entry.port);
    if (!health || !health.ok) return null;
    return { entry, health };
  }

  // The window the live daemon was last spawned to capture (in-memory). The registry/health don't
  // carry it, so the manager remembers what it spawned: a request for a DIFFERENT window must respawn.
  let spawnedWindowId: number | undefined;

  function spawn(windowId: number): void {
    // Absolute paths only — the daemon never computes the port offset (Phase 4 export). The window
    // id + port ride as env (the daemon reads `CG_REMOTE_VIEW__WINDOW_ID`/`_DAEMON_PORT`).
    deps.spawnDaemon(
      config.innerBinaryPath,
      [
        '--port',
        String(spawnPort),
        '--registry',
        registryPath,
        '--bootstrap',
        config.bootstrapPath,
      ],
      {
        CG_REMOTE_VIEW__WINDOW_ID: String(windowId),
        CG_REMOTE_VIEW__DAEMON_PORT: String(spawnPort),
      }
    );
  }

  async function pollUntilHealthy(
    accept: (health: DaemonHealth) => boolean
  ): Promise<{ entry: RegistryEntry; health: DaemonHealth } | null> {
    const deadline = deps.now() + timeoutMs;
    while (deps.now() < deadline) {
      const resolved = await resolveHealthy();
      if (resolved && accept(resolved.health)) return resolved;
      await deps.sleep(pollMs);
    }
    return null;
  }

  function toInfo(r: { entry: RegistryEntry; health: DaemonHealth }): DaemonInfo {
    return {
      daemonPort: r.entry.port, // READ from registry — never webPort + offset
      daemonVersion: r.health.daemonVersion,
      protocolVersion: r.health.protocolVersion,
    };
  }

  /** T006: push the daemon's lifecycle onto the `remote-view` SSE channel. */
  function emitDaemonState(state: 'ready' | 'down', extra: Record<string, unknown> = {}): void {
    deps.notifier?.emit(WorkspaceDomain.RemoteView, 'daemon-state', { state, ...extra });
  }

  /** Emit `ready` for a resolved daemon, then hand back its reach info. */
  function ready(r: { entry: RegistryEntry; health: DaemonHealth }): DaemonInfo {
    const info = toInfo(r);
    emitDaemonState('ready', {
      daemonVersion: info.daemonVersion,
      protocolVersion: info.protocolVersion,
    });
    return info;
  }

  /** Emit `down` (with the actionable reason), then throw it. */
  function down(reason: string): never {
    emitDaemonState('down', { reason });
    throw new Error(reason);
  }

  async function ensureDaemon(opts: EnsureDaemonOptions = {}): Promise<DaemonInfo> {
    const { windowId } = opts;
    const current = await resolveHealthy();
    if (current) {
      const versionMatches = versionOk(current.health);
      // No window requested (/health, /token) → reuse whatever's running. A window requested →
      // reuse only if the live daemon was spawned for THAT window (capture can't re-target).
      const windowMatches = windowId === undefined || spawnedWindowId === windowId;
      if (versionMatches && windowMatches) return ready(current);
      if (!versionMatches) {
        // Healthy but wrong protocol → graceful shutdown for upgrade, then respawn.
        deps.logger?.warn(
          `remote-view: daemon protocol ${current.health.protocolVersion} != expected ` +
            `${config.expectedProtocolVersion}; gracefully respawning`
        );
      }
      // Either a protocol upgrade or a window switch — shut the current daemon down before respawn.
      await deps.shutdownDaemon(current.entry.port);
    }

    if (windowId === undefined) {
      // No reusable daemon and no window to capture: the daemon is one-window-per-spawn, so a bare
      // /health or /token (pre-attach) cannot bring one up. Fail honestly — the picker preflight is
      // non-blocking and /token is only fetched after an attach (when a daemon already exists).
      spawnedWindowId = undefined;
      return down(
        'remote-view: the streamer is not running and no window was given to capture — attach a window first.'
      );
    }

    spawn(windowId);
    // Poll for a daemon that is healthy AND version-matched — never latch onto the
    // old daemon still gracefully exiting with the stale protocol (F001).
    const spawned = await pollUntilHealthy((h) => versionOk(h));
    if (spawned) {
      spawnedWindowId = windowId;
      return ready(spawned);
    }
    spawnedWindowId = undefined;

    // No version-matched daemon within the readiness window — diagnose why.
    const last = await resolveHealthy();
    if (last && !versionOk(last.health)) {
      return down(
        `remote-view: streamd protocol ${last.health.protocolVersion} still != expected ${config.expectedProtocolVersion} after respawn — the installed bundle is stale. Run \`just streamd-install\`.`
      );
    }
    return down(
      `remote-view: streamd did not become healthy within ${timeoutMs}ms (registry ${registryPath}). Check Screen Recording permission and that the bundle is installed (\`just streamd-install\`).`
    );
  }

  return { ensureDaemon };
}
