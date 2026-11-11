/**
 * The terminal sidecar's command runner: `execFile` with an argv array (no shell), off the event
 * loop, bounded by a timeout. The sidecar's one event loop also forwards every terminal's PTY
 * output, so no tmux or `ps` call may block it, and a hung tmux server must cost one failed
 * control reply rather than a frozen sidecar (tmux freeze option A, 2026-11-11).
 */

import { execFile } from 'node:child_process';
import type { CommandExecutor } from '../types';

/** tmux answers in milliseconds; a call still running after this is hung or starved. */
export const COMMAND_TIMEOUT_MS = 3_000;

/** `ps -A` on a busy machine prints a few hundred KB. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

export function createCommandExecutor(timeoutMs: number = COMMAND_TIMEOUT_MS): CommandExecutor {
  // `new Promise`, not `Promise.withResolvers`: the web tsconfig's lib predates ES2024.
  return (command, args) =>
    new Promise((resolve, reject) => {
      execFile(
        command,
        args,
        { encoding: 'utf8', timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES },
        (error, stdout) => {
          if (!error) {
            resolve(stdout);
            return;
          }
          // execFile's own message already names the command ("Command failed: tmux …"),
          // except when it killed the child for running too long.
          const timedOut =
            error.killed === true && error.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
          const name = args[0] ? `${command} ${args[0]}` : command;
          reject(timedOut ? new Error(`${name} timed out after ${timeoutMs}ms`) : error);
        }
      );
    });
}
