/**
 * Cumulative CPU per process tree, from ONE `ps -A -o pid=,ppid=,time=,args=` snapshot of the whole
 * machine (~40ms for every pane at once, measured 2026-09-28) instead of a probe per window.
 *
 * `time` is `[[dd-]hh:]mm:ss.cc` on macOS (centisecond resolution). Linux procps prints whole
 * seconds, which is too coarse for 2s samples: there, windows will rarely read as active.
 */
export interface ProcessTable {
  cpu: Map<number, number>;
  children: Map<number, number[]>;
  /** Full command line, when the snapshot included an `args` column. */
  args: Map<number, string>;
}

export function parseProcessTable(output: string): ProcessTable {
  const cpu = new Map<number, number>();
  const children = new Map<number, number[]>();
  const args = new Map<number, string>();
  for (const line of output.split('\n')) {
    // args is the free-form last column and may contain spaces, so only split the first three.
    const match = /^\s*(\S+)\s+(\S+)\s+(\S+)\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, pidText, ppidText, time, command] = match;
    const pid = Number(pidText);
    const ppid = Number(ppidText);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !time) continue;
    let seconds = 0;
    for (const part of time.replace('-', ':').split(':')) seconds = seconds * 60 + Number(part);
    if (!Number.isFinite(seconds)) continue;
    cpu.set(pid, seconds);
    if (command) args.set(pid, command);
    const siblings = children.get(ppid);
    if (siblings) siblings.push(pid);
    else children.set(ppid, [pid]);
  }
  return { cpu, children, args };
}

/** Sum CPU seconds of `rootPid` and all its descendants; null when the root is gone. */
export function treeCpuSeconds(table: ProcessTable, rootPid: number): number | null {
  if (!table.cpu.has(rootPid)) return null;
  let total = 0;
  const stack = [rootPid];
  const seen = new Set<number>();
  while (stack.length > 0) {
    const pid = stack.pop() as number;
    if (seen.has(pid)) continue;
    seen.add(pid);
    total += table.cpu.get(pid) ?? 0;
    for (const child of table.children.get(pid) ?? []) stack.push(child);
  }
  return total;
}
