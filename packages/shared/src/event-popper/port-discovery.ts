import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

/**
 * Plan 067: Event Popper Infrastructure
 *
 * Port discovery: the server writes `.chainglass/server.json` on boot,
 * and the CLI reads it to discover which port to call.
 */

const SERVER_INFO_FILENAME = 'server.json';

export const ServerInfoSchema = z
  .object({
    port: z.number().int().min(1).max(65535),
    pid: z.number().int().min(1),
    startedAt: z.string().datetime(),
  })
  .strict();

export type ServerInfo = z.infer<typeof ServerInfoSchema>;

function serverInfoPath(worktreePath: string): string {
  return join(worktreePath, '.chainglass', SERVER_INFO_FILENAME);
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
      const { execSync } = require('node:child_process');
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
 * Read server info from `.chainglass/server.json`.
 * Returns null if: file missing, malformed, PID dead, or PID recycled.
 *
 * PID recycling detection: if the PID is alive but the process started
 * after the recorded `startedAt` timestamp, it's a different process.
 */
export function readServerInfo(worktreePath: string): ServerInfo | null {
  const filePath = serverInfoPath(worktreePath);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const result = ServerInfoSchema.safeParse(parsed);

    if (!result.success) {
      return null;
    }

    const info = result.data;

    if (!isPidAlive(info.pid)) {
      return null;
    }

    // PID recycling guard: compare OS-reported process start time against recorded startedAt.
    // If the live process started significantly after our record, it's a different process.
    const recordedStart = new Date(info.startedAt).getTime();
    const liveStart = getProcessStartTime(info.pid);
    if (liveStart !== null && liveStart > recordedStart + 5000) {
      // Live process started >5s after recorded start — different process recycled the PID
      return null;
    }

    return info;
  } catch {
    return null;
  }
}

/**
 * Write server info to `.chainglass/server.json`.
 * Uses atomic write (temp file + rename) to prevent partial reads.
 */
export function writeServerInfo(worktreePath: string, info: ServerInfo): void {
  const filePath = serverInfoPath(worktreePath);
  const dir = dirname(filePath);

  mkdirSync(dir, { recursive: true });

  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(info, null, 2), 'utf-8');
  renameSync(tmpPath, filePath);
}

/**
 * Remove server info file (cleanup on shutdown).
 */
export function removeServerInfo(worktreePath: string): void {
  const filePath = serverInfoPath(worktreePath);
  try {
    unlinkSync(filePath);
  } catch {
    // Ignore — file may already be gone
  }
}
