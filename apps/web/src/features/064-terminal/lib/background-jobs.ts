import type { ProcessTable } from './process-cpu';

/**
 * Background jobs an agent started (dev servers, test runs, shells), as opposed to the
 * infrastructure every agent keeps running. Classified from command lines, read from live
 * unasphere panes on 2026-09-29:
 *
 * - Infrastructure — skipped with everything under it: tool servers (anything mentioning "mcp":
 *   perplexity-mcp, zen-mcp, `npm exec …/mcp-server`, `uvx mcp-for-blender`), language servers
 *   (omp's `__omp_worker_lsp_mux` → typescript-language-server, rust-analyzer, `ruff server`),
 *   omp's own puppeteer Chrome, and `caffeinate` (Claude keeping the Mac awake).
 * - Pass-through — not a job, but its children may be: omp's `__omp_worker_*` processes (its
 *   daemon broker is where omp parks the dev servers it starts).
 * - Everything else under the agent is a job, counted with its own subtree.
 */
const INFRASTRUCTURE = [
  /mcp/i,
  /__omp_worker_lsp_mux/,
  /language-server|rust-analyzer|pyright|gopls|clangd|\bruff server\b/,
  /\/\.omp\/puppeteer\//,
  /(^|\/)caffeinate(\s|$)/,
];
const PASS_THROUGH = /__omp_worker_/;

/** Root pids of the agent's background jobs. */
export function findBackgroundJobs(table: ProcessTable, agentPid: number): number[] {
  const jobs: number[] = [];
  const stack = [...(table.children.get(agentPid) ?? [])];
  const seen = new Set<number>([agentPid]);
  while (stack.length > 0) {
    const pid = stack.pop() as number;
    if (seen.has(pid)) continue;
    seen.add(pid);
    const args = table.args.get(pid) ?? '';
    if (INFRASTRUCTURE.some((pattern) => pattern.test(args))) continue;
    if (PASS_THROUGH.test(args)) {
      stack.push(...(table.children.get(pid) ?? []));
      continue;
    }
    jobs.push(pid);
  }
  return jobs;
}
