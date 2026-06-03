// @vitest-environment node
// FX001-3: per-port PTY PID registry + startup reaper. Server-side fs/process —
// node env. Uses a temp dir + injected killer/exec (Constitution P4: fakes).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isProcessAlive,
  isTmuxClient,
  pidRegistryPath,
  reapStalePtys,
  recordPid,
  removePid,
} from '@/features/064-terminal/server/pty-registry';
import type { CommandExecutor } from '@/features/064-terminal/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/** Killer that simulates a set of live pids; records SIGKILLs. */
function makeKiller(alivePids: Set<number>) {
  const sigkilled: number[] = [];
  const killer = (pid: number, signal: NodeJS.Signals | number) => {
    if (signal === 0) {
      if (!alivePids.has(pid)) {
        const err = new Error('ESRCH') as NodeJS.ErrnoException;
        err.code = 'ESRCH';
        throw err;
      }
      return;
    }
    sigkilled.push(pid);
  };
  return { killer, sigkilled };
}

/** `ps` fake: pids in tmuxPids report a tmux command line, others report node. */
function makeExec(tmuxPids: Set<number>): CommandExecutor {
  return (command, args) => {
    if (command !== 'ps') throw new Error(`unexpected command ${command}`);
    const pid = Number(args[args.length - 1]);
    return tmuxPids.has(pid) ? `tmux new-session -A -s sess-${pid}` : `node worker-${pid}.js`;
  };
}

describe('pty-registry (FX001-3)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'pty-registry-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('record/remove round-trips pids in a per-port file', () => {
    recordPid(root, 4500, 100);
    recordPid(root, 4500, 200);
    recordPid(root, 4500, 100); // dedup
    const file = pidRegistryPath(root, 4500);
    expect(JSON.parse(readFileSync(file, 'utf8')).sort()).toEqual([100, 200]);

    removePid(root, 4500, 100);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([200]);
  });

  it('keys the registry by port so concurrent sidecars are isolated', () => {
    recordPid(root, 4500, 100);
    recordPid(root, 4501, 900);
    expect(JSON.parse(readFileSync(pidRegistryPath(root, 4500), 'utf8'))).toEqual([100]);
    expect(JSON.parse(readFileSync(pidRegistryPath(root, 4501), 'utf8'))).toEqual([900]);
  });

  it('reaps ONLY pids that are alive AND still tmux clients', () => {
    // 100 alive+tmux (reap), 200 alive+NOT-tmux=reused (skip),
    // 300 alive+tmux (reap), 400 dead (skip).
    recordPid(root, 4500, 100);
    recordPid(root, 4500, 200);
    recordPid(root, 4500, 300);
    recordPid(root, 4500, 400);
    const { killer, sigkilled } = makeKiller(new Set([100, 200, 300]));
    const exec = makeExec(new Set([100, 300]));

    const reaped = reapStalePtys(root, 4500, exec, killer);

    expect(reaped.sort()).toEqual([100, 300]);
    expect(sigkilled.sort()).toEqual([100, 300]);
    // PID-reuse safety: 200 is alive but not a tmux client → never killed.
    expect(sigkilled).not.toContain(200);
    // Registry reset after reap.
    expect(JSON.parse(readFileSync(pidRegistryPath(root, 4500), 'utf8'))).toEqual([]);
  });

  it("reaping one port does not touch another port's live pids", () => {
    recordPid(root, 4500, 100);
    recordPid(root, 4501, 900); // a concurrent sidecar's live client
    const { killer, sigkilled } = makeKiller(new Set([100, 900]));
    const exec = makeExec(new Set([100, 900]));

    reapStalePtys(root, 4500, exec, killer);

    expect(sigkilled).toEqual([100]);
    expect(sigkilled).not.toContain(900);
    // Port 4501's registry untouched.
    expect(JSON.parse(readFileSync(pidRegistryPath(root, 4501), 'utf8'))).toEqual([900]);
  });

  it('isProcessAlive: true for live, false for ESRCH', () => {
    const { killer } = makeKiller(new Set([42]));
    expect(isProcessAlive(42, killer)).toBe(true);
    expect(isProcessAlive(43, killer)).toBe(false);
  });

  it('isTmuxClient: matches tmux command, fails closed on error', () => {
    expect(isTmuxClient(100, makeExec(new Set([100])))).toBe(true);
    expect(isTmuxClient(100, makeExec(new Set()))).toBe(false);
    const throwing: CommandExecutor = () => {
      throw new Error('no such process');
    };
    expect(isTmuxClient(100, throwing)).toBe(false);
  });
});
