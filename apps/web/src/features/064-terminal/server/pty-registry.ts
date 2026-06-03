/**
 * FX001-3: per-sidecar PTY PID registry + startup reaper.
 *
 * The terminal sidecar spawns one `tmux new-session -A` ATTACH CLIENT per
 * WebSocket. node-pty forks those via forkpty()/setsid(), so on a hard SIGKILL
 * of the sidecar (e.g. a `tsx watch` hot-restart) the clients reparent to
 * launchd and keep their slave PTY fds open — macOS won't reclaim the
 * `/dev/ttys*` node. Over a work session this exhausts `kern.tty.ptmx_max`
 * (511) and `openpty()` fails host-wide.
 *
 * `cleanup()` (FX001-2) handles every CATCHABLE shutdown. This module covers the
 * one path we cannot intercept: the next sidecar start reaps the PIDs the prior
 * (crashed) run recorded.
 *
 * Isolation: the state file is keyed by listen PORT, so two concurrent worktree
 * sidecars (which resolve the same workspace-root `.chainglass/`) never reap
 * each other's live clients.
 *
 * Safety: a recorded PID may have been recycled by the OS to an unrelated
 * process. Before SIGKILL we verify (a) the pid is alive and (b) its command is
 * a tmux client. Fails closed — if we cannot verify, we do not kill. We NEVER
 * run `tmux kill-session`: persistent sessions are the feature's whole point;
 * only per-connection attach clients are reaped.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CommandExecutor } from '../types';

export type ProcessKiller = (pid: number, signal: NodeJS.Signals | number) => void;

/** Resolve the per-port PID-registry file under `<root>/.chainglass/`. */
export function pidRegistryPath(root: string, port: number): string {
  return join(root, '.chainglass', `terminal-sidecar-${port}.pids.json`);
}

function readPids(file: string): number[] {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((n) => Number.isInteger(n) && n > 0) : [];
  } catch {
    return [];
  }
}

/** Atomic write (temp + rename) so a crash mid-write can't corrupt the list. */
function writePids(file: string, pids: number[]): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify([...new Set(pids)]), 'utf8');
    renameSync(tmp, file);
  } catch {
    // Best-effort — a registry failure must never break terminal connections.
  }
}

/** Record a live attach-client pid for this sidecar (keyed by listen port). */
export function recordPid(root: string, port: number, pid: number): void {
  const file = pidRegistryPath(root, port);
  const pids = readPids(file);
  if (!pids.includes(pid)) {
    pids.push(pid);
    writePids(file, pids);
  }
}

/** Drop a pid from the registry once its PTY is disposed. */
export function removePid(root: string, port: number, pid: number): void {
  const file = pidRegistryPath(root, port);
  writePids(
    file,
    readPids(file).filter((p) => p !== pid)
  );
}

/** `kill(pid, 0)`: alive unless the process is gone (ESRCH). EPERM ⇒ exists. */
export function isProcessAlive(pid: number, killer: ProcessKiller): boolean {
  try {
    killer(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === 'EPERM';
  }
}

/**
 * True only if `ps` reports this pid as a tmux ATTACH CLIENT (`tmux new-session …`
 * / `tmux attach …`) — NOT the tmux SERVER (`tmux: server`) and not an unrelated
 * process. Killing the server would tear down EVERY session, so the predicate
 * must require a client subcommand, not merely the word "tmux". Fails closed.
 * (Companion review FX001 F002.)
 */
export function isTmuxClient(pid: number, exec: CommandExecutor): boolean {
  try {
    const cmd = exec('ps', ['-o', 'command=', '-p', String(pid)]);
    return /\btmux\b/.test(cmd) && /\b(new-session|attach(-session)?)\b/.test(cmd);
  } catch {
    return false;
  }
}

/**
 * Reap stale attach clients recorded by a prior (crashed) run on this port.
 * Kills a pid ONLY when it is both alive AND still a tmux client (guards against
 * PID reuse), then resets the registry file. Returns the pids actually killed.
 */
export function reapStalePtys(
  root: string,
  port: number,
  exec: CommandExecutor,
  killer: ProcessKiller
): number[] {
  const killed: number[] = [];
  for (const pid of readPids(pidRegistryPath(root, port))) {
    if (isProcessAlive(pid, killer) && isTmuxClient(pid, exec)) {
      try {
        killer(pid, 'SIGKILL');
        killed.push(pid);
      } catch {
        // Raced with exit — ignore.
      }
    }
  }
  writePids(pidRegistryPath(root, port), []); // survivors killed, dead pids dropped
  return killed;
}
