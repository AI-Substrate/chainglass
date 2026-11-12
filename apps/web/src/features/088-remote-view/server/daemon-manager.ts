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
  /**
   * How long to wait for a retiring daemon to release its (fixed) port during a respawn before
   * hard-killing it (default 3000ms). The daemon is one-target-per-spawn on a fixed port, so a
   * target switch must fully retire the old daemon before the replacement can bind — otherwise the
   * new bind fails and the attach lands on a black screen (the orphan-on-switch bug).
   */
  shutdownGraceMs?: number;
}

export interface DaemonManagerDeps {
  /**
   * Spawn the daemon binary detached (fire-and-forget). `extraEnv` is merged OVER `process.env`
   * by the implementation — it carries the capture target (`CG_REMOTE_VIEW__WINDOW_ID` for a window
   * OR `CG_REMOTE_VIEW__DISPLAY_ID` for a whole display — the daemon captures ONE fixed target set at
   * spawn, `Capture.swift`/`DisplayCapture.swift`/`main.swift`; without one the binary aborts) + the
   * daemon port.
   */
  spawnDaemon: (binaryPath: string, args: string[], extraEnv?: Record<string, string>) => void;
  /** `GET /health` for a daemon port; resolves null when unreachable. */
  fetchHealth: (daemonPort: number) => Promise<DaemonHealth | null>;
  /** `POST /shutdown` for a graceful upgrade exit. */
  shutdownDaemon: (daemonPort: number) => Promise<void>;
  /**
   * Best-effort hard kill of a daemon pid (`process.kill` in prod). Used ONLY as the escalation when
   * a graceful `/shutdown` doesn't free the daemon's (fixed) port within `shutdownGraceMs` during a
   * respawn — without it a wedged old daemon keeps the port and the replacement can never bind (the
   * orphan-on-switch black screen). OPTIONAL: the T001 manager tests that never exercise the
   * escalation omit it, so a missing killer simply skips the hard kill.
   */
  killProcess?: (pid: number, signal: NodeJS.Signals | number) => void;
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
   * The window to capture. The daemon is ONE-target-per-spawn (capture is fixed at startup and
   * cannot re-target), so attach/detach pass the session's window and the manager (re)spawns a
   * daemon for it. `/health` + a bare `/token` omit BOTH ids: they only REUSE a running daemon (they
   * have no target) and must never cold-spawn a targetless one (which the binary refuses to start).
   */
  windowId?: number;
  /**
   * The whole display (screen) to capture — the "stream the whole desktop" target (multi-target
   * capture). Mutually exclusive with `windowId`; when both are somehow set, `windowId` wins (the
   * manager only ever sets one). Drives `CG_REMOTE_VIEW__DISPLAY_ID` at spawn.
   */
  displayId?: number;
}

export interface DaemonManager {
  /** Ensure a healthy, version-matched daemon for the requested target is running; return how to
   *  reach it. The target is a window (`windowId`) OR a whole display (`displayId`). */
  ensureDaemon: (opts?: EnsureDaemonOptions) => Promise<DaemonInfo>;
}

/** Stable in-memory key for the live daemon's capture target (`w:<id>` / `d:<id>`), so a request
 *  for a DIFFERENT target respawns and the SAME one reuses. `null` = no target (reuse-only). */
function captureTargetKey(opts: EnsureDaemonOptions): string | null {
  if (opts.windowId !== undefined) return `w:${opts.windowId}`;
  if (opts.displayId !== undefined) return `d:${opts.displayId}`;
  return null;
}

/** Stable identity of a daemon process from its registry entry (`pid:startedAt`). A respawn is a new
 *  process → new identity, so the post-respawn readiness poll can tell the freshly-spawned daemon
 *  apart from the one it just retired — and never latch onto the dying old daemon (a black screen). */
function daemonIdentity(entry: RegistryEntry): string {
  return `${entry.pid}:${entry.startedAt}`;
}

/** Terminal sidecar owns `webPort + 1500`; remote view takes `+1501` (Workshop 004). */
const DEFAULT_PORT_OFFSET = 1501;
const DEFAULT_READINESS_TIMEOUT_MS = 5000;
const DEFAULT_POLL_INTERVAL_MS = 100;
const DEFAULT_SHUTDOWN_GRACE_MS = 3000;

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
  const graceMs = config.shutdownGraceMs ?? DEFAULT_SHUTDOWN_GRACE_MS;

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

  // The target the live daemon was last spawned to capture (in-memory `w:<id>`/`d:<id>`). The
  // registry/health don't carry it, so the manager remembers what it spawned: a request for a
  // DIFFERENT target must respawn (capture is fixed at spawn and cannot re-target).
  let spawnedTargetKey: string | null = null;

  function spawn(opts: EnsureDaemonOptions): void {
    // Absolute paths only — the daemon never computes the port offset (Phase 4 export). The capture
    // target + port ride as env: a window via `CG_REMOTE_VIEW__WINDOW_ID`, a whole display via
    // `CG_REMOTE_VIEW__DISPLAY_ID` (the daemon reads exactly one, plus `_DAEMON_PORT`).
    const targetEnv: Record<string, string> =
      opts.windowId !== undefined
        ? { CG_REMOTE_VIEW__WINDOW_ID: String(opts.windowId) }
        : { CG_REMOTE_VIEW__DISPLAY_ID: String(opts.displayId) };
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
        ...targetEnv,
        CG_REMOTE_VIEW__DAEMON_PORT: String(spawnPort),
      }
    );
  }

  async function pollUntilHealthy(
    accept: (resolved: { entry: RegistryEntry; health: DaemonHealth }) => boolean
  ): Promise<{ entry: RegistryEntry; health: DaemonHealth } | null> {
    const deadline = deps.now() + timeoutMs;
    while (deps.now() < deadline) {
      const resolved = await resolveHealthy();
      if (resolved && accept(resolved)) return resolved;
      await deps.sleep(pollMs);
    }
    return null;
  }

  /**
   * Retire the live daemon ahead of a respawn and WAIT until its (fixed) port stops answering, so
   * the replacement can bind it. The daemon is one-target-per-spawn on a fixed port: spawning a new
   * one while the old still holds the port makes the new bind fail (the new process exits) and the
   * attach lands on a black screen — the orphan-on-switch bug. Graceful `/shutdown` first (lets a
   * connected viewer get `bye`); if the port is still answering after `graceMs`, hard-kill the pid
   * we own (we just resolved its `/health`, so it is verifiably alive and ours) as a fail-closed
   * escalation. Returns once the port is free, or once it has done all it can to free it.
   */
  async function retireDaemon(entry: RegistryEntry): Promise<void> {
    await deps.shutdownDaemon(entry.port);
    const deadline = deps.now() + graceMs;
    while (deps.now() < deadline) {
      if (!(await deps.fetchHealth(entry.port))) return; // port released — safe to respawn
      await deps.sleep(pollMs);
    }
    // Graceful shutdown didn't free the fixed port within the grace window (a wedged daemon — the
    // "not shutting down properly" symptom) → hard-kill it so the replacement can bind.
    try {
      deps.killProcess?.(entry.pid, 'SIGKILL');
    } catch {
      /* raced the daemon's own exit — nothing left to kill */
    }
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
    const requestedKey = captureTargetKey(opts); // null = reuse-only (no target)
    const current = await resolveHealthy();
    // The identity of a daemon we retire below, so the readiness poll accepts ONLY the freshly
    // spawned replacement — never the one we just shut down (which, latched onto, is a black screen).
    let retiredIdentity: string | null = null;
    if (current) {
      const versionMatches = versionOk(current.health);
      // No target requested (/health, bare /token) → reuse whatever's running. A target requested →
      // reuse only if the live daemon was spawned for THAT target (capture can't re-target).
      const targetMatches = requestedKey === null || spawnedTargetKey === requestedKey;
      if (versionMatches && targetMatches) return ready(current);
      if (!versionMatches) {
        // Healthy but wrong protocol → graceful shutdown for upgrade, then respawn.
        deps.logger?.warn(
          `remote-view: daemon protocol ${current.health.protocolVersion} != expected ` +
            `${config.expectedProtocolVersion}; gracefully respawning`
        );
      }
      // Either a protocol upgrade or a target switch — fully retire the current daemon and WAIT for
      // its fixed port to free before respawning (or the replacement can't bind → black screen).
      retiredIdentity = daemonIdentity(current.entry);
      await retireDaemon(current.entry);
    }

    if (requestedKey === null) {
      // No reusable daemon and no target to capture: the daemon is one-target-per-spawn, so a bare
      // /health or /token (pre-attach) cannot bring one up. Fail honestly — the picker preflight is
      // non-blocking and /token is only fetched after an attach (when a daemon already exists).
      spawnedTargetKey = null;
      return down(
        'remote-view: the streamer is not running and no window or display was given to capture — attach a window or screen first.'
      );
    }

    spawn(opts);
    // Poll for a daemon that is healthy, version-matched, AND a DIFFERENT process than the one we
    // just retired — never latch onto the old daemon still gracefully exiting (stale protocol or the
    // prior target, F001 / the orphan-on-switch black screen).
    const spawned = await pollUntilHealthy(
      (r) => versionOk(r.health) && daemonIdentity(r.entry) !== retiredIdentity
    );
    if (spawned) {
      spawnedTargetKey = requestedKey;
      return ready(spawned);
    }
    spawnedTargetKey = null;

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
