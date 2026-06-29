// @vitest-environment node
/**
 * Plan 088 Phase 5 — T001: web-side daemon manager (spawn / poll / version handshake).
 *
 * Drives the spawn-on-demand lifecycle (Workshop 004) against a TEMP registry dir
 * plus an injected spawner + health probe — no live daemon. Proves: spawn when
 * absent, reuse when healthy, respawn on crash + protocol mismatch, the actionable
 * stale-install error, and that `daemonPort` is READ from the registry `port`
 * field (never derived from webPort + offset).
 *
 * The fakes model a REALISTIC daemon lifecycle on a single fixed port: a graceful
 * `/shutdown` frees the port (its `/health` stops answering), and every spawn is a
 * NEW process with a fresh `pid:startedAt` identity. That lets the respawn tests
 * exercise the orphan-on-switch fix — the manager retires the old daemon and waits
 * for its port to free before binding the replacement, and the readiness poll accepts
 * only the freshly-spawned daemon (never the one it just retired).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type DaemonHealth,
  type RegistryEntry,
  createDaemonManager,
  streamdRegistryPath,
} from '@/features/088-remote-view/server/daemon-manager';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WEB_PORT = 4607;
const EXPECTED_PROTOCOL = 1;
const BUNDLE_PATH = '/Apps/ChainglassStreamd.app';
const INNER_BINARY = `${BUNDLE_PATH}/Contents/MacOS/streamd`;
const BOOTSTRAP = '/abs/.chainglass/bootstrap-code.json';
const DEFAULT_DAEMON_PORT = WEB_PORT + 1501; // 6108
const WINDOW_ID = 26516; // a window to capture — the daemon is one-target-per-spawn (Capture.swift)
const OTHER_WINDOW_ID = 34202;
const DISPLAY_ID = 5; // a whole display (screen) to capture — multi-target capture (DisplayCapture.swift)
const BASE_STARTED_MS = 1_700_000_000_000; // a fixed clock base so spawn identities are deterministic

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
    permissions: { screenRecording: 'granted', accessibility: 'granted' },
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

  /** The live-daemon model the fakes mutate: at most one daemon answers on `regPort` at a time. */
  interface DaemonState {
    live: boolean;
    healthValue: DaemonHealth;
    pid: number;
    startedAtMs: number;
  }

  /**
   * Build a manager over a STATEFUL daemon-lifecycle fake. By default: a graceful `/shutdown` (and a
   * hard kill) frees the port (`/health` → null), and every spawn brings up a new process with a
   * fresh `pid:startedAt` identity on the same port answering `spawnHealth`. Tests override the seams
   * (`onSpawn`/`onShutdown`/`fetchHealth`) to model crashes, wedged daemons, and lingering old ones.
   */
  function build(
    opts: {
      /** Port written to the registry + matched by `/health` (proves READ-not-derive). */
      registryPort?: number;
      /** `CG_REMOTE_VIEW__DAEMON_PORT` override → the manager's `--port` arg. */
      daemonPortOverride?: number;
      /** Health each freshly-spawned daemon answers with (by 1-based spawn count); default v1. */
      spawnHealth?: (spawnCount: number) => DaemonHealth;
      /** Replace the default "bring up a fresh daemon" spawn behaviour (e.g. a spawn that never boots). */
      onSpawn?: (state: DaemonState, spawnCount: number) => void;
      /** Replace the default "graceful shutdown frees the port" behaviour (e.g. a wedged daemon). */
      onShutdown?: (state: DaemonState, port: number) => void;
      /** Replace the default `/health` probe (e.g. a lingering old daemon on the shared port). */
      fetchHealth?: (port: number, state: DaemonState) => DaemonHealth | null;
      /** Omit the killProcess dep — model an environment with no hard-kill escalation. */
      noKiller?: boolean;
    } = {}
  ) {
    const regPort = opts.registryPort ?? opts.daemonPortOverride ?? DEFAULT_DAEMON_PORT;
    const spawnHealth = opts.spawnHealth ?? (() => health());
    const spawns: { binary: string; args: string[]; env?: Record<string, string> }[] = [];
    const shutdowns: number[] = [];
    const kills: { pid: number; signal: NodeJS.Signals | number }[] = [];
    const state: DaemonState = {
      live: false,
      healthValue: health(),
      pid: 84210,
      startedAtMs: BASE_STARTED_MS,
    };
    let spawnCount = 0;
    let clock = 0;

    function writeReg(): void {
      writeFileSync(
        registryPath,
        JSON.stringify(
          entry({
            pid: state.pid,
            port: regPort,
            startedAt: new Date(state.startedAtMs).toISOString(),
            protocolVersion: state.healthValue.protocolVersion,
            daemonVersion: state.healthValue.daemonVersion,
          })
        ),
        'utf8'
      );
    }
    /** Bring up a daemon with a NEW process identity (pid + startedAt) on `regPort`. */
    function newIdentity(healthValue: DaemonHealth): void {
      state.pid += 1;
      state.startedAtMs += 1000;
      state.healthValue = healthValue;
      state.live = true;
      writeReg();
    }
    /** Seed a pre-existing LIVE daemon (registry + answering /health) before ensureDaemon runs. */
    function seedLive(h: DaemonHealth = health()): void {
      newIdentity(h);
    }
    /** Seed a CRASHED daemon: registry on disk but nothing answers /health (a stale entry). */
    function seedStale(): void {
      state.pid += 1;
      state.startedAtMs += 1000;
      state.live = false;
      writeReg();
    }

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
        shutdownGraceMs: 200,
      },
      {
        spawnDaemon: (binary, args, env) => {
          spawns.push({ binary, args, env });
          spawnCount += 1;
          if (opts.onSpawn) opts.onSpawn(state, spawnCount);
          else newIdentity(spawnHealth(spawnCount));
        },
        fetchHealth: async (port) =>
          opts.fetchHealth
            ? opts.fetchHealth(port, state)
            : state.live && port === regPort
              ? state.healthValue
              : null,
        shutdownDaemon: async (port) => {
          shutdowns.push(port);
          if (opts.onShutdown) opts.onShutdown(state, port);
          else state.live = false; // graceful death frees the fixed port
        },
        killProcess: opts.noKiller
          ? undefined
          : (pid, signal) => {
              kills.push({ pid, signal });
              state.live = false; // SIGKILL frees the port
            },
        sleep: async () => {},
        now: () => {
          clock += 1; // monotonic auto-clock so grace/readiness deadlines are always reachable
          return clock;
        },
      }
    );
    return { manager, spawns, shutdowns, kills, state, seedLive, seedStale, regPort, writeReg };
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
    const { manager, spawns } = build({ registryPort: REG_PORT });

    const info = await manager.ensureDaemon({ windowId: WINDOW_ID });

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
    // The window the daemon must capture rides as env (the binary requires it; capture-at-spawn).
    expect(spawns[0].env?.CG_REMOTE_VIEW__WINDOW_ID).toBe(String(WINDOW_ID));
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
    const { manager, spawns, seedLive } = build();
    seedLive();

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
    const { manager, spawns, shutdowns, kills, seedStale } = build();
    seedStale();

    const info = await manager.ensureDaemon({ windowId: WINDOW_ID });

    expect(spawns).toHaveLength(1);
    expect(shutdowns).toHaveLength(0); // unreachable → nothing to shut down or kill
    expect(kills).toHaveLength(0);
    expect(info.daemonPort).toBe(DEFAULT_DAEMON_PORT);
  });

  it('gracefully shuts down + respawns on a protocol-version mismatch (no hard kill)', async () => {
    /*
    Test Doc:
    - Why: a running-but-stale daemon must be upgraded, not left serving an old protocol (Workshop 004 handshake).
    - Contract: health ok but protocol != expected → POST /shutdown, wait for the port to free, respawn, accept v1.
    - Usage Notes: graceful shutdown (vs hard kill) lets the daemon send `bye` to a connected viewer first;
      the hard-kill escalation only fires when graceful shutdown does NOT free the port (separate test).
    - Quality Contribution: proves the version handshake drives an orderly upgrade with no kill.
    - Worked Example: health v99 → shutdown(6108) → /health null → respawn → health v1 → returns v1, 0 kills.
    */
    const { manager, spawns, shutdowns, kills, seedLive } = build();
    seedLive(health({ protocolVersion: 99 }));

    const info = await manager.ensureDaemon({ windowId: WINDOW_ID });

    expect(shutdowns).toEqual([DEFAULT_DAEMON_PORT]);
    expect(kills).toHaveLength(0); // graceful shutdown freed the port — no escalation
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
    // Seed + every respawn stay at v99 so the readiness poll never matches and the window expires.
    const { manager, seedLive } = build({ spawnHealth: () => health({ protocolVersion: 99 }) });
    seedLive(health({ protocolVersion: 99 }));

    await expect(manager.ensureDaemon({ windowId: WINDOW_ID })).rejects.toThrow(/streamd-install/);
  });

  it('waits for the freshly-spawned daemon during a target switch — never returns the retired (lingering) one', async () => {
    /*
    Test Doc:
    - Why: THE orphan-on-switch bug. The daemon is one-target-per-spawn on a fixed port; switching targets
      retires the old daemon and spawns a new one on the SAME port. If the old daemon lingers (still
      answering /health for a beat with its stale registry identity), the readiness poll must NOT latch
      onto it — doing so hands the viewport a daemon streaming the OLD target (or mid-exit) → black screen.
    - Contract: after retire+respawn, the poll rejects any resolved daemon whose identity == the retired
      one (pid:startedAt), and accepts only the fresh process — observable here as the NEW daemonVersion.
    - Usage Notes: a pre-existing daemon (an orphan from a prior dev cycle) + a target request is exactly
      the live scenario; the retire path runs because the request's target ≠ the running daemon's.
    - Worked Example: retired daemon answers '0.1.0-OLD' on the shared port for one poll, then the fresh
      '0.1.0-NEW' takes over → ensureDaemon returns NEW (would return OLD if the identity guard were gone).
    */
    let bornNew = false;
    let lingerPolls = 1; // the retired daemon answers on the shared port for one poll post-respawn
    const rig = build({
      // The fresh spawn comes up but its registry is rewritten only after the lingering window closes,
      // so the first post-spawn resolve still sees the RETIRED identity answering '0.1.0-OLD'.
      onSpawn: (state) => {
        bornNew = true;
        state.live = true; // a daemon is answering on the port; registry still shows the retired identity
      },
      fetchHealth: (port, state) => {
        if (!(state.live && port === rig.regPort)) return null;
        if (bornNew && lingerPolls > 0) {
          lingerPolls -= 1;
          if (lingerPolls === 0) {
            // The fresh process now rewrites the registry with its own identity and version.
            state.pid += 1;
            state.startedAtMs += 1000;
            state.healthValue = health({ daemonVersion: '0.1.0-NEW' });
            rig.writeReg();
          }
          return health({ daemonVersion: '0.1.0-OLD' }); // lingering retired daemon (version-matched)
        }
        return state.healthValue;
      },
    });
    // A pre-existing version-matched daemon for a DIFFERENT target (the orphan). Its identity is what the
    // retire path records, and what the lingering '0.1.0-OLD' replies carry until the fresh one rewrites.
    rig.seedLive(health({ daemonVersion: '0.1.0-OLD' }));

    const info = await rig.manager.ensureDaemon({ windowId: WINDOW_ID });

    expect(rig.shutdowns).toEqual([DEFAULT_DAEMON_PORT]); // the orphan was retired
    expect(info.daemonVersion).toBe('0.1.0-NEW'); // accepted the FRESH daemon, not the lingering retired one
  });

  it('hard-kills a wedged daemon that ignores graceful /shutdown, so the respawn can bind the port', async () => {
    /*
    Test Doc:
    - Why: the user-reported "it's not shutting down properly" — a daemon that doesn't exit on /shutdown
      keeps the fixed port, so the replacement can never bind and every re-attach is a black screen.
    - Contract: when graceful /shutdown does NOT free the port within the grace window, the manager
      SIGKILLs the retired pid (verifiably alive + ours) so the port frees and the respawn proceeds.
    - Usage Notes: the escalation is bounded by shutdownGraceMs; the killed pid is the retired daemon's.
    - Worked Example: /shutdown leaves the daemon answering → grace expires → kill(pid, SIGKILL) → respawn ok.
    */
    const retiredPidSeen: number[] = [];
    const rig = build({
      onShutdown: (state) => {
        retiredPidSeen.push(state.pid); // remember whose port we're failing to free
        /* wedged: stays live despite /shutdown */
      },
    });
    rig.seedLive(); // a pre-existing daemon for a different target → the request triggers a retire

    const info = await rig.manager.ensureDaemon({ windowId: WINDOW_ID });

    expect(rig.shutdowns).toEqual([DEFAULT_DAEMON_PORT]); // graceful attempt first
    expect(rig.kills).toHaveLength(1); // then the escalation
    expect(rig.kills[0].signal).toBe('SIGKILL');
    expect(rig.kills[0].pid).toBe(retiredPidSeen[0]); // killed the daemon we retired
    expect(info.protocolVersion).toBe(EXPECTED_PROTOCOL); // replacement came up
  });

  it('throws a readiness-timeout error when the daemon never becomes healthy', async () => {
    /*
    Test Doc:
    - Why: a spawn that never produces a listening daemon (e.g. permission denied) must fail fast, not hang.
    - Contract: registry never appears / health never ok within readinessTimeoutMs → throw.
    - Usage Notes: the 5s budget (Workshop 004) bounds the route's worst-case latency.
    - Quality Contribution: guarantees ensureDaemon terminates so routes return a 5xx instead of hanging.
    - Worked Example: spawn boots nothing → clock advances past the deadline → throws timeout.
    */
    const { manager, spawns } = build({ onSpawn: () => {} /* spawn boots nothing */ });

    await expect(manager.ensureDaemon({ windowId: WINDOW_ID })).rejects.toThrow(
      /become healthy|timed out|readiness/i
    );
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
    const { manager, spawns } = build({ daemonPortOverride: 7777 });

    await manager.ensureDaemon({ windowId: WINDOW_ID });

    expect(spawns[0].args).toContain('7777');
  });

  it('reuses the daemon for the SAME window, respawns for a DIFFERENT one (capture is fixed at spawn)', async () => {
    /*
    Test Doc:
    - Why: the daemon captures ONE window set at spawn (Capture.swift/main.swift) and cannot re-target;
      so a re-attach of the same window must reuse the live daemon, but switching windows must respawn.
    - Contract: ensureDaemon({windowId:A}) spawns for A; a second {windowId:A} reuses (no spawn); {windowId:B}
      retires the A-daemon and spawns for B with CG_REMOTE_VIEW__WINDOW_ID=B.
    - Quality Contribution: the regression guard for the live-attach bug (manager never told the daemon its window).
    - Worked Example: attach A, attach A, attach B → 2 spawns (A then B), 1 shutdown, 0 kills (graceful).
    */
    const { manager, spawns, shutdowns, kills } = build();

    await manager.ensureDaemon({ windowId: WINDOW_ID }); // cold: spawn for WINDOW_ID
    await manager.ensureDaemon({ windowId: WINDOW_ID }); // same window: reuse
    await manager.ensureDaemon({ windowId: OTHER_WINDOW_ID }); // switch: retire + respawn

    expect(spawns).toHaveLength(2);
    expect(spawns[0].env?.CG_REMOTE_VIEW__WINDOW_ID).toBe(String(WINDOW_ID));
    expect(spawns[1].env?.CG_REMOTE_VIEW__WINDOW_ID).toBe(String(OTHER_WINDOW_ID));
    expect(shutdowns).toEqual([DEFAULT_DAEMON_PORT]); // the WINDOW_ID daemon retired for the switch
    expect(kills).toHaveLength(0); // graceful shutdown freed the port — no escalation
  });

  it('spawns with CG_REMOTE_VIEW__DISPLAY_ID (not WINDOW_ID) for a whole-display target', async () => {
    /*
    Test Doc:
    - Why: "stream the whole desktop" captures a display, not a window; the daemon reads
      CG_REMOTE_VIEW__DISPLAY_ID and runs DisplayCaptureFrameSource (multi-target capture).
    - Contract: ensureDaemon({displayId:D}) spawns with CG_REMOTE_VIEW__DISPLAY_ID=D and NO WINDOW_ID.
    - Quality Contribution: pins the display-target env threading the picker's screen choice depends on.
    - Worked Example: ensureDaemon({displayId:5}) → spawn env has DISPLAY_ID=5, WINDOW_ID undefined.
    */
    const { manager, spawns } = build();

    await manager.ensureDaemon({ displayId: DISPLAY_ID });

    expect(spawns).toHaveLength(1);
    expect(spawns[0].env?.CG_REMOTE_VIEW__DISPLAY_ID).toBe(String(DISPLAY_ID));
    expect(spawns[0].env?.CG_REMOTE_VIEW__WINDOW_ID).toBeUndefined();
  });

  it('respawns when switching between a window and a display target (capture is fixed at spawn)', async () => {
    /*
    Test Doc:
    - Why: a window daemon and a display daemon are different captures; switching target kinds must
      retire the old daemon and respawn, exactly like switching between two windows.
    - Contract: ensureDaemon({windowId:A}) then ensureDaemon({displayId:D}) → 2 spawns, 1 shutdown,
      and the second spawn carries DISPLAY_ID (not WINDOW_ID).
    - Quality Contribution: the regression guard for the target-kind switch (w:/d: key change → respawn).
    - Worked Example: attach window A, then display D → spawns [WINDOW_ID, DISPLAY_ID], 1 shutdown.
    */
    const { manager, spawns, shutdowns } = build();

    await manager.ensureDaemon({ windowId: WINDOW_ID }); // window target
    await manager.ensureDaemon({ displayId: DISPLAY_ID }); // switch to a display: retire + respawn

    expect(spawns).toHaveLength(2);
    expect(spawns[0].env?.CG_REMOTE_VIEW__WINDOW_ID).toBe(String(WINDOW_ID));
    expect(spawns[1].env?.CG_REMOTE_VIEW__DISPLAY_ID).toBe(String(DISPLAY_ID));
    expect(spawns[1].env?.CG_REMOTE_VIEW__WINDOW_ID).toBeUndefined();
    expect(shutdowns).toEqual([DEFAULT_DAEMON_PORT]);
  });

  it('throws (never cold-spawns a windowless daemon) when no window is given and none is running', async () => {
    /*
    Test Doc:
    - Why: pre-attach /health + /token have no window; the binary refuses to start windowless, so the
      manager must NOT spawn a doomed daemon (the bug: it did, and every call left a dying process + 503).
    - Contract: ensureDaemon() with no running daemon → rejects, 0 spawns.
    - Quality Contribution: pins that the no-window path is reuse-only, never a cold windowless spawn.
    - Worked Example: no registry, ensureDaemon() → throws "attach a window first", spawns 0.
    */
    const { manager, spawns } = build({ onSpawn: () => {} });

    await expect(manager.ensureDaemon()).rejects.toThrow(
      /attach a window first|not running|screen first/i
    );
    expect(spawns).toHaveLength(0);
  });
});
