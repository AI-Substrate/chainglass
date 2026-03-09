/**
 * Deterministic port allocator for harness instances.
 *
 * Each worktree gets a stable, unique port range derived from its directory name.
 * This prevents port collisions when running multiple harness instances in parallel
 * across different worktrees (e.g., 066-wf-real-agents, 064-terminal, 063-sidebar).
 *
 * Algorithm:
 *   1. Read the worktree directory name (basename of the git repo root)
 *   2. Hash it to a slot number in range [0, SLOT_COUNT)
 *   3. Compute ports: app = BASE_APP + slot, terminal = BASE_TERMINAL + slot, cdp = BASE_CDP + slot
 *
 * Ranges (100 slots each):
 *   - App:      3100–3199
 *   - Terminal:  4600–4699
 *   - CDP:      9222–9321
 *
 * The same worktree name always produces the same ports (deterministic).
 * Override with HARNESS_APP_PORT / HARNESS_TERMINAL_PORT / HARNESS_CDP_PORT env vars.
 */

import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BASE_APP = 3100;
const BASE_TERMINAL = 4600;
const BASE_CDP = 9222;
const SLOT_COUNT = 100;

export interface HarnessPorts {
  app: number;
  terminal: number;
  cdp: number;
  slot: number;
  worktree: string;
}

function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getWorktreeName(): string {
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    return path.basename(root);
  } catch {
    return path.basename(process.cwd());
  }
}

export function computeSlot(worktreeName: string): number {
  return djb2Hash(worktreeName) % SLOT_COUNT;
}

export function computePorts(worktreeName?: string): HarnessPorts {
  const name = worktreeName ?? getWorktreeName();
  const slot = computeSlot(name);

  return {
    app: envPort('HARNESS_APP_PORT') ?? BASE_APP + slot,
    terminal: envPort('HARNESS_TERMINAL_PORT') ?? BASE_TERMINAL + slot,
    cdp: envPort('HARNESS_CDP_PORT') ?? BASE_CDP + slot,
    slot,
    worktree: name,
  };
}

function envPort(key: string): number | undefined {
  const val = process.env[key];
  if (!val) return undefined;
  const num = Number.parseInt(val, 10);
  return Number.isNaN(num) ? undefined : num;
}

export function describeAllocation(ports: HarnessPorts): string {
  return [
    `Worktree: ${ports.worktree} (slot ${ports.slot})`,
    `  App:      http://127.0.0.1:${ports.app}`,
    `  Terminal: ws://127.0.0.1:${ports.terminal}`,
    `  CDP:      http://127.0.0.1:${ports.cdp}`,
  ].join('\n');
}
