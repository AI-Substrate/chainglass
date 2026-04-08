/**
 * Execution Registry types and Zod schemas.
 * Plan 074: Workflow Execution from Web UI — Phase 5 T001.
 *
 * The registry is a lightweight JSON manifest persisted to
 * ~/.config/chainglass/execution-registry.json (getUserConfigDir).
 * It tracks active/recent executions so that the manager can
 * resume workflows after a server restart.
 */

import { z } from 'zod';
import type { ExecutionKey, ManagerExecutionStatus } from './workflow-execution-manager.types';

// ── Zod Schemas ─────────────────────────────────────────

export const ExecutionRegistryEntrySchema = z.object({
  key: z.string(),
  worktreePath: z.string(),
  graphSlug: z.string(),
  workspaceSlug: z.string(),
  status: z.enum(['idle', 'starting', 'running', 'stopping', 'stopped', 'completed', 'failed']),
  iterations: z.number(),
  startedAt: z.string().nullable(),
  stoppedAt: z.string().nullable(),
});

export const ExecutionRegistrySchema = z.object({
  version: z.literal(1),
  updatedAt: z.string(),
  executions: z.array(ExecutionRegistryEntrySchema),
});

// ── TypeScript Types (derived from Zod) ─────────────────

export type ExecutionRegistryEntry = z.infer<typeof ExecutionRegistryEntrySchema>;
export type ExecutionRegistry = z.infer<typeof ExecutionRegistrySchema>;

// ── Interface for DI injection ──────────────────────────

export interface IExecutionRegistry {
  read(): ExecutionRegistry;
  write(registry: ExecutionRegistry): void;
  remove(): void;
}

// ── Helpers ─────────────────────────────────────────────

export function createEmptyRegistry(): ExecutionRegistry {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    executions: [],
  };
}

/** Build a registry entry from an execution handle's serializable fields. */
export function toRegistryEntry(fields: {
  key: ExecutionKey;
  worktreePath: string;
  graphSlug: string;
  workspaceSlug: string;
  status: ManagerExecutionStatus;
  iterations: number;
  startedAt: string | null;
  stoppedAt: string | null;
}): ExecutionRegistryEntry {
  return {
    key: fields.key,
    worktreePath: fields.worktreePath,
    graphSlug: fields.graphSlug,
    workspaceSlug: fields.workspaceSlug,
    status: fields.status,
    iterations: fields.iterations,
    startedAt: fields.startedAt,
    stoppedAt: fields.stoppedAt,
  };
}
