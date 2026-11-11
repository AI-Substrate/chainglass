# Plan — tmux freeze option A, chainglass part (DRAFT, awaiting Jordan's go)

Prime: pij-outer-bobcat · 2026-11-11 · Source: `reports/tmux-options-handover-2026-11-11.md`, `reports/tmux-usage-2026-11-11.md`

## Goal

Chainglass stops amplifying a starved machine: no tmux call can stall the terminal sidecar or the Next
server, and the web UI launches far fewer short-lived processes (each launch is also scanned by
Defender/DLP, which the handover measured at ~140% CPU).

## Not chainglass (Jordan / pij-fleet own these)

Biggest load is outside chainglass: 108–155 `copilot` processes (~22 GB, 260–544% CPU), OrbStack 14 GB,
headless-Chrome renders, Defender. Levers: close idle Copilot seats (pij-fleet request already out),
`taskpolicy -b` / `nice -n 19` for renders and builds, the `machine-build` baton (in force), cap
concurrent agents.

## Defender check (prime, 2026-11-11, `mdatp exclusion list` / `mdatp health`)

- Chainglass files are already excluded: folder exclusion `/Users/jordanknight/substrate` covers the repo,
  every worktree, `.next`/Turbopack cache and `node_modules` (accessed by path). Not excluded:
  `~/Library/pnpm/store` (writes on install only).
- The binaries chainglass launches every 2 s are not process-excluded: `/opt/homebrew/Cellar/tmux/3.6a/bin/tmux`,
  `/bin/ps`, node (`/opt/homebrew/Cellar/node/24.7.0/bin/node`).
- Defender is MDM-managed (`managed_by: MDM`), tamper protection `block`, behaviour monitoring on, DLP active.
- Microsoft's docs: macOS exclusions apply to antivirus scanning only, not EDR
  (https://learn.microsoft.com/en-us/defender-endpoint/defender-endpoint-exclusions-overview). So no
  exclusion removes the EDR/DLP cost of each process launch; launching fewer processes is the only lever
  chainglass controls. A tmux process exclusion would only skip AV scans of files tmux opens (small gain);
  a node process exclusion would open a broad gap (node runs the agents) — not recommended.

## Chainglass steps (one worker, one commit per step, each `just fft` under the machine-build baton)

0. **Baseline.** Count tmux/ps launches per minute from the sidecar with one terminal visible, two
   visible, and a pij page open (temporary counter or `ps` sampling; removed after). Same counts after
   each step. Pair with seahorse's 1 Hz `tmux list-panes -a` latency + load + swap logger.
1. **Nothing blocks the sidecar** (`terminal-ws.ts:600-602`). Convert `CommandExecutor` to async
   `execFile` with a timeout (~3 s) and an error naming the command. Callers: `tmux-session-manager.ts`
   (listWindows, selectWindow, newWindow, isAvailable, listSessions, hasSession),
   `tmux-pane-layout.ts`, `resolve-terminal-paths.ts`, `send-prompt-keys.ts`, `pty-registry.ts`
   (`ps` probe), `terminal-ws.ts` (show-buffer, rename-window). PTY output forwarding then never waits
   on tmux. If the async conversion grows, land a one-line `timeout` on `execFileSync` first as a stopgap.
2. **Nothing blocks the Next server** (`app/api/terminal/route.ts:22`). `execSync` → async `execFile`
   with timeout; argv, no shell string.
3. **One poll per session, not per tab.** Client (`terminal-inner.tsx:264-271`): don't send the next
   `windows` until the previous reply arrived; stop polling when `document.visibilityState` is hidden;
   poll only the focused/visible terminal. Server: coalesce `listWindows` per session across
   connections (one in flight, reply shared, short cache ~1.5 s).
4. **Fewer launches per sample** (`tmux-session-manager.ts:43-54`). `PROCESS_TABLE_TTL_MS` 1 s is
   below the 2 s poll, so every poll runs a machine-wide `ps -A`; raise to ~5 s. Lower
   `SCREEN_READS_PER_SAMPLE` 16 → ~4 and `QUESTION_READS_PER_SAMPLE` 5 → ~2. Keep behaviour (working/idle,
   question detection) within one extra poll of today.
5. **Pij page** (`use-pij-fleet.ts:98,400`, `list-windows -a` every 30 s): leave unless step 0 shows it matters.

## Acceptance

- Step 0 baseline vs after: launches per minute per visible terminal reported in a table.
- A hung tmux (simulate with a fake executor) leaves PTY output flowing and returns an error within the timeout.
- `/api/terminal` never blocks other API requests.
- Browser check on Jordan's dev server after his restart: window strip, working/idle dots, question
  markers, send-to-agent, resize mode, copy buffer, rename all still work.
- `just fft` green per step; rules: RULINGS 1-10.
