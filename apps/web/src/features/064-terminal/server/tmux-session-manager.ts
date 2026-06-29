/**
 * TmuxSessionManager — tmux session lifecycle management
 *
 * Provides atomic create-or-attach, session discovery, validation,
 * and fallback to raw shell when tmux is unavailable.
 *
 * All shell interactions are injectable via constructor for testability.
 * Constitution P2: Interface-First, P4: Fakes Over Mocks.
 *
 * Plan 064: Terminal Integration via tmux
 */

import { isAbsolute, normalize, relative, resolve } from 'node:path';
import type { CommandExecutor, PtyProcess, PtySpawner } from '../types';

const TMUX_SESSION_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_SESSION_NAME_LENGTH = 256;

interface ParsedSession {
  name: string;
  created: number;
  attached: number;
  windows: number;
}

export class TmuxSessionManager {
  private readonly exec: CommandExecutor;
  private readonly spawnPty: PtySpawner;

  constructor(exec: CommandExecutor, spawnPty: PtySpawner) {
    this.exec = exec;
    this.spawnPty = spawnPty;
  }

  /** Check if tmux is installed and accessible */
  isTmuxAvailable(): boolean {
    try {
      this.exec('tmux', ['-V']);
      return true;
    } catch {
      return false;
    }
  }

  /** Validate a tmux session name — alphanumeric, hyphens, underscores only */
  validateSessionName(name: string): boolean {
    return (
      name.length > 0 &&
      name.length <= MAX_SESSION_NAME_LENGTH &&
      TMUX_SESSION_NAME_REGEX.test(name) &&
      !name.includes('..')
    );
  }

  /** Validate a CWD path is within an allowed base directory (boundary-safe) */
  validateCwd(cwd: string, allowedBase: string): boolean {
    const resolved = resolve(normalize(cwd));
    const resolvedBase = resolve(normalize(allowedBase));
    const rel = relative(resolvedBase, resolved);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  }

  /** List all tmux sessions with metadata */
  listSessions(): ParsedSession[] {
    try {
      const output = this.exec('tmux', [
        'list-sessions',
        '-F',
        '#{session_name}\t#{session_created}\t#{session_attached}\t#{session_windows}',
      ]);
      return output
        .trim()
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => {
          const [name, created, attached, windows] = line.split('\t');
          return {
            name,
            created: Number.parseInt(created, 10),
            attached: Number.parseInt(attached, 10),
            windows: Number.parseInt(windows, 10),
          };
        });
    } catch {
      return [];
    }
  }

  /** Check if a specific tmux session exists */
  hasSession(name: string): boolean {
    try {
      this.exec('tmux', ['has-session', '-t', name]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure clipboard integration is enabled on the tmux server (idempotent).
   *
   * `set-clipboard on` makes tmux emit an OSC 52 sequence when text is copied
   * (mouse-drag / copy-mode), and `allow-passthrough on` lets that sequence
   * reach the outer terminal — here, xterm.js's ClipboardAddon, which writes it
   * to the browser clipboard. Without these, a drag-select inside tmux never
   * reaches the browser and `tmux show-buffer` is the only (fragile) copy path.
   *
   * Set globally (`-g`) so it applies to every session on the shared server.
   * Failures are swallowed: clipboard sync is a best-effort enhancement and must
   * never block spawning the terminal.
   */
  ensureClipboardOptions(): void {
    try {
      // `set-option -g` needs a running server; on the very first spawn none
      // exists yet. start-server is a no-op when one is already up, so this
      // guarantees the options apply even to the first session created.
      this.exec('tmux', ['start-server']);
      this.exec('tmux', ['set-option', '-g', 'set-clipboard', 'on']);
      this.exec('tmux', ['set-option', '-g', 'allow-passthrough', 'on']);
    } catch {
      // best-effort — never block terminal spawn on clipboard config
    }
  }

  /**
   * Spawn a PTY attached to a tmux session (create-or-attach atomically).
   * Uses `tmux new-session -A` which attaches if session exists, creates if not.
   */
  spawnAttachedPty(name: string, cwd: string, cols: number, rows: number): PtyProcess {
    // Run tmux attach-or-create THROUGH the user's shell, then `exec` that shell
    // when tmux exits. Without the wrapper the PTY's top process IS the tmux
    // client, so Ctrl-D collapsing the last pane kills the PTY and leaves an
    // empty screen. Falling back to an interactive shell mirrors launching tmux
    // from a normal terminal (exit tmux → back at a prompt).
    //
    // Persistence is preserved: on disconnect disposePty() SIGHUPs the wrapper
    // (and its tmux client) before the fallback `exec` runs, so the detached
    // session survives. The PID registry's isTmuxClient() still matches because
    // the wrapper's `ps` command line contains `tmux new-session`.
    //
    // `name` is validated to [A-Za-z0-9_-]+ upstream (validateSessionName); cwd
    // and the shell path are single-quoted for the `-c` string.
    const shell = this.getShellFallback();
    const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
    const launch = `tmux new-session -A -s ${name} -c ${q(cwd)}; exec ${q(shell)}`;
    return this.spawnPty(shell, ['-c', launch], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
    });
  }

  /** Spawn a raw shell PTY (fallback when tmux unavailable) */
  spawnRawShell(cwd: string, cols: number, rows: number): PtyProcess {
    const shell = this.getShellFallback();
    return this.spawnPty(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
    });
  }

  /** Query the pane title for a tmux session (set by xterm OSC escape sequences) */
  getPaneTitle(sessionName: string): string | null {
    try {
      const output = this.exec('tmux', [
        'display-message',
        '-t',
        sessionName,
        '-p',
        '#{pane_title}',
      ]);
      const title = output.trim();
      return title || null;
    } catch {
      return null;
    }
  }

  /** Query pane titles for ALL panes across ALL windows in a session */
  getPaneTitles(sessionName: string): Array<{ pane: string; windowName: string; title: string }> {
    try {
      const output = this.exec('tmux', [
        'list-panes',
        '-t',
        sessionName,
        '-s',
        '-F',
        '#{window_index}.#{pane_index}\t#{window_name}\t#{pane_title}',
      ]);
      return output
        .trim()
        .split('\n')
        .filter((line) => line.includes('\t'))
        .map((line) => {
          const firstTab = line.indexOf('\t');
          const secondTab = line.indexOf('\t', firstTab + 1);
          if (secondTab === -1) {
            return {
              pane: line.slice(0, firstTab),
              windowName: '',
              title: line.slice(firstTab + 1),
            };
          }
          return {
            pane: line.slice(0, firstTab),
            windowName: line.slice(firstTab + 1, secondTab),
            title: line.slice(secondTab + 1),
          };
        });
    } catch {
      return [];
    }
  }

  /**
   * Get the user's default interactive shell. On Windows this is PowerShell
   * (cmd.exe via COMSPEC is deliberately skipped); on unix it's $SHELL, falling
   * back to /bin/bash. Used both as the raw-shell fallback (when tmux is absent)
   * and as the wrapper/fallback shell in spawnAttachedPty.
   */
  getShellFallback(): string {
    if (process.platform === 'win32') {
      return 'powershell.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }
}
