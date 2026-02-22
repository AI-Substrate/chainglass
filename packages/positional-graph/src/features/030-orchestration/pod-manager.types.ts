/**
 * PodManager types: pod lifecycle management and session persistence.
 *
 * PodManager is an internal collaborator — NOT in DI.
 * ODS (Phase 6) creates PodManager directly.
 *
 * @see Workshop #4 (04-work-unit-pods.md)
 */

import type { IAgentInstance } from '@chainglass/shared';
import type { IWorkUnitPod } from './pod.types.js';
import type { IScriptRunner } from './script-runner.types.js';

/**
 * Unit type with its required adapter. Discriminated by unitType.
 *
 * PodManager does NOT resolve adapters — ODS passes them in (DYK-P4#4).
 */
export type PodCreateParams =
  | {
      readonly unitType: 'agent';
      readonly unitSlug: string;
      readonly agentInstance: IAgentInstance;
    }
  | {
      readonly unitType: 'code';
      readonly unitSlug: string;
      readonly runner: IScriptRunner;
      readonly scriptPath: string;
    };

/**
 * Manages pod lifecycle and session persistence for a graph.
 *
 * One PodManager per graph (per-graph, not global).
 * Pods are ephemeral (in-memory); sessions are durable (persisted).
 */
export interface IPodManager {
  /**
   * Create a pod for a node. Returns existing pod if one is active.
   * Throws for user-input unit type (no pod for user-input nodes).
   *
   * @param nodeId - Node to create pod for
   * @param params - Unit type + adapter/runner (DYK-P4#4)
   * @returns The created or existing pod
   */
  createPod(nodeId: string, params: PodCreateParams): IWorkUnitPod;

  /**
   * Get the active pod for a node (if any).
   */
  getPod(nodeId: string): IWorkUnitPod | undefined;

  /**
   * Get the stored session ID for a node.
   * Available even after pod is destroyed.
   */
  getSessionId(nodeId: string): string | undefined;

  /**
   * Record a session ID for a node (called after pod.execute returns).
   */
  setSessionId(nodeId: string, sessionId: string): void;

  /**
   * Destroy the active pod for a node. Session ID is retained.
   */
  destroyPod(nodeId: string): void;

  /**
   * Get all tracked sessions (for PositionalGraphReality.podSessions).
   */
  getSessions(): ReadonlyMap<string, string>;

  /**
   * Load persisted sessions from disk.
   * Called on startup/rehydration.
   * If file doesn't exist, starts empty (no error).
   */
  loadSessions(ctx: { readonly worktreePath: string }, graphSlug: string): Promise<void>;

  /**
   * Persist sessions to disk.
   * Called after session changes.
   * Uses atomic write pattern (temp-then-rename).
   */
  persistSessions(ctx: { readonly worktreePath: string }, graphSlug: string): Promise<void>;
}
