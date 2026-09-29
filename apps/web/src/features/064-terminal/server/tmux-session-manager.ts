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

import { createHash } from 'node:crypto';
import { isAbsolute, normalize, relative, resolve } from 'node:path';
import { type AgentKind, findAgent, processLabel } from '../lib/agent-kind';
import { findBackgroundJobs } from '../lib/background-jobs';
import { claudeScreenAsksQuestion } from '../lib/claude-question';
import { NEW_WINDOW_AGENTS, type NewWindowAgent, isNewWindowAgent } from '../lib/new-window-agents';
import {
  type ProcessTable,
  descendantPids,
  parseProcessTable,
  treeCpuSeconds,
} from '../lib/process-cpu';
import { workRegion } from '../lib/screen-activity';
import {
  BUSY_CPU_FRACTION,
  type WindowActivityReading,
  WindowActivityTracker,
} from '../lib/window-activity';
import { isValidWindowName } from '../lib/window-name-validation';
import type {
  CommandExecutor,
  PtyProcess,
  PtySpawner,
  TerminalWindow,
  TerminalWindowBackground,
} from '../types';

const TMUX_SESSION_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_SESSION_NAME_LENGTH = 256;
/** One `ps` snapshot serves every tab polling within this window (polls are 2s apart). */
const PROCESS_TABLE_TTL_MS = 1_000;
/** An idle window's screen is re-read at most this often (it cannot change much while idle). */
const QUESTION_RECHECK_MS = 60_000;
/** Screen reads per sample, for windows that produced output since their last read. */
const SCREEN_READS_PER_SAMPLE = 16;
/** Background jobs listed per window (the combined CPU still counts all of them). */
const MAX_LISTED_JOBS = 12;
/** Screen reads per background sample, so hundreds of windows cannot burst tmux. */
const QUESTION_READS_PER_SAMPLE = 5;

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
  /** Per `session:windowId`: the work region's hash and the window_activity it was read at. */
  private readonly screens = new Map<string, { activityAt: number; hash: string }>();
  /** Per `session:windowId`: cumulative process-tree CPU at the last sample (non-agent windows). */
  private readonly lastTreeCpu = new Map<string, { cpu: number; at: number }>();
  /** Per `session:windowId`: the agent's background jobs, their combined CPU, busiest by name. */
  private readonly background = new Map<string, TerminalWindowBackground>();
  /** Per session: each agent child's cumulative CPU at the last sample, for per-process rates. */
  private readonly lastPidCpu = new Map<string, { at: number; cpu: Map<number, number> }>();
  /** Coding-agent harness per `session:windowId`, from the pane process trees. */
  private readonly agentKinds = new Map<string, AgentKind>();
  /** At most one sample in flight per session. */
  private readonly sampling = new Set<string>();
  /** Per `session:windowId`: does the idle Claude Code screen end in a question, and when read. */
  private readonly questions = new Map<
    string,
    { asks: boolean; readAt: number; wasActive: boolean }
  >();
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
          agent: this.agentKinds.get(`${sessionName}:${id}`) ?? null,
          background: this.background.get(`${sessionName}:${id}`) ?? null,
          // A working window is not waiting on anyone, whatever its screen last said.
          question:
            (reading?.activeSeconds ?? null) === null &&
            this.questions.get(`${sessionName}:${id}`)?.asks === true,
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
        '#{window_id}\t#{pane_pid}\t#{window_activity}',
      ]);
      const table = await this.readProcessTable();
      const nowSeconds = Date.now() / 1000;
      const previous = this.lastPidCpu.get(sessionName);
      const pidCpu = new Map<number, number>();

      interface WindowSample {
        agent: { kind: AgentKind; pid: number } | null;
        treeCpu: number;
        activityAt: number;
        jobs: number[];
      }
      const samples = new Map<string, WindowSample>();
      for (const line of panes.split('\n')) {
        const [windowId, pidText, activityText] = line.split('\t');
        if (!windowId || !pidText) continue;
        const panePid = Number(pidText);
        const tree = treeCpuSeconds(table, panePid);
        if (tree === null) continue;
        const sample = samples.get(windowId) ?? {
          agent: null,
          treeCpu: 0,
          activityAt: Number(activityText) || 0,
          jobs: [],
        };
        sample.treeCpu += tree;
        // First agent found across the window's panes marks the window.
        if (!sample.agent) {
          const agent = findAgent(table, panePid);
          if (agent) {
            sample.agent = agent;
            sample.jobs = findBackgroundJobs(table, agent.pid);
            for (const job of sample.jobs) {
              for (const pid of [job, ...descendantPids(table, job)]) {
                pidCpu.set(pid, table.cpu.get(pid) ?? 0);
              }
            }
          }
        }
        samples.set(windowId, sample);
      }

      const changed = await this.readScreenChanges(sessionName, samples);
      const listed = new Set<string>();
      for (const [windowId, sample] of samples) {
        const key = `${sessionName}:${windowId}`;
        listed.add(key);
        if (sample.agent) this.agentKinds.set(key, sample.agent.kind);
        else this.agentKinds.delete(key);
        // Working = the screen above the input box changed (see lib/screen-activity.ts). CPU is
        // no signal for agents: they mostly wait on the model (a working omp measured ~1%).
        // A window with no agent also counts sustained CPU, so a silent build still shows.
        let busy = changed.has(windowId);
        const lastTree = this.lastTreeCpu.get(key);
        if (!sample.agent && lastTree && nowSeconds > lastTree.at) {
          busy ||=
            (sample.treeCpu - lastTree.cpu) / (nowSeconds - lastTree.at) >= BUSY_CPU_FRACTION;
        }
        this.lastTreeCpu.set(key, { cpu: sample.treeCpu, at: nowSeconds });
        this.readings.set(key, this.activity.observeBusy(key, busy, nowSeconds));
        if (sample.agent && sample.jobs.length > 0) {
          const rates = previous
            ? jobRates(table, sample.jobs, previous, nowSeconds)
            : sample.jobs.map((pid) => ({ pid, rate: 0 }));
          this.background.set(key, {
            jobs: rates.slice(0, MAX_LISTED_JOBS).map(({ pid, rate }) => ({
              label: processLabel(table.args.get(pid) ?? ''),
              cpu: rate,
            })),
            cpu: rates.reduce((sum, { rate }) => sum + rate, 0),
          });
        } else {
          this.background.delete(key);
        }
      }
      this.lastPidCpu.set(sessionName, { at: nowSeconds, cpu: pidCpu });
      this.activity.retainOnly(`${sessionName}:`, listed);
      for (const map of [
        this.readings,
        this.questions,
        this.agentKinds,
        this.background,
        this.screens,
        this.lastTreeCpu,
      ]) {
        for (const key of map.keys()) {
          if (key.startsWith(`${sessionName}:`) && !listed.has(key)) map.delete(key);
        }
      }
      await this.readQuestions(sessionName, [...samples.keys()]);
    } catch {
      // Activity is decoration; a failed sample leaves the previous readings in place.
    } finally {
      this.sampling.delete(sessionName);
    }
  }

  /**
   * Which windows' work region changed since the last sample. A screen is read only when tmux
   * reports output in that window since the last read (window_activity moved), so silent windows
   * cost nothing; at most {@link SCREEN_READS_PER_SAMPLE} reads per sample.
   */
  private async readScreenChanges(
    sessionName: string,
    samples: Map<string, { activityAt: number }>
  ): Promise<Set<string>> {
    const changed = new Set<string>();
    const exec = this.execAsync;
    if (!exec) return changed;
    let reads = 0;
    for (const [windowId, { activityAt }] of samples) {
      const key = `${sessionName}:${windowId}`;
      const known = this.screens.get(key);
      if (known && activityAt <= known.activityAt) continue;
      if (reads >= SCREEN_READS_PER_SAMPLE) break;
      reads += 1;
      try {
        const screen = await exec('tmux', ['capture-pane', '-p', '-J', '-t', windowId]);
        const hash = createHash('sha1').update(workRegion(screen)).digest('hex');
        if (known && known.hash !== hash) changed.add(windowId);
        this.screens.set(key, { activityAt, hash });
      } catch {
        this.screens.delete(key);
      }
    }
    return changed;
  }

  /**
   * Re-read idle windows' screens for a trailing question: on first sight, when a working streak
   * just ended, and otherwise once a minute. Working windows are skipped entirely.
   */
  private async readQuestions(sessionName: string, windowIds: string[]): Promise<void> {
    const exec = this.execAsync;
    if (!exec) return;
    const now = Date.now();
    const due = windowIds.filter((windowId) => {
      const key = `${sessionName}:${windowId}`;
      const active = (this.readings.get(key)?.activeSeconds ?? null) !== null;
      const known = this.questions.get(key);
      if (active) {
        if (known) known.wasActive = true;
        return false;
      }
      return !known || known.wasActive || now - known.readAt >= QUESTION_RECHECK_MS;
    });
    for (const windowId of due.slice(0, QUESTION_READS_PER_SAMPLE)) {
      const key = `${sessionName}:${windowId}`;
      try {
        // Window ids are server-unique; the target resolves to that window's active pane.
        const screen = await exec('tmux', ['capture-pane', '-p', '-J', '-t', windowId]);
        const asks = claudeScreenAsksQuestion(screen) === true;
        this.questions.set(key, { asks, readAt: Date.now(), wasActive: false });
      } catch {
        this.questions.delete(key);
      }
    }
  }

  /** One machine-wide `ps` snapshot, shared by every session sampled within the TTL. */
  private readProcessTable(): Promise<ProcessTable> {
    const now = Date.now();
    if (!this.processTable || now - this.processTable.at >= PROCESS_TABLE_TTL_MS) {
      const exec = this.execAsync as (command: string, args: string[]) => Promise<string>;
      const table = exec('ps', ['-A', '-o', 'pid=,ppid=,time=,args=']).then(parseProcessTable);
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

  /**
   * Open a named window in the attached session, start `agent` in it, and select it (tmux's
   * new-window selects by default). The agent is typed into the window's own shell rather than
   * run as the window's process, so the user's shell profile loads (PATH for `~/.local/bin/omp`)
   * and the window survives the agent exiting.
   */
  newWindow(
    sessionName: string,
    cwd: string,
    agent: NewWindowAgent,
    name: string
  ): TerminalWindow[] {
    if (!this.validateSessionName(sessionName)) throw new Error('Invalid session name');
    if (!isNewWindowAgent(agent)) throw new Error('Unknown agent');
    if (!isValidWindowName(name)) throw new Error('Invalid window name');
    const windowId = this.exec('tmux', [
      'new-window',
      '-P',
      '-F',
      '#{window_id}',
      '-t',
      `=${sessionName}:`,
      '-n',
      name,
      '-c',
      cwd,
    ]).trim();
    if (!/^@\d+$/.test(windowId)) throw new Error('tmux did not report the new window');
    this.exec('tmux', ['send-keys', '-t', windowId, '-l', NEW_WINDOW_AGENTS[agent].command]);
    this.exec('tmux', ['send-keys', '-t', windowId, 'Enter']);
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

/** Each background job's CPU rate (its whole subtree) since the last sample, busiest first. */
function jobRates(
  table: ProcessTable,
  jobs: number[],
  previous: { at: number; cpu: Map<number, number> },
  nowSeconds: number
): Array<{ pid: number; rate: number }> {
  const elapsed = nowSeconds - previous.at;
  if (elapsed <= 0) return [];
  return jobs
    .map((job) => {
      let used = 0;
      for (const pid of [job, ...descendantPids(table, job)]) {
        const now = table.cpu.get(pid) ?? 0;
        // A process born since the last sample has no baseline; count none of its history.
        used += Math.max(0, now - (previous.cpu.get(pid) ?? now));
      }
      return { pid: job, rate: used / elapsed };
    })
    .sort((a, b) => b.rate - a.rate);
}
