/**
 * tmux Monitor — Polls all tmux sessions for state changes and POSTs events.
 *
 * Runs inside the terminal sidecar process. Detects bell, busy/idle transitions,
 * title changes, directory changes, and command changes across ALL tmux sessions.
 * Events are POSTed to the Next.js API route which broadcasts via SSE.
 *
 * Separate from the existing pane-title polling loop in terminal-ws.ts (PL-10).
 *
 * Plan 080: tmux Eventing System
 */

import { execFileSync } from 'node:child_process';

const POLL_INTERVAL_MS = 1000;
const SHELLS = new Set(['zsh', 'bash', 'fish', 'sh', 'dash']);

export type TmuxEventType =
  | 'BELL'
  | 'BUSY_START'
  | 'BUSY_END'
  | 'CMD_CHANGE'
  | 'TITLE_CHANGE'
  | 'DIR_CHANGE';

export interface TmuxEvent {
  session: string;
  pane: string;
  event: TmuxEventType;
  data: Record<string, string>;
}

interface PaneState {
  cmd: string;
  title: string;
  path: string;
  bell: string;
  dead: string;
  mode: string;
  activity: string;
}

interface PaneSnapshot {
  session: string;
  pane: string;
  cmd: string;
  title: string;
  path: string;
  bell: string;
  dead: string;
  mode: string;
  activity: string;
}

function isShell(cmd: string): boolean {
  return SHELLS.has(cmd);
}

function snapshotAllPanes(): PaneSnapshot[] {
  try {
    const output = execFileSync(
      'tmux',
      [
        'list-panes',
        '-a',
        '-F',
        '#{session_name}|W#{window_index}_P#{pane_index}|#{pane_current_command}|#{pane_title}|#{pane_current_path}|#{window_bell_flag}|#{pane_dead}|#{pane_in_mode}|#{window_activity}',
      ],
      { encoding: 'utf8', timeout: 5000 }
    );

    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [session, pane, cmd, title, path, bell, dead, mode, activity] = line.split('|');
        return { session, pane, cmd, title, path, bell, dead, mode, activity };
      });
  } catch {
    return [];
  }
}

/**
 * Start the tmux monitor. Returns a cleanup function that stops polling.
 */
export function startTmuxMonitor(nextPort: number): () => void {
  const apiUrl = `http://localhost:${nextPort}/api/tmux/events`;
  const prevState = new Map<string, PaneState>();
  const knownPanes = new Set<string>();

  async function postEvent(event: TmuxEvent): Promise<void> {
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });
    } catch {
      // Server may not be ready yet — silently skip
    }
  }

  function tick(): void {
    const snapshots = snapshotAllPanes();
    const seenThisTick = new Set<string>();

    for (const snap of snapshots) {
      const key = `${snap.session}:${snap.pane}`;
      seenThisTick.add(key);

      const prev = prevState.get(key);

      if (!prev) {
        // First time seeing this pane — seed state, no events
        knownPanes.add(key);
        prevState.set(key, {
          cmd: snap.cmd,
          title: snap.title,
          path: snap.path,
          bell: snap.bell,
          dead: snap.dead,
          mode: snap.mode,
          activity: snap.activity,
        });
        continue;
      }

      // Command changed (busy/idle transition)
      if (snap.cmd !== prev.cmd) {
        const prevIdle = isShell(prev.cmd);
        const nowIdle = isShell(snap.cmd);
        if (prevIdle && !nowIdle) {
          postEvent({
            session: snap.session,
            pane: snap.pane,
            event: 'BUSY_START',
            data: { cmd: snap.cmd, was: prev.cmd },
          });
        } else if (!prevIdle && nowIdle) {
          postEvent({
            session: snap.session,
            pane: snap.pane,
            event: 'BUSY_END',
            data: { finished: prev.cmd },
          });
        } else {
          postEvent({
            session: snap.session,
            pane: snap.pane,
            event: 'CMD_CHANGE',
            data: { from: prev.cmd, to: snap.cmd },
          });
        }
        prev.cmd = snap.cmd;
      }

      // Title changed
      if (snap.title !== prev.title) {
        postEvent({
          session: snap.session,
          pane: snap.pane,
          event: 'TITLE_CHANGE',
          data: { from: prev.title, to: snap.title },
        });
        prev.title = snap.title;
      }

      // CWD changed
      if (snap.path !== prev.path) {
        postEvent({
          session: snap.session,
          pane: snap.pane,
          event: 'DIR_CHANGE',
          data: { from: prev.path, to: snap.path },
        });
        prev.path = snap.path;
      }

      // Bell
      if (snap.bell === '1' && prev.bell === '0') {
        postEvent({
          session: snap.session,
          pane: snap.pane,
          event: 'BELL',
          data: { cmd: snap.cmd, title: snap.title },
        });
      }
      prev.bell = snap.bell;

      prev.dead = snap.dead;
      prev.mode = snap.mode;
      prev.activity = snap.activity;
    }

    // Clean up destroyed panes
    for (const key of knownPanes) {
      if (!seenThisTick.has(key)) {
        knownPanes.delete(key);
        prevState.delete(key);
      }
    }
  }

  const interval = setInterval(() => {
    try {
      tick();
    } catch (error) {
      console.error('[tmux-monitor] tick error (continuing):', error);
    }
  }, POLL_INTERVAL_MS);

  console.log(`[tmux-monitor] Started — polling all tmux sessions, posting to ${apiUrl}`);

  return () => {
    clearInterval(interval);
    console.log('[tmux-monitor] Stopped');
  };
}
