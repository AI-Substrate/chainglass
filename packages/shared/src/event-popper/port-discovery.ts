import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * Plan 067: Event Popper Infrastructure — port discovery.
 *
 * Each running web server writes `.chainglass/servers/<port>.json` on boot and removes it on
 * shutdown. Keying by port lets a production server and a dev server run from the same folder
 * (prod on 3000 for use, dev on another port for work) without one taking over the other's entry.
 *
 * - The server reads its own entry: `readServerInfo(root, currentServerPort())`.
 * - The CLI and other clients pick one: `discoverServerInfo(root)` honours `CG_SERVER_PORT`,
 *   otherwise prefers a production server, then the lowest port.
 */

const SERVERS_DIRNAME = 'servers';

export const ServerModeSchema = z.enum(['dev', 'prod']);
export type ServerMode = z.infer<typeof ServerModeSchema>;

export const ServerInfoSchema = z
  .object({
    port: z.number().int().min(1).max(65535),
    pid: z.number().int().min(1),
    startedAt: z.string().datetime(),
    mode: ServerModeSchema,
    localToken: z.string().min(1).optional(),
  })
  .strict();

export type ServerInfo = z.infer<typeof ServerInfoSchema>;

function serversDir(worktreePath: string): string {
  return join(worktreePath, '.chainglass', SERVERS_DIRNAME);
}

function serverInfoPath(worktreePath: string, port: number): string {
  return join(serversDir(worktreePath), `${port}.json`);
}

/**
 * The port this process serves on. Next sets `process.env.PORT` to the port it actually bound
 * (including an auto-selected one), and the justfile recipes set it for the terminal sidecar.
 */
export function currentServerPort(): number {
  return Number.parseInt(process.env.PORT ?? '3000', 10);
}

/**
 * Check if a process with the given PID is alive.
 * Uses `kill(pid, 0)` which checks existence without sending a signal.
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the OS-reported start time of a process as epoch milliseconds.
 * Returns null if the process doesn't exist or start time can't be read.
 * macOS: reads from `ps -o lstart= -p <pid>`
 * Linux: reads from `/proc/<pid>/stat` field 22 (starttime in jiffies)
 */
function getProcessStartTime(pid: number): number | null {
  try {
    if (process.platform === 'darwin') {
      const output = execSync(`ps -o lstart= -p ${pid}`, {
        encoding: 'utf-8',
        timeout: 3000,
      }).trim();
      if (!output) return null;
      const parsed = new Date(output).getTime();
      return Number.isNaN(parsed) ? null : parsed;
    }
    if (process.platform === 'linux') {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8');
      const fields = stat.split(') ');
      if (fields.length < 2) return null;
      const values = fields[1].split(' ');
      const startTicks = Number.parseInt(values[19], 10); // field 22 (0-indexed after closing paren)
      if (Number.isNaN(startTicks)) return null;
      // Convert ticks to ms: assume 100 Hz (standard on most Linux)
      const uptimeStr = readFileSync('/proc/uptime', 'utf-8').split(' ')[0];
      const uptimeMs = Number.parseFloat(uptimeStr) * 1000;
      const bootTimeMs = Date.now() - uptimeMs;
      return bootTimeMs + (startTicks / 100) * 1000;
    }
    // Unsupported platform — skip recycling check
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse one entry file. Returns null if missing, malformed, PID dead, or PID recycled.
 *
 * PID recycling detection: if the PID is alive but the process started
 * after the recorded `startedAt` timestamp, it's a different process.
 */
function readLiveEntry(filePath: string): ServerInfo | null {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const result = ServerInfoSchema.safeParse(JSON.parse(readFileSync(filePath, 'utf-8')));
    if (!result.success) {
      return null;
    }

    const info = result.data;

    // Inside a container, the host's PID is meaningless — skip PID validation.
    const inContainer = process.env.CHAINGLASS_CONTAINER === 'true';
    if (!inContainer) {
      if (!isPidAlive(info.pid)) {
        return null;
      }

      // PID recycling guard: compare OS-reported process start time against recorded startedAt.
      // If the live process started significantly after our record, it's a different process.
      const recordedStart = new Date(info.startedAt).getTime();
      const liveStart = getProcessStartTime(info.pid);
      if (liveStart !== null && liveStart > recordedStart + 5000) {
        return null;
      }
    }

    return info;
  } catch {
    return null;
  }
}

/**
 * Read the live entry for the server on `port`, or null if none.
 * Server-side callers pass `currentServerPort()` so each server validates its own token.
 */
export function readServerInfo(worktreePath: string, port: number): ServerInfo | null {
  const info = readLiveEntry(serverInfoPath(worktreePath, port));
  return info?.port === port ? info : null;
}

/**
 * Every live server registered under `worktreePath`, production first, then by port.
 */
export function listServerInfo(worktreePath: string): ServerInfo[] {
  let names: string[];
  try {
    names = readdirSync(serversDir(worktreePath));
  } catch {
    return [];
  }
  const live: ServerInfo[] = [];
  for (const name of names) {
    const match = /^(\d+)\.json$/.exec(name);
    if (!match) continue;
    const info = readServerInfo(worktreePath, Number.parseInt(match[1], 10));
    if (info) live.push(info);
  }
  return live.sort((a, b) => {
    if (a.mode !== b.mode) return a.mode === 'prod' ? -1 : 1;
    return a.port - b.port;
  });
}

/**
 * The port a client asked for via `CG_SERVER_PORT`, or undefined when unset.
 * Throws on a value that is not a port, rather than silently picking another server.
 */
export function requestedServerPort(): number | undefined {
  const raw = process.env.CG_SERVER_PORT;
  if (raw === undefined || raw === '') return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`CG_SERVER_PORT must be a port number, got "${raw}"`);
  }
  return port;
}

/**
 * Pick the server a client (CLI, MCP, scripts) should talk to.
 * `CG_SERVER_PORT` selects one exactly; otherwise production wins, then the lowest port.
 */
export function discoverServerInfo(worktreePath: string): ServerInfo | null {
  const port = requestedServerPort();
  if (port !== undefined) return readServerInfo(worktreePath, port);
  return listServerInfo(worktreePath)[0] ?? null;
}

/**
 * Write this server's entry. Uses atomic write (temp file + rename) to prevent partial reads.
 * Only one process can listen on a port, so the entry for `info.port` always belongs to the caller.
 */
export function writeServerInfo(worktreePath: string, info: ServerInfo): void {
  const filePath = serverInfoPath(worktreePath, info.port);
  mkdirSync(serversDir(worktreePath), { recursive: true });

  const tmpPath = `${filePath}.${info.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(info, null, 2), 'utf-8');
  renameSync(tmpPath, filePath);
}

/**
 * Remove the entry for `port` on shutdown — only if `pid` still owns it, so a server that is
 * exiting late cannot delete the entry of the server that replaced it on that port.
 */
export function removeServerInfo(worktreePath: string, port: number, pid: number): void {
  const filePath = serverInfoPath(worktreePath, port);
  try {
    const recorded = JSON.parse(readFileSync(filePath, 'utf-8')) as { pid?: unknown };
    if (recorded.pid === pid) unlinkSync(filePath);
  } catch {
    // Ignore — file may already be gone or unreadable
  }
}
