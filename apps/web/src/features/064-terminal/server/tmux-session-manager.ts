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
import { type ProcessTable, parseProcessTable, treeCpuSeconds } from '../lib/process-cpu';
import { type WindowActivityReading, WindowActivityTracker } from '../lib/window-activity';
import type { CommandExecutor, PtyProcess, PtySpawner, TerminalWindow } from '../types';

const TMUX_SESSION_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_SESSION_NAME_LENGTH = 256;
/** One `ps` snapshot serves every tab polling within this window (polls are 2s apart). */
const PROCESS_TABLE_TTL_MS = 1_000;

interface ParsedSession {
  name: string;
  created: number;
  attached: number;
  windows: number;
}

export class TmuxSessionManager {
  private readonly exec: CommandExecutor;
  private readonly spawnPty: PtySpawner;
  /** Per `session:windowId` activity memory; lives as long as this server process. */
  private readonly activity = new WindowActivityTracker();
  /**
   * Async command runner for activity sampling. Absent (tests) = no activity readings. Async on
   * purpose: `ps -A` costs ~70ms on a loaded machine, and the sidecar must not stall terminal
   * traffic for it, so sampling runs as child processes off the event loop.
   */
  private readonly execAsync: ((command: string, args: string[]) => Promise<string>) | undefined;
  /** Latest completed reading per `session:windowId`. */
  private readonly readings = new Map<string, WindowActivityReading>();
  /** At most one sample in flight per session. */
  private readonly sampling = new Set<string>();
  private processTable: { at: number; table: Promise<ProcessTable> } | undefined;

  constructor(
    exec: CommandExecutor,
    spawnPty: PtySpawner,
    execAsync?: (command: string, args: string[]) => Promise<string>
  ) {
    this.exec = exec;
    this.spawnPty = spawnPty;
    this.execAsync = execAsync;
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

  /**
   * Read native indices and active state only from the exact attached session, annotated with
   * CPU-based work activity sampled in the background when async sampling is configured.
   */
  listWindows(sessionName: string): TerminalWindow[] {
    if (!this.validateSessionName(sessionName)) throw new Error('Invalid session name');
    const output = this.exec('tmux', [
      'list-windows',
      '-t',
      `=${sessionName}`,
      '-F',
      '#{window_id}\t#{window_index}\t#{window_active}\t#{window_name}',
    ]);
    const windows = output
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const [id, index, active, ...name] = line.split('\t');
        const reading = this.readings.get(`${sessionName}:${id}`);
        return {
          id,
          index: Number(index),
          name: name.join('\t'),
          active: active === '1',
          idleSeconds: reading?.idleSeconds ?? null,
          activeSeconds: reading?.activeSeconds ?? null,
        };
      });
    // Fire-and-forget: the list returns now with the last completed reading (at most one poll old).
    void this.sampleActivity(sessionName);
    return windows;
  }

  /** Sample CPU for every window of `sessionName` in the background and record readings. */
  private async sampleActivity(sessionName: string): Promise<void> {
    if (!this.execAsync || this.sampling.has(sessionName)) return;
    this.sampling.add(sessionName);
    try {
      const panes = await this.execAsync('tmux', [
        'list-panes',
        '-s',
        '-t',
        `=${sessionName}`,
        '-F',
        '#{window_id}\t#{pane_pid}',
      ]);
      const table = await this.readProcessTable();
      const cpu = new Map<string, number>();
      for (const line of panes.split('\n')) {
        const [windowId, pid] = line.split('\t');
        const seconds = windowId && pid ? treeCpuSeconds(table, Number(pid)) : null;
        if (seconds !== null) cpu.set(windowId, (cpu.get(windowId) ?? 0) + seconds);
      }
      const nowSeconds = Date.now() / 1000;
      const listed = new Set<string>();
      for (const [windowId, seconds] of cpu) {
        const key = `${sessionName}:${windowId}`;
        listed.add(key);
        this.readings.set(key, this.activity.observe(key, seconds, nowSeconds));
      }
      this.activity.retainOnly(`${sessionName}:`, listed);
      for (const key of this.readings.keys()) {
        if (key.startsWith(`${sessionName}:`) && !listed.has(key)) this.readings.delete(key);
      }
    } catch {
      // Activity is decoration; a failed sample leaves the previous readings in place.
    } finally {
      this.sampling.delete(sessionName);
    }
  }

  /** One machine-wide `ps` snapshot, shared by every session sampled within the TTL. */
  private readProcessTable(): Promise<ProcessTable> {
    const now = Date.now();
    if (!this.processTable || now - this.processTable.at >= PROCESS_TABLE_TTL_MS) {
      const exec = this.execAsync as (command: string, args: string[]) => Promise<string>;
      const table = exec('ps', ['-A', '-o', 'pid=,ppid=,time=']).then(parseProcessTable);
      table.catch(() => {
        if (this.processTable?.table === table) this.processTable = undefined;
      });
      this.processTable = { at: now, table };
    }
    return this.processTable.table;
  }

  /** Select one numbered link, even when the same window is linked more than once. */
  selectWindow(sessionName: string, windowId: string, windowIndex: number): TerminalWindow[] {
    if (!this.validateSessionName(sessionName)) throw new Error('Invalid session name');
    if (typeof windowId !== 'string' || !/^@\d+$/.test(windowId)) {
      throw new Error('Invalid window ID');
    }
    if (!Number.isSafeInteger(windowIndex) || windowIndex < 0) {
      throw new Error('Invalid window index');
    }
    const window = this.listWindows(sessionName).find(
      (candidate) => candidate.id === windowId && candidate.index === windowIndex
    );
    if (!window) throw new Error('Window is not in the attached session');
    const target = `=${sessionName}:${window.index}`;
    // -F guards and selects in the same tmux queue turn, without a shell job.
    // The index identifies the link; checking its ID prevents index-reuse races.
    const outcome = this.exec('tmux', [
      'if-shell',
      '-F',
      '-t',
      target,
      `#{==:#{window_id},${window.id}}`,
      `select-window -t '${target}' ; display-message -p window-selected`,
      'display-message -p window-changed',
    ]).trim();
    if (outcome !== 'window-selected') throw new Error('The tmux window changed');
    return this.listWindows(sessionName);
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
