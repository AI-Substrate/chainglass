/**
 * Whether a tmux window is doing work, measured by the CPU its pane processes burn.
 *
 * tmux's own `window_activity` timestamp was tried first and is the wrong signal: it moves on
 * ANY output, so attaching a client or clicking a window (both make programs redraw) flashed
 * windows green, agent interfaces that tick a clock every second read as permanently busy, and a
 * build burning five cores with no output read as idle (measured 2026-09-28, unasphere `main`).
 * CPU separates those cleanly: idle agents sat near 0.5% of a core, working ones well above.
 *
 * A window turns active only after {@link CONFIRM_SAMPLES} consecutive busy samples, so a single
 * redraw burst (a click) never counts, and stays active through
 * {@link WINDOW_QUIET_GRACE_SECONDS} of quiet, so an agent pausing on a slow API call does not
 * flicker.
 */

import type { AgentKind } from './agent-kind';

/** A sample is busy at or above this fraction of one core. Idle agents measured ~0.005. */
export const BUSY_CPU_FRACTION = 0.02;

/**
 * Busy bar for an agent's OWN process (its helpers are measured separately). omp idles at ~2.3%
 * on its own (measured 2026-09-29, few samples), Claude at 0.3–1%.
 */
/**
 * An agent's subprocesses count as busy when at least ONE child uses this much of a core. Summing
 * them misfires: four idle helpers at ~0.5% each add up past 2%, while a working dev server or
 * build measured 10–58% (2026-09-29).
 */
export const CHILD_BUSY_FRACTION = 0.03;

export const AGENT_BUSY_FRACTION: Record<AgentKind, number> = {
  claude: BUSY_CPU_FRACTION,
  copilot: BUSY_CPU_FRACTION,
  codex: BUSY_CPU_FRACTION,
  pi: 0.05,
};
/** Consecutive busy samples required before a window turns active. */
export const CONFIRM_SAMPLES = 2;
/** Quiet seconds before an active window turns idle. */
export const WINDOW_QUIET_GRACE_SECONDS = 5;
/** Samples closer together than this reuse the previous reading (two tabs polling at once). */
const MIN_SAMPLE_SECONDS = 1;

interface WindowState {
  cpu: number;
  at: number;
  busyRun: number;
  firstBusyAt: number | null;
  streakStart: number | null;
  quietSince: number | null;
  lastRealAt: number | null;
  reading: WindowActivityReading;
}

export interface WindowActivityReading {
  /** Seconds in the current active streak, or null while idle. */
  activeSeconds: number | null;
  /**
   * Seconds since the window last did real work, or null if chainglass has never seen it work
   * (since this server started) — an unknown, not "idle since restart".
   */
  idleSeconds: number | null;
}

const UNKNOWN: WindowActivityReading = { activeSeconds: null, idleSeconds: null };

export class WindowActivityTracker {
  private readonly windows = new Map<string, WindowState>();

  /** @param cpuSeconds cumulative CPU seconds of the window's process trees, or null if unknown. */
  observe(
    key: string,
    cpuSeconds: number | null,
    nowSeconds: number,
    busyFraction = BUSY_CPU_FRACTION
  ): WindowActivityReading {
    if (cpuSeconds === null) return UNKNOWN;
    const state = this.windows.get(key);
    if (!state) {
      this.windows.set(key, {
        cpu: cpuSeconds,
        at: nowSeconds,
        busyRun: 0,
        firstBusyAt: null,
        streakStart: null,
        quietSince: null,
        lastRealAt: null,
        reading: UNKNOWN,
      });
      return UNKNOWN;
    }
    const elapsed = nowSeconds - state.at;
    if (elapsed < MIN_SAMPLE_SECONDS) return this.read(state, nowSeconds);

    // A negative delta means a process in the tree exited; count the sample as not busy.
    const busy = (cpuSeconds - state.cpu) / elapsed >= busyFraction;
    state.cpu = cpuSeconds;
    return this.step(state, busy, elapsed, nowSeconds);
  }

  /**
   * Record a sample already judged busy or not (e.g. "is any one child process busy"), with the
   * same first-sight, confirmation and quiet-grace rules as {@link observe}.
   */
  observeBusy(key: string, busy: boolean, nowSeconds: number): WindowActivityReading {
    const state = this.windows.get(key);
    if (!state) {
      this.windows.set(key, {
        cpu: 0,
        at: nowSeconds,
        busyRun: 0,
        firstBusyAt: null,
        streakStart: null,
        quietSince: null,
        lastRealAt: null,
        reading: UNKNOWN,
      });
      return UNKNOWN;
    }
    const elapsed = nowSeconds - state.at;
    if (elapsed < MIN_SAMPLE_SECONDS) return this.read(state, nowSeconds);
    return this.step(state, busy, elapsed, nowSeconds);
  }

  private step(
    state: WindowState,
    busy: boolean,
    elapsed: number,
    nowSeconds: number
  ): WindowActivityReading {
    state.at = nowSeconds;
    if (busy) {
      state.busyRun += 1;
      state.firstBusyAt ??= nowSeconds - elapsed;
      state.quietSince = null;
      if (state.streakStart !== null || state.busyRun >= CONFIRM_SAMPLES) {
        state.streakStart ??= state.firstBusyAt;
        state.lastRealAt = nowSeconds;
      }
    } else {
      state.busyRun = 0;
      state.firstBusyAt = null;
      if (state.streakStart !== null) {
        state.quietSince ??= nowSeconds;
        if (nowSeconds - state.quietSince >= WINDOW_QUIET_GRACE_SECONDS) {
          state.streakStart = null;
          state.quietSince = null;
        }
      }
    }
    return this.read(state, nowSeconds);
  }

  /** Forget windows of `prefix` that are no longer listed, so closed windows cannot accumulate. */
  retainOnly(prefix: string, listedKeys: Set<string>): void {
    for (const key of this.windows.keys()) {
      if (key.startsWith(prefix) && !listedKeys.has(key)) this.windows.delete(key);
    }
  }

  private read(state: WindowState, nowSeconds: number): WindowActivityReading {
    if (state.streakStart !== null) {
      return { activeSeconds: Math.floor(nowSeconds - state.streakStart), idleSeconds: 0 };
    }
    return {
      activeSeconds: null,
      idleSeconds:
        state.lastRealAt === null ? null : Math.max(0, Math.floor(nowSeconds - state.lastRealAt)),
    };
  }
}

/** Compact duration label for the window strip: `8s`, `10m`, `1h2m`, `3d`. */
export function formatIdle(idleSeconds: number): string {
  const s = Math.max(0, Math.floor(idleSeconds));
  if (s < 60) return `${s}s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h${rest}m`;
  }
  return `${Math.floor(hours / 24)}d`;
}
