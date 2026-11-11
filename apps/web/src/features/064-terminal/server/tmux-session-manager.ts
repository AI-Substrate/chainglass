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
import { lastTextLine, workRegion } from '../lib/screen-activity';
import {
  BUSY_CPU_FRACTION,
  type WindowActivityReading,
  WindowActivityTracker,
} from '../lib/window-activity';
import { isValidWindowName } from '../lib/window-name-validation';
import type {
  CommandExecutor,
  PaneSeat,
  PtyProcess,
  PtySpawner,
  TerminalWindow,
  TerminalWindowBackground,
} from '../types';

const TMUX_SESSION_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_SESSION_NAME_LENGTH = 256;
/**
 * One machine-wide `ps` snapshot serves every sample within this window. Polls are 2s apart, so
 * CPU rates come from snapshots ~6s apart; rates use the snapshots' own times, never the poll's.
 */
const PROCESS_TABLE_TTL_MS = 5_000;
/** An idle window's screen is re-read at most this often (it cannot change much while idle). */
const QUESTION_RECHECK_MS = 60_000;
/** Screen reads per sample, for windows that produced output since their last read. */
const SCREEN_READS_PER_SAMPLE = 4;
/** Background jobs listed per window (the combined CPU still counts all of them). */
const MAX_LISTED_JOBS = 12;
/** Screen reads per background sample, so hundreds of windows cannot burst tmux. */
const QUESTION_READS_PER_SAMPLE = 2;
/** One pij seat roster read serves every sample within this window. */
const SEATS_TTL_MS = 5_000;
/**
 * One `list-windows` read serves every connection polling a session within this window after it
 * answers (polls are 2s apart). A read still in flight is shared however long it takes.
 */
const WINDOW_LIST_TTL_MS = 1_500;

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
   * Command runner for activity sampling (`list-panes`, one `ps -A` snapshot, screen reads).
   * Absent (tests) = no activity readings.
   */
  private readonly sampleExec: CommandExecutor | undefined;
  /** Latest completed reading per `session:windowId`. */
  private readonly readings = new Map<string, WindowActivityReading>();
  /** Per `session:windowId`: the work region's hash and the window_activity it was read at. */
  private readonly screens = new Map<string, { activityAt: number; hash: string }>();
  /** Per `session:windowId`: cumulative process-tree CPU at the last sample (non-agent windows). */
  private readonly lastTreeCpu = new Map<string, { cpu: number; at: number; busy: boolean }>();
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
  /** Per `session:windowId`: the screen's last line of real text, from the latest read. */
  private readonly lastLines = new Map<string, string | null>();
  /** Per `session:windowId`: the pij seat running there, and its context use. */
  private readonly windowSeats = new Map<string, PaneSeat>();
  private processTable:
    | { at: number; table: Promise<{ table: ProcessTable; seconds: number }> }
    | undefined;
  private readonly readSeats: (() => Promise<PaneSeat[]>) | undefined;
  private seats: { at: number; seats: Promise<PaneSeat[]> } | undefined;
  /** Per session: the latest `list-windows` read, shared while in flight and for the TTL after. */
  private readonly windowLists = new Map<
    string,
    { output: Promise<string>; answeredAt?: number }
  >();

  constructor(
    exec: CommandExecutor,
    spawnPty: PtySpawner,
    sampleExec?: CommandExecutor,
    readSeats?: () => Promise<PaneSeat[]>
  ) {
    this.exec = exec;
    this.spawnPty = spawnPty;
    this.sampleExec = sampleExec;
    this.readSeats = readSeats;
  }

  /** Check if tmux is installed and accessible */
  async isTmuxAvailable(): Promise<boolean> {
    try {
      await this.exec('tmux', ['-V']);
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
  async listSessions(): Promise<ParsedSession[]> {
    try {
      const output = await this.exec('tmux', [
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
   * CPU-based work activity sampled in the background when a sampling runner is configured.
   * `fresh` skips the shared read: a caller that just changed the windows must see the change.
   */
  async listWindows(sessionName: string, fresh = false): Promise<TerminalWindow[]> {
    if (!this.validateSessionName(sessionName)) throw new Error('Invalid session name');
    const output = await this.readWindowList(sessionName, fresh);
    return output
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const [id, index, active, ...name] = line.split('\t');
        const reading = this.readings.get(`${sessionName}:${id}`);
        const seat = this.windowSeats.get(`${sessionName}:${id}`);
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
          lastLine: this.lastLines.get(`${sessionName}:${id}`) ?? null,
          seatId: seat?.id ?? null,
          context: seat?.context ?? null,
        };
      });
  }

  /** Drop the shared window list, so the next poll reads tmux (after a rename, say). */
  forgetWindowList(sessionName: string): void {
    this.windowLists.delete(sessionName);
  }

  /**
   * At most one `list-windows` per session in flight, its answer shared by every connection on
   * that session for {@link WINDOW_LIST_TTL_MS}. Each read that tmux answers also starts one
   * background activity sample (fire-and-forget: the list returns now with the last completed
   * reading, at most one poll old), so N tabs on a session cost one read and one sample per poll.
   */
  private readWindowList(sessionName: string, fresh: boolean): Promise<string> {
    const shared = this.windowLists.get(sessionName);
    if (
      !fresh &&
      shared &&
      (shared.answeredAt === undefined || Date.now() - shared.answeredAt < WINDOW_LIST_TTL_MS)
    ) {
      return shared.output;
    }
    const output = this.exec('tmux', [
      'list-windows',
      '-t',
      `=${sessionName}`,
      '-F',
      '#{window_id}\t#{window_index}\t#{window_active}\t#{window_name}',
    ]);
    const entry: { output: Promise<string>; answeredAt?: number } = { output };
    this.windowLists.set(sessionName, entry);
    output.then(
      () => {
        entry.answeredAt = Date.now();
        void this.sampleActivity(sessionName);
      },
      () => {
        // A failed read is never shared: the next poll asks tmux again.
        if (this.windowLists.get(sessionName) === entry) this.windowLists.delete(sessionName);
      }
    );
    return output;
  }

  /**
   * A seat's window that nobody has named (a blank-named "+" window, an adopted shell) takes the
   * seat's id, as pij names the windows it spawns (Jordan, 2026-10-06). Renaming turns tmux's
   * automatic-rename off, so this happens once, and a window someone named is never touched.
   */
  private async nameWindowsAfterSeats(
    samples: Map<string, { seat: PaneSeat | null; unnamed: boolean }>
  ): Promise<void> {
    for (const [windowId, { seat, unnamed }] of samples) {
      if (!unnamed || !seat || !isValidWindowName(seat.id)) continue;
      try {
        await this.sampleExec?.('tmux', ['rename-window', '-t', windowId, '--', seat.id]);
      } catch {
        // Naming is cosmetic; the next sample tries again.
      }
    }
  }

  /** Sample CPU for every window of `sessionName` in the background and record readings. */
  private async sampleActivity(sessionName: string): Promise<void> {
    if (!this.sampleExec || this.sampling.has(sessionName)) return;
    this.sampling.add(sessionName);
    try {
      const panes = await this.sampleExec('tmux', [
        'list-panes',
        '-s',
        '-t',
        `=${sessionName}`,
        '-F',
        '#{window_id}\t#{pane_pid}\t#{window_activity}\t#{pane_id}\t#{automatic-rename}',
      ]);
      const { table, seconds: tableSeconds } = await this.readProcessTable();
      const seatsByPane = new Map((await this.readSeatsCached()).map((seat) => [seat.pane, seat]));
      const nowSeconds = Date.now() / 1000;
      const previous = this.lastPidCpu.get(sessionName);
      // CPU only moves between snapshots: a sample served the same snapshot keeps its CPU verdicts.
      const freshTable = !previous || tableSeconds > previous.at;
      const pidCpu = new Map<number, number>();

      interface WindowSample {
        agent: { kind: AgentKind; pid: number } | null;
        treeCpu: number;
        activityAt: number;
        jobs: number[];
        seat: PaneSeat | null;
        /** tmux still names the window after its command: nobody has named it. */
        unnamed: boolean;
      }
      const samples = new Map<string, WindowSample>();
      for (const line of panes.split('\n')) {
        const [windowId, pidText, activityText, paneId, autoRename] = line.split('\t');
        if (!windowId || !pidText) continue;
        const panePid = Number(pidText);
        const tree = treeCpuSeconds(table, panePid);
        if (tree === null) continue;
        const sample = samples.get(windowId) ?? {
          agent: null,
          treeCpu: 0,
          activityAt: Number(activityText) || 0,
          jobs: [],
          seat: null,
          unnamed: autoRename === '1',
        };
        sample.treeCpu += tree;
        // A pane id is recycled once its pane closes, so the seat must also be running in it.
        const seat = paneId ? seatsByPane.get(paneId) : undefined;
        if (
          !sample.seat &&
          seat &&
          (seat.pid === panePid || descendantPids(table, panePid).includes(seat.pid))
        ) {
          sample.seat = seat;
        }
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

      await this.nameWindowsAfterSeats(samples);
      const { changed, deferred } = await this.readScreenChanges(sessionName, samples);
      const listed = new Set<string>();
      for (const [windowId, sample] of samples) {
        const key = `${sessionName}:${windowId}`;
        listed.add(key);
        if (sample.agent) this.agentKinds.set(key, sample.agent.kind);
        else this.agentKinds.delete(key);
        if (sample.seat) this.windowSeats.set(key, sample.seat);
        else this.windowSeats.delete(key);
        // A window whose screen moved but was not read this sample (over the read budget) keeps
        // its reading; it is read first next sample, so its working state lags one poll at most.
        if (!deferred.has(windowId)) {
          // Working = the screen above the input box changed (see lib/screen-activity.ts). CPU
          // is no signal for agents: they mostly wait on the model (a working omp measured ~1%).
          // A window with no agent also counts sustained CPU, so a silent build still shows.
          let busy = changed.has(windowId);
          if (!sample.agent) {
            const lastTree = this.lastTreeCpu.get(key);
            if (!lastTree || tableSeconds > lastTree.at) {
              const cpuBusy =
                lastTree !== undefined &&
                (sample.treeCpu - lastTree.cpu) / (tableSeconds - lastTree.at) >= BUSY_CPU_FRACTION;
              this.lastTreeCpu.set(key, { cpu: sample.treeCpu, at: tableSeconds, busy: cpuBusy });
            }
            busy ||= this.lastTreeCpu.get(key)?.busy === true;
          }
          this.readings.set(key, this.activity.observeBusy(key, busy, nowSeconds));
        }
        if (!sample.agent || sample.jobs.length === 0) {
          this.background.delete(key);
        } else if (freshTable) {
          const rates = previous
            ? jobRates(table, sample.jobs, previous, tableSeconds)
            : sample.jobs.map((pid) => ({ pid, rate: 0 }));
          this.background.set(key, {
            jobs: rates.slice(0, MAX_LISTED_JOBS).map(({ pid, rate }) => ({
              label: processLabel(table.args.get(pid) ?? ''),
              cpu: rate,
            })),
            cpu: rates.reduce((sum, { rate }) => sum + rate, 0),
          });
        }
      }
      if (freshTable) this.lastPidCpu.set(sessionName, { at: tableSeconds, cpu: pidCpu });
      this.activity.retainOnly(`${sessionName}:`, listed);
      for (const map of [
        this.readings,
        this.questions,
        this.agentKinds,
        this.background,
        this.screens,
        this.lastTreeCpu,
        this.lastLines,
        this.windowSeats,
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
   * cost nothing. At most {@link SCREEN_READS_PER_SAMPLE} reads per sample, longest-unread first:
   * a window over the budget is `deferred` and goes to the front of the next sample's reads.
   */
  private async readScreenChanges(
    sessionName: string,
    samples: Map<string, { activityAt: number }>
  ): Promise<{ changed: Set<string>; deferred: Set<string> }> {
    const changed = new Set<string>();
    const deferred = new Set<string>();
    const exec = this.sampleExec;
    if (!exec) return { changed, deferred };
    const moved = [...samples]
      .map(([windowId, { activityAt }]) => ({
        windowId,
        activityAt,
        key: `${sessionName}:${windowId}`,
        known: this.screens.get(`${sessionName}:${windowId}`),
      }))
      .filter(({ activityAt, known }) => !known || activityAt > known.activityAt)
      // Never read first, then the window whose last read is oldest.
      .sort((a, b) => (a.known?.activityAt ?? -1) - (b.known?.activityAt ?? -1));
    for (const { windowId } of moved.slice(SCREEN_READS_PER_SAMPLE)) deferred.add(windowId);
    for (const { windowId, activityAt, key, known } of moved.slice(0, SCREEN_READS_PER_SAMPLE)) {
      try {
        const screen = await exec('tmux', ['capture-pane', '-p', '-J', '-t', windowId]);
        const hash = createHash('sha1').update(workRegion(screen)).digest('hex');
        this.lastLines.set(key, lastTextLine(screen));
        if (known && known.hash !== hash) changed.add(windowId);
        this.screens.set(key, { activityAt, hash });
      } catch {
        this.screens.delete(key);
      }
    }
    return { changed, deferred };
  }

  /**
   * Re-read idle windows' screens for a trailing question: on first sight, when a working streak
   * just ended, and otherwise once a minute. Working windows are skipped entirely.
   */
  private async readQuestions(sessionName: string, windowIds: string[]): Promise<void> {
    const exec = this.sampleExec;
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
        this.lastLines.set(key, lastTextLine(screen));
        this.questions.set(key, { asks, readAt: Date.now(), wasActive: false });
      } catch {
        this.questions.delete(key);
      }
    }
  }

  /** The pij seat roster, shared by every session sampled within the TTL; empty when unreadable. */
  private readSeatsCached(): Promise<PaneSeat[]> {
    if (!this.readSeats) return Promise.resolve([]);
    const now = Date.now();
    if (!this.seats || now - this.seats.at >= SEATS_TTL_MS) {
      this.seats = { at: now, seats: this.readSeats().catch(() => []) };
    }
    return this.seats.seats;
  }

  /**
   * One machine-wide `ps` snapshot, shared by every session sampled within the TTL, with the time
   * it was requested (seconds) so CPU rates divide by the snapshots' spacing.
   */
  private readProcessTable(): Promise<{ table: ProcessTable; seconds: number }> {
    const now = Date.now();
    if (!this.processTable || now - this.processTable.at >= PROCESS_TABLE_TTL_MS) {
      const exec = this.sampleExec as CommandExecutor;
      const table = exec('ps', ['-A', '-o', 'pid=,ppid=,time=,args=']).then((output) => ({
        table: parseProcessTable(output),
        seconds: now / 1000,
      }));
      table.catch(() => {
        if (this.processTable?.table === table) this.processTable = undefined;
      });
      this.processTable = { at: now, table };
    }
    return this.processTable.table;
  }

  /** Select one numbered link, even when the same window is linked more than once. */
  async selectWindow(
    sessionName: string,
    windowId: string,
    windowIndex: number
  ): Promise<TerminalWindow[]> {
    if (!this.validateSessionName(sessionName)) throw new Error('Invalid session name');
    if (typeof windowId !== 'string' || !/^@\d+$/.test(windowId)) {
      throw new Error('Invalid window ID');
    }
    if (!Number.isSafeInteger(windowIndex) || windowIndex < 0) {
      throw new Error('Invalid window index');
    }
    const window = (await this.listWindows(sessionName, true)).find(
      (candidate) => candidate.id === windowId && candidate.index === windowIndex
    );
    if (!window) throw new Error('Window is not in the attached session');
    const target = `=${sessionName}:${window.index}`;
    // -F guards and selects in the same tmux queue turn, without a shell job.
    // The index identifies the link; checking its ID prevents index-reuse races.
    const outcome = (
      await this.exec('tmux', [
        'if-shell',
        '-F',
        '-t',
        target,
        `#{==:#{window_id},${window.id}}`,
        `select-window -t '${target}' ; display-message -p window-selected`,
        'display-message -p window-changed',
      ])
    ).trim();
    if (outcome !== 'window-selected') throw new Error('The tmux window changed');
    return this.listWindows(sessionName, true);
  }

  /**
   * Open a named window in the attached session, start `agent` in it, and select it (tmux's
   * new-window selects by default). The agent is typed into the window's own shell rather than
   * run as the window's process, so the user's shell profile loads (PATH for `~/.local/bin/omp`)
   * and the window survives the agent exiting.
   */
  async newWindow(
    sessionName: string,
    cwd: string,
    agent: NewWindowAgent,
    name: string
  ): Promise<TerminalWindow[]> {
    if (!this.validateSessionName(sessionName)) throw new Error('Invalid session name');
    if (!isNewWindowAgent(agent)) throw new Error('Unknown agent');
    // A blank name leaves the window unnamed: tmux shows the running program until pij renames
    // it after the seat (a few seconds after the harness starts). pij leaves user-set names alone.
    const named = name.trim().length > 0;
    if (named && !isValidWindowName(name)) throw new Error('Invalid window name');
    const windowId = (
      await this.exec('tmux', [
        'new-window',
        '-P',
        '-F',
        '#{window_id}',
        '-t',
        `=${sessionName}:`,
        ...(named ? ['-n', name] : []),
        '-c',
        cwd,
      ])
    ).trim();
    if (!/^@\d+$/.test(windowId)) throw new Error('tmux did not report the new window');
    await this.exec('tmux', ['send-keys', '-t', windowId, '-l', NEW_WINDOW_AGENTS[agent].command]);
    await this.exec('tmux', ['send-keys', '-t', windowId, 'Enter']);
    return this.listWindows(sessionName, true);
  }

  /** Check if a specific tmux session exists */
  async hasSession(name: string): Promise<boolean> {
    try {
      await this.exec('tmux', ['has-session', '-t', name]);
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
