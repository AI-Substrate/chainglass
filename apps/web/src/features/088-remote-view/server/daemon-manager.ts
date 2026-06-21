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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

/** `GET /health` payload (no auth) — Workshop 004 control API. */
export interface DaemonHealth {
  ok: boolean;
  daemonVersion: string;
  protocolVersion: number;
  permissions: {
    screenRecording: boolean;
    accessibility: 'granted' | 'denied' | 'not-determined';
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
  /** Spawn the daemon binary detached (fire-and-forget). */
  spawnDaemon: (binaryPath: string, args: string[]) => void;
  /** `GET /health` for a daemon port; resolves null when unreachable. */
  fetchHealth: (daemonPort: number) => Promise<DaemonHealth | null>;
  /** `POST /shutdown` for a graceful upgrade exit. */
  shutdownDaemon: (daemonPort: number) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export interface DaemonManager {
  /** Ensure a healthy, version-matched daemon is running; return how to reach it. */
  ensureDaemon: () => Promise<DaemonInfo>;
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

  function spawn(): void {
    // Absolute paths only — the daemon never computes the port offset (Phase 4 export).
    deps.spawnDaemon(config.innerBinaryPath, [
      '--port',
      String(spawnPort),
      '--registry',
      registryPath,
      '--bootstrap',
      config.bootstrapPath,
    ]);
  }

  async function pollUntilHealthy(): Promise<{
    entry: RegistryEntry;
    health: DaemonHealth;
  } | null> {
    const deadline = deps.now() + timeoutMs;
    while (deps.now() < deadline) {
      const resolved = await resolveHealthy();
      if (resolved) return resolved;
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

  async function ensureDaemon(): Promise<DaemonInfo> {
    const current = await resolveHealthy();
    if (current) {
      if (versionOk(current.health)) return toInfo(current);
      // Healthy but wrong protocol → graceful shutdown for upgrade, then respawn.
      deps.logger?.warn(
        `remote-view: daemon protocol ${current.health.protocolVersion} != expected ` +
          `${config.expectedProtocolVersion}; gracefully respawning`
      );
      await deps.shutdownDaemon(current.entry.port);
    }

    spawn();
    const spawned = await pollUntilHealthy();
    if (!spawned) {
      throw new Error(
        `remote-view: streamd did not become healthy within ${timeoutMs}ms (registry ${registryPath}). ` +
          'Check Screen Recording permission and that the bundle is installed (`just streamd-install`).'
      );
    }
    if (!versionOk(spawned.health)) {
      throw new Error(
        `remote-view: streamd protocol ${spawned.health.protocolVersion} still != expected ` +
          `${config.expectedProtocolVersion} after respawn — the installed bundle is stale. ` +
          'Run `just streamd-install`.'
      );
    }
    return toInfo(spawned);
  }

  return { ensureDaemon };
}
