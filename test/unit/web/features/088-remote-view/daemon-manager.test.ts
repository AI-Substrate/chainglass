// @vitest-environment node
/**
 * Plan 088 Phase 5 — T001: web-side daemon manager (spawn / poll / version handshake).
 *
 * Drives the spawn-on-demand lifecycle (Workshop 004) against a TEMP registry dir
 * plus an injected spawner + health probe — no live daemon. Proves: spawn when
 * absent, reuse when healthy, respawn on crash + protocol mismatch, the actionable
 * stale-install error, and that `daemonPort` is READ from the registry `port`
 * field (never derived from webPort + offset).
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDaemonManager,
  type DaemonHealth,
  type RegistryEntry,
  streamdRegistryPath,
} from '@/features/088-remote-view/server/daemon-manager';

const WEB_PORT = 4607;
const EXPECTED_PROTOCOL = 1;
const BUNDLE_PATH = '/Apps/ChainglassStreamd.app';
const INNER_BINARY = `${BUNDLE_PATH}/Contents/MacOS/streamd`;
const BOOTSTRAP = '/abs/.chainglass/bootstrap-code.json';
const DEFAULT_DAEMON_PORT = WEB_PORT + 1501; // 6108

function entry(over: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    pid: 84210,
    port: DEFAULT_DAEMON_PORT,
    protocolVersion: EXPECTED_PROTOCOL,
    daemonVersion: '0.1.0',
    bundleId: 'com.chainglass.streamd',
    bundlePath: BUNDLE_PATH,
    startedAt: '2026-06-21T00:00:00.000Z',
    ...over,
  };
}

function health(over: Partial<DaemonHealth> = {}): DaemonHealth {
  return {
    ok: true,
    daemonVersion: '0.1.0',
    protocolVersion: EXPECTED_PROTOCOL,
    permissions: { screenRecording: true, accessibility: 'granted' },
    ...over,
  };
}

describe('remote-view daemon manager', () => {
  let root: string;
  let registryPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cg-streamd-'));
    registryPath = streamdRegistryPath(root, WEB_PORT);
    mkdirSync(join(root, '.chainglass'), { recursive: true });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function writeRegistry(e: RegistryEntry): void {
    writeFileSync(registryPath, JSON.stringify(e), 'utf8');
  }

  /** Build a manager over recording fakes of the injected deps. */
  function build(
    opts: {
      healthByPort?: (port: number) => DaemonHealth | null;
      onSpawn?: (binary: string, args: string[]) => void;
      daemonPortOverride?: number;
      nowSeq?: number[];
    } = {}
  ) {
    const spawns: { binary: string; args: string[] }[] = [];
    const shutdowns: number[] = [];
    let nowi = 0;
    const nowSeq = opts.nowSeq;
    const manager = createDaemonManager(
      {
        webPort: WEB_PORT,
        workspaceRoot: root,
        innerBinaryPath: INNER_BINARY,
        bootstrapPath: BOOTSTRAP,
        daemonPortOverride: opts.daemonPortOverride,
        expectedProtocolVersion: EXPECTED_PROTOCOL,
        readinessTimeoutMs: 1000,
        pollIntervalMs: 10,
      },
      {
        spawnDaemon: (binary, args) => {
          spawns.push({ binary, args });
          opts.onSpawn?.(binary, args);
        },
        fetchHealth: async (port) => (opts.healthByPort ? opts.healthByPort(port) : health()),
        shutdownDaemon: async (port) => {
          shutdowns.push(port);
        },
        sleep: async () => {},
        now: () => (nowSeq ? nowSeq[Math.min(nowi++, nowSeq.length - 1)] : 0),
      }
    );
    return { manager, spawns, shutdowns };
  }

  it('spawns the inner binary on demand and returns the registry port (never derived)', async () => {
    /*
    Test Doc:
    - Why: the daemon is spawned lazily on first use (Workshop 004 — nobody pays until remote view is used).
    - Contract: no registry entry → spawn inner binary with absolute --port/--registry/--bootstrap, poll, return.
    - Usage Notes: daemonPort is READ from the registry `port`, not computed from webPort+offset.
    - Quality Contribution: pins the spawn argv + proves the read-not-derive rule the routes depend on.
    - Worked Example: registry writes port 6543 → info.daemonPort === 6543 even though --port was 6108.
    */
    const REG_PORT = 6543; // deliberately != webPort+1501 (6108) to prove READ-not-derive
    const { manager, spawns } = build({
      healthByPort: () => (existsSync(registryPath) ? health() : null),
      onSpawn: () => writeRegistry(entry({ port: REG_PORT })),
    });

    const info = await manager.ensureDaemon();

    expect(spawns).toHaveLength(1);
    expect(spawns[0].binary).toBe(INNER_BINARY);
    expect(spawns[0].args).toEqual([
      '--port',
      String(DEFAULT_DAEMON_PORT),
      '--registry',
      registryPath,
      '--bootstrap',
      BOOTSTRAP,
    ]);
    expect(info.daemonPort).toBe(REG_PORT);
  });

  it('reuses an already-healthy, version-matched daemon without spawning', async () => {
    /*
    Test Doc:
    - Why: ensureDaemon is called on every route hit; a healthy daemon must not be respawned.
    - Contract: registry entry + /health ok + protocol match → return its port, spawn never called.
    - Usage Notes: this is the hot path for the /windows + /sessions proxy routes.
    - Quality Contribution: prevents spawn storms / port churn on normal traffic.
    - Worked Example: registry has 6108, health ok v1 → daemonPort 6108, 0 spawns.
    */
    writeRegistry(entry({ port: DEFAULT_DAEMON_PORT }));
    const { manager, spawns } = build({ healthByPort: () => health() });

    const info = await manager.ensureDaemon();

    expect(spawns).toHaveLength(0);
    expect(info.daemonPort).toBe(DEFAULT_DAEMON_PORT);
  });

  it('respawns (no graceful shutdown) when the registered daemon is unreachable', async () => {
    /*
    Test Doc:
    - Why: a crashed daemon leaves a stale registry entry; ensureDaemon must recover.
    - Contract: registry entry present but /health unreachable → spawn; no /shutdown (it's already dead).
    - Usage Notes: stale-entry cleanup is the reaper's job (T002); ensureDaemon just gets a live one.
    - Quality Contribution: keeps remote view usable after a daemon crash without manual intervention.
    - Worked Example: health null → spawn → health ok → daemonPort returned, 0 shutdowns.
    */
    writeRegistry(entry({ port: DEFAULT_DAEMON_PORT }));
    let alive = false;
    const { manager, spawns, shutdowns } = build({
      healthByPort: () => (alive ? health() : null),
      onSpawn: () => {
        alive = true;
        writeRegistry(entry({ port: DEFAULT_DAEMON_PORT }));
      },
    });

    const info = await manager.ensureDaemon();

    expect(spawns).toHaveLength(1);
    expect(shutdowns).toHaveLength(0);
    expect(info.daemonPort).toBe(DEFAULT_DAEMON_PORT);
  });

  it('gracefully shuts down + respawns on a protocol-version mismatch', async () => {
    /*
    Test Doc:
    - Why: a running-but-stale daemon must be upgraded, not left serving an old protocol (Workshop 004 handshake).
    - Contract: health ok but protocol != expected → POST /shutdown, respawn, accept the matched version.
    - Usage Notes: graceful shutdown (vs hard kill) lets the daemon send `bye` to a connected viewer first.
    - Quality Contribution: proves the version handshake drives an orderly upgrade.
    - Worked Example: health v99 → shutdown(6108) → respawn → health v1 → returns v1.
    */
    writeRegistry(entry({ port: DEFAULT_DAEMON_PORT }));
    let respawned = false;
    const { manager, spawns, shutdowns } = build({
      healthByPort: () =>
        respawned ? health({ protocolVersion: EXPECTED_PROTOCOL }) : health({ protocolVersion: 99 }),
      onSpawn: () => {
        respawned = true;
        writeRegistry(entry({ port: DEFAULT_DAEMON_PORT }));
      },
    });

    const info = await manager.ensureDaemon();

    expect(shutdowns).toEqual([DEFAULT_DAEMON_PORT]);
    expect(spawns).toHaveLength(1);
    expect(info.protocolVersion).toBe(EXPECTED_PROTOCOL);
  });

  it('throws an actionable stale-install error when still mismatched after respawn', async () => {
    /*
    Test Doc:
    - Why: if the installed bundle itself is stale, respawning can't fix it — the human must reinstall.
    - Contract: protocol never matches even after respawn → throw an error naming `just streamd-install`.
    - Usage Notes: this is the terminal failure the routes surface to the UI/CLI.
    - Quality Contribution: turns an infinite respawn loop into one clear, fixable message.
    - Worked Example: health always v99 → throws /streamd-install/.
    */
    writeRegistry(entry({ port: DEFAULT_DAEMON_PORT }));
    const { manager } = build({
      healthByPort: () => health({ protocolVersion: 99 }),
      onSpawn: () => writeRegistry(entry({ port: DEFAULT_DAEMON_PORT })),
    });

    await expect(manager.ensureDaemon()).rejects.toThrow(/streamd-install/);
  });

  it('throws a readiness-timeout error when the daemon never becomes healthy', async () => {
    /*
    Test Doc:
    - Why: a spawn that never produces a listening daemon (e.g. permission denied) must fail fast, not hang.
    - Contract: registry never appears / health never ok within readinessTimeoutMs → throw.
    - Usage Notes: the 5s budget (Workshop 004) bounds the route's worst-case latency.
    - Quality Contribution: guarantees ensureDaemon terminates so routes return a 5xx instead of hanging.
    - Worked Example: clock advances past the deadline with no healthy daemon → throws timeout.
    */
    const { manager, spawns } = build({
      healthByPort: () => null,
      onSpawn: () => {},
      nowSeq: [0, 100, 500, 5000],
    });

    await expect(manager.ensureDaemon()).rejects.toThrow(/become healthy|timed out|readiness/i);
    expect(spawns).toHaveLength(1);
  });

  it('passes the configured CG_REMOTE_VIEW__DAEMON_PORT override to --port', async () => {
    /*
    Test Doc:
    - Why: tunnel/firewall users pin a known daemon port via config (ADR-0003 CG_* conventions).
    - Contract: daemonPortOverride set → spawn argv uses it for --port (web computes, passes explicit).
    - Usage Notes: the browser still never computes the offset; it reads daemonPort from the registry.
    - Quality Contribution: keeps the override the single knob for port placement.
    - Worked Example: override 7777 → --port 7777 in the spawn argv.
    */
    const { manager, spawns } = build({
      daemonPortOverride: 7777,
      healthByPort: () => (existsSync(registryPath) ? health() : null),
      onSpawn: () => writeRegistry(entry({ port: 7777 })),
    });

    await manager.ensureDaemon();

    expect(spawns[0].args).toContain('7777');
  });
});
