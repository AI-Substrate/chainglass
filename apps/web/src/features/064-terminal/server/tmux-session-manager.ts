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
   * Spawn a PTY attached to a tmux session (create-or-attach atomically).
   * Uses `tmux new-session -A` which attaches if session exists, creates if not.
   */
  spawnAttachedPty(name: string, cwd: string, cols: number, rows: number): PtyProcess {
    return this.spawnPty('tmux', ['new-session', '-A', '-s', name, '-c', cwd], {
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

  /** Get the user's default shell or /bin/bash as fallback */
  getShellFallback(): string {
    return process.env.SHELL || '/bin/bash';
  }
}
