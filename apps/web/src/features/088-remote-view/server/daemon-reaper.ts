/**
 * Fail-closed startup reaper for the native `streamd` daemon (Plan 088 Phase 5 — T002).
 *
 * A web crash (e.g. a `tsx watch` SIGKILL) can leave the daemon orphaned with a
 * stale registry file. At web-server boot this reaps THIS web port's orphan so a
 * dev cycle leaves zero orphaned daemons (AC-11).
 *
 * Semantics are copied from `064-terminal/server/pty-registry.ts` (copied, NOT
 * imported — cross-domain rule). The key risk is FALSE POSITIVES: a recorded pid
 * may have been recycled by the OS to an unrelated process. So we signal a pid
 * ONLY when it is both alive AND verifiably our signed daemon (its `ps` command
 * path matches the registry `bundlePath`). Any probe failure ⇒ skip the kill.
 *
 * Per-webPort by construction (`streamd-<webPort>.json`): concurrent worktree web
 * servers run independent daemons and never reap each other (Workshop 004 Q2).
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { type RegistryEntry, streamdRegistryPath } from './daemon-manager';

export type ProcessKiller = (pid: number, signal: NodeJS.Signals | number) => void;
export type CommandExecutor = (cmd: string, args: string[]) => string;

export interface ReapDeps {
  exec: CommandExecutor;
  killer: ProcessKiller;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
}

export type ReapReason =
  | 'reaped'
  | 'no-registry'
  | 'invalid-registry'
  | 'cleaned-dead'
  | 'left-mismatch';

export interface ReapResult {
  reaped: boolean;
  killedPid: number | null;
  reason: ReapReason;
}

/**
 * `kill(pid, 0)`: alive unless the process is gone (ESRCH). EPERM ⇒ exists.
 * (Copied from pty-registry.isProcessAlive — cross-domain copy, not import.)
 */
export function isProcessAlive(pid: number, killer: ProcessKiller): boolean {
  try {
    killer(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === 'EPERM';
  }
}

/**
 * True only if `ps` reports this pid running OUR signed streamd binary (its
 * command contains the registry `bundlePath` and a `streamd` token). Fails closed:
 * any probe error ⇒ false, so an unverifiable pid is never trusted.
 */
export function isStreamdProcess(pid: number, bundlePath: string, exec: CommandExecutor): boolean {
  try {
    const cmd = exec('ps', ['-o', 'command=', '-p', String(pid)]);
    return cmd.includes(bundlePath) && /\bstreamd\b/.test(cmd);
  } catch {
    return false;
  }
}

/** Read + minimally validate the registry entry; null on any read/parse failure. */
function readEntry(path: string): RegistryEntry | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as RegistryEntry;
    return typeof parsed?.pid === 'number' && parsed.pid > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Reap THIS web port's streamd daemon if it is an orphan from a prior run.
 *
 * - alive AND verifiably ours → graceful `SIGTERM` + delete the registry file;
 * - dead → delete the (stale) registry file, never signal;
 * - alive but not ours (recycled pid) OR unprobeable → NEVER signal; leave the
 *   file for `ensureDaemon` to resolve (it will find it unreachable and respawn).
 */
export function reapStreamdDaemon(
  workspaceRoot: string,
  webPort: number,
  deps: ReapDeps
): ReapResult {
  const path = streamdRegistryPath(workspaceRoot, webPort);
  if (!existsSync(path)) return { reaped: false, killedPid: null, reason: 'no-registry' };

  const entry = readEntry(path);
  if (!entry) return { reaped: false, killedPid: null, reason: 'invalid-registry' };

  if (!isProcessAlive(entry.pid, deps.killer)) {
    rmSync(path, { force: true }); // stale (dead) entry cleaned
    return { reaped: false, killedPid: null, reason: 'cleaned-dead' };
  }

  if (!isStreamdProcess(entry.pid, entry.bundlePath, deps.exec)) {
    // Alive but not verifiably ours → fail closed: never kill, leave the file.
    deps.logger?.warn(
      `remote-view reaper: pid ${entry.pid} alive but not our daemon (or unprobeable); leaving it`
    );
    return { reaped: false, killedPid: null, reason: 'left-mismatch' };
  }

  // Alive AND ours → orphan from a prior run → graceful reap + clean.
  try {
    deps.killer(entry.pid, 'SIGTERM');
  } catch {
    // Raced with exit — ignore.
  }
  rmSync(path, { force: true });
  return { reaped: true, killedPid: entry.pid, reason: 'reaped' };
}
