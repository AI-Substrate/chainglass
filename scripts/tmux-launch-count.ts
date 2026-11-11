/**
 * Temporary (tmux freeze option A): count the processes the terminal sidecar launches per minute.
 *
 * Runs the real sidecar (`createTerminalServer`) in-process against the real tmux server and the
 * real `ps`, with a counting executor, and drives it with one fake WebSocket per visible terminal
 * that polls like `terminal-inner.tsx` does. No PTY is attached (fake spawner), and nothing is
 * written to tmux: `capture-pane` and `rename-window` are counted but not run (a capture returns a
 * fresh synthetic screen, so a window whose activity moved reads as changed). Also counts the pij
 * page's `list-windows -a` read (`readTmuxWindowLabels`, every 30 s per open page).
 *
 * Usage: npx tsx scripts/tmux-launch-count.ts --terminals chainglass,unimatrix-main [--pij-pages 1] [--seconds 60]
 */

import { execFile, execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { loadavg } from 'node:os';
import { parseArgs } from 'node:util';
import { readTmuxWindowLabels } from '../apps/web/src/features/089-first-class-pij/server/tmux-windows';
import { createTerminalServer } from '../apps/web/src/features/064-terminal/server/terminal-ws';
import type { WebSocket } from 'ws';
import type { PtyProcess } from '../apps/web/src/features/064-terminal/types';

const { values } = parseArgs({
  options: {
    terminals: { type: 'string', default: '' },
    'pij-pages': { type: 'string', default: '0' },
    seconds: { type: 'string', default: '60' },
  },
});
const sessions = values.terminals.split(',').filter((name) => name.length > 0);
const pijPages = Number(values['pij-pages']);
const seconds = Number(values.seconds);

const counts = new Map<string, number>();
const count = (command: string, args: readonly string[]) => {
  const key = command === 'tmux' ? `tmux ${args.find((arg) => !arg.startsWith('-')) ?? args[0]}` : command;
  counts.set(key, (counts.get(key) ?? 0) + 1);
};
let screens = 0;
/** Writes and screen reads are not run; everything else is. */
const stubbed = (args: readonly string[]): string | undefined => {
  if (args[0] === 'capture-pane') return `synthetic screen ${++screens}\n`;
  if (args[0] === 'rename-window') return '';
  return undefined;
};

const execCommand = (command: string, args: string[]): string => {
  count(command, args);
  return stubbed(args) ?? execFileSync(command, args, { encoding: 'utf8' });
};
const execCommandAsync = (command: string, args: readonly string[]): Promise<string> => {
  count(command, args);
  const stub = stubbed(args);
  if (stub !== undefined) return Promise.resolve(stub);
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  execFile(
    command,
    [...args],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    (error, stdout) => (error ? reject(error) : resolve(stdout))
  );
  return promise;
};

class FakeSocket extends EventEmitter {
  readyState = 1;
  send(_data: string): void {}
  close(): void {
    this.readyState = 3;
  }
}

const fakePty = (): PtyProcess => ({
  pid: 0,
  onData: () => {},
  onExit: () => {},
  write: () => {},
  resize: () => {},
  kill: () => {},
});

const server = createTerminalServer({
  execCommand,
  spawnPty: fakePty,
  execCommandAsync,
});

/** Today's client (terminal-inner.tsx): `windows` at once, then every 2 s while visible. */
const timers: NodeJS.Timeout[] = [];
for (const session of sessions) {
  const socket = new FakeSocket();
  server.handleConnection(socket as unknown as WebSocket, session, process.cwd());
  const refresh = () => socket.emit('message', JSON.stringify({ type: 'windows' }));
  refresh();
  timers.push(setInterval(refresh, 2000));
}
for (let page = 0; page < pijPages; page++) {
  const read = () => void readTmuxWindowLabels((c, a) => execCommandAsync(c, a));
  read();
  timers.push(setInterval(read, 30_000));
}

const loadBefore = loadavg()[0];
setTimeout(() => {
  for (const timer of timers) clearInterval(timer);
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const perMinute = (n: number) => Math.round((n * 60) / seconds);
  console.log(
    JSON.stringify(
      {
        terminals: sessions,
        pijPages,
        seconds,
        launchesPerMinute: perMinute(total),
        byCommandPerMinute: Object.fromEntries(
          [...counts].sort((a, b) => b[1] - a[1]).map(([key, n]) => [key, perMinute(n)])
        ),
        load1: { before: loadBefore, after: loadavg()[0] },
      },
      null,
      2
    )
  );
  server.close();
  process.exit(0);
}, seconds * 1000);
