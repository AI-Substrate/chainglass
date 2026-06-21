// @vitest-environment node
/**
 * Plan 088 Phase 5 — T002: fail-closed startup reaper for the native streamd daemon.
 *
 * Mirrors `064-terminal/server/pty-registry.ts` semantics (copied, not imported —
 * cross-domain). The KEY risk is false-positives: a recorded pid may have been
 * recycled by the OS to an unrelated process. So we kill ONLY a pid that is both
 * alive AND verifiably our signed daemon (its `ps` command path matches the
 * registry `bundlePath`). Any probe failure ⇒ skip the kill. Per-webPort, so
 * concurrent worktree daemons never reap each other (Workshop 004 Q2).
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { streamdRegistryPath } from '@/features/088-remote-view/server/daemon-manager';
import {
  isProcessAlive,
  isStreamdProcess,
  reapStreamdDaemon,
} from '@/features/088-remote-view/server/daemon-reaper';

const WEB_PORT = 4607;
const BUNDLE_PATH = '/Apps/ChainglassStreamd.app';
const INNER = `${BUNDLE_PATH}/Contents/MacOS/streamd`;

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

function regEntry(over: Record<string, unknown> = {}) {
  return {
    pid: 90001,
    port: 6108,
    protocolVersion: 1,
    daemonVersion: '0.1.0',
    bundleId: 'com.chainglass.streamd',
    bundlePath: BUNDLE_PATH,
    startedAt: '2026-06-21T00:00:00.000Z',
    ...over,
  };
}

describe('remote-view daemon reaper (fail-closed)', () => {
  let root: string;
  let registryPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cg-reaper-'));
    registryPath = streamdRegistryPath(root, WEB_PORT);
    mkdirSync(join(root, '.chainglass'), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function write(e: Record<string, unknown>): void {
    writeFileSync(registryPath, JSON.stringify(e), 'utf8');
  }

  /** A killer where signal 0 reports ALIVE (returns) and records real signals. */
  function aliveKiller(killed: Array<[number, NodeJS.Signals | number]>) {
    return (pid: number, sig: NodeJS.Signals | number) => {
      if (sig === 0) return; // alive
      killed.push([pid, sig]);
    };
  }

  it('reaps an orphan: alive pid matching bundlePath → SIGTERM + registry cleaned', () => {
    /*
    Test Doc:
    - Why: a web crash leaves the daemon orphaned with a stale registry; boot must reap it (AC-11).
    - Contract: pid alive AND `ps` path matches bundlePath → graceful SIGTERM + delete registry file.
    - Usage Notes: SIGTERM (not SIGKILL) lets the daemon send `bye` to a connected viewer first.
    - Quality Contribution: proves the no-orphans guarantee after dev cycles.
    - Worked Example: ps shows our inner binary → kill(90001,'SIGTERM'), registry removed.
    */
    write(regEntry({ pid: 90001 }));
    const killed: Array<[number, NodeJS.Signals | number]> = [];
    const res = reapStreamdDaemon(root, WEB_PORT, {
      exec: () => `${INNER} --port 6108 --registry ${registryPath}`,
      killer: aliveKiller(killed),
    });
    expect(res.reaped).toBe(true);
    expect(killed).toEqual([[90001, 'SIGTERM']]);
    expect(existsSync(registryPath)).toBe(false);
  });

  it('cleans a stale entry: dead pid → registry removed, no kill', () => {
    /*
    Test Doc:
    - Why: a daemon that already exited leaves a dead-pid entry to garbage-collect.
    - Contract: kill(pid,0) throws ESRCH ⇒ dead → delete registry file, never signal.
    - Usage Notes: dead-entry cleanup keeps the registry honest for ensureDaemon.
    - Quality Contribution: prevents ensureDaemon from trusting a dead entry.
    - Worked Example: pid gone → file deleted, killed stays empty.
    */
    write(regEntry({ pid: 90002 }));
    const killed: Array<[number, NodeJS.Signals | number]> = [];
    const res = reapStreamdDaemon(root, WEB_PORT, {
      exec: () => INNER,
      killer: (pid, sig) => {
        if (sig === 0) throw errno('ESRCH'); // dead
        killed.push([pid, sig]);
      },
    });
    expect(res.reaped).toBe(false);
    expect(killed).toEqual([]);
    expect(existsSync(registryPath)).toBe(false);
  });

  it('NEVER kills a live pid whose path does not match (recycled pid)', () => {
    /*
    Test Doc:
    - Why: the OS may recycle a dead daemon's pid to an unrelated process — killing it is a disaster.
    - Contract: pid alive but `ps` path != bundlePath → no kill; leave the file for ensureDaemon to respawn.
    - Usage Notes: this is the headline fail-closed guarantee (false-positive prevention).
    - Quality Contribution: the single most important reaper safety property (AC-11 logic).
    - Worked Example: ps shows python3 → no signal, registry left in place.
    */
    write(regEntry({ pid: 90003 }));
    const killed: Array<[number, NodeJS.Signals | number]> = [];
    const res = reapStreamdDaemon(root, WEB_PORT, {
      exec: () => '/usr/bin/python3 /some/recycled/script.py',
      killer: aliveKiller(killed),
    });
    expect(killed).toEqual([]);
    expect(res.reaped).toBe(false);
    expect(existsSync(registryPath)).toBe(true);
  });

  it('NEVER kills when the probe itself fails (ps errors) — fail closed', () => {
    /*
    Test Doc:
    - Why: if we cannot verify identity, we must assume it is NOT ours and refuse to kill.
    - Contract: exec throws → isStreamdProcess false → no kill; file left.
    - Usage Notes: covers locked-down environments where `ps` is unavailable/blocked.
    - Quality Contribution: closes the "uncertain ⇒ kill" hole that breaks fail-closed.
    - Worked Example: ps throws → killed empty, registry preserved.
    */
    write(regEntry({ pid: 90004 }));
    const killed: Array<[number, NodeJS.Signals | number]> = [];
    const res = reapStreamdDaemon(root, WEB_PORT, {
      exec: () => {
        throw new Error('ps unavailable');
      },
      killer: aliveKiller(killed),
    });
    expect(killed).toEqual([]);
    expect(res.reaped).toBe(false);
    expect(existsSync(registryPath)).toBe(true);
  });

  it('is a no-op when no registry file exists for this web port', () => {
    /*
    Test Doc:
    - Why: a fresh machine / first boot has no daemon to reap.
    - Contract: no streamd-<webPort>.json → reason 'no-registry', nothing killed.
    - Usage Notes: per-webPort isolation means other ports' files are ignored entirely.
    - Quality Contribution: keeps boot cheap and side-effect-free in the common case.
    - Worked Example: empty .chainglass → reaped false, reason no-registry.
    */
    const res = reapStreamdDaemon(root, WEB_PORT, { exec: () => '', killer: () => {} });
    expect(res.reaped).toBe(false);
    expect(res.reason).toBe('no-registry');
  });

  it('isProcessAlive: EPERM ⇒ alive, ESRCH ⇒ dead, clean return ⇒ alive', () => {
    /*
    Test Doc:
    - Why: the liveness predicate must treat a permission error as "exists" (not dead).
    - Contract: kill(pid,0) throwing EPERM ⇒ true; ESRCH ⇒ false; no throw ⇒ true.
    - Usage Notes: copied verbatim semantics from pty-registry.isProcessAlive.
    - Quality Contribution: prevents a perms error from being misread as a dead daemon.
    - Worked Example: EPERM → alive; ESRCH → dead.
    */
    expect(isProcessAlive(1, () => {})).toBe(true);
    expect(
      isProcessAlive(1, () => {
        throw errno('EPERM');
      })
    ).toBe(true);
    expect(
      isProcessAlive(1, () => {
        throw errno('ESRCH');
      })
    ).toBe(false);
  });

  it('isStreamdProcess: matches our bundle path, rejects others, fails closed on error', () => {
    /*
    Test Doc:
    - Why: identity must be proven from the live process command, not assumed from the registry.
    - Contract: command contains bundlePath AND a streamd token ⇒ true; else / on throw ⇒ false.
    - Usage Notes: `ps -o command= -p <pid>` is the probe (same idiom as isTmuxClient).
    - Quality Contribution: the matching half of the fail-closed kill gate.
    - Worked Example: our inner binary ⇒ true; an unrelated cmd ⇒ false.
    */
    expect(isStreamdProcess(1, BUNDLE_PATH, () => INNER)).toBe(true); // exact path, no args
    expect(isStreamdProcess(1, BUNDLE_PATH, () => `${INNER} --port 6108`)).toBe(true);
    expect(isStreamdProcess(1, BUNDLE_PATH, () => '/usr/bin/python3 x')).toBe(false);
    expect(isStreamdProcess(1, BUNDLE_PATH, () => `/usr/bin/python3 ${INNER}`)).toBe(false); // F004: argv-only mention
    expect(
      isStreamdProcess(1, BUNDLE_PATH, () => {
        throw new Error('nope');
      })
    ).toBe(false);
  });

  it('NEVER kills a recycled pid whose ARGV merely mentions our binary path (F004)', () => {
    /*
    Test Doc:
    - Why: identity must be the executable, not any argv token, or a recycled pid can be falsely matched.
    - Contract: ps shows `/usr/bin/python3 <innerBinary> …` (exec is python) → no kill; registry left.
    - Usage Notes: regression for F004 — the prior `includes()` predicate matched this argv.
    - Quality Contribution: closes the headline false-positive hole in the fail-closed gate.
    - Worked Example: alive pid, argv mentions our path but exec is python → killed empty, file kept.
    */
    write(regEntry({ pid: 90005 }));
    const killed: Array<[number, NodeJS.Signals | number]> = [];
    const res = reapStreamdDaemon(root, WEB_PORT, {
      exec: () => `/usr/bin/python3 ${INNER} --watch`,
      killer: aliveKiller(killed),
    });
    expect(killed).toEqual([]);
    expect(res.reaped).toBe(false);
    expect(existsSync(registryPath)).toBe(true);
  });
});
