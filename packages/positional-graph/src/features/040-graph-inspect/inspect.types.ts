/**
 * Plan 040: Graph Inspect CLI — Types
 *
 * Data model for `inspectGraph()` results. Consumed by formatters (Phase 2)
 * and CLI handler (Phase 3). Designed to be serializable to JSON.
 *
 * @packageDocumentation
 */

import type { ExecutionStatus } from '../../interfaces/index.js';

// ── Per-Node Result ─────────────────────────────────────

export interface InspectNodeInput {
  readonly fromNode: string;
  readonly fromOutput: string;
  readonly available: boolean;
}

export interface InspectNodeQuestion {
  readonly questionId: string;
  readonly text: string;
  readonly questionType: string;
  readonly answered: boolean;
  readonly answer?: string;
}

export interface InspectNodeError {
  readonly code: string;
  readonly message: string;
  readonly occurredAt: string;
}

export interface InspectNodeEventStamp {
  readonly stampedAt: string;
  readonly action: string;
}

export interface InspectNodeEvent {
  readonly eventId: string;
  readonly type: string;
  readonly actor: string;
  readonly timestamp: string;
  readonly status: string;
  readonly stamps: Record<string, InspectNodeEventStamp>;
}

export interface InspectOrchestratorSettings {
  readonly execution: string;
  readonly waitForPrevious?: boolean;
  readonly noContext?: boolean;
  readonly contextFrom?: string;
}

export interface InspectFileMetadata {
  readonly filename: string;
  readonly sizeBytes: number;
  readonly isBinary: boolean;
  readonly extract?: string;
}

export interface InspectNodeResult {
  readonly nodeId: string;
  readonly unitSlug: string;
  readonly unitType: 'agent' | 'code' | 'user-input' | 'unknown';
  readonly lineIndex: number;
  readonly position: number;
  readonly execution: string;
  readonly status: ExecutionStatus;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly inputs: Record<string, InspectNodeInput>;
  readonly outputs: Record<string, unknown>;
  readonly outputCount: number;
  readonly eventCount: number;
  readonly events: InspectNodeEvent[];
  readonly orchestratorSettings: InspectOrchestratorSettings;
  readonly fileMetadata: Record<string, InspectFileMetadata>;
  readonly questions: InspectNodeQuestion[];
  readonly error?: InspectNodeError;
}

// ── Graph-Level Result ──────────────────────────────────

export interface InspectResult {
  readonly graphSlug: string;
  readonly graphStatus: string;
  readonly updatedAt: string;
  readonly totalNodes: number;
  readonly completedNodes: number;
  readonly failedNodes: number;
  readonly nodes: InspectNodeResult[];
  readonly errors: Array<{ code: string; message: string }>;
}

// ── Helpers ─────────────────────────────────────────────

/** Returns true if a saved output value is a file reference (from save-output-file). */
export function isFileOutput(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('data/outputs/');
}
