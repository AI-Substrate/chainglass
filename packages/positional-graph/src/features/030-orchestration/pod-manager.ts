/**
 * PodManager: real implementation of IPodManager.
 *
 * Manages pod lifecycle (create/get/destroy) and session persistence
 * via atomic writes to pod-sessions.json. Sessions survive pod destruction
 * and server restarts.
 *
 * Internal collaborator — NOT in DI. Created by ODS (Phase 6).
 *
 * @see Workshop #4 (04-work-unit-pods.md)
 */

import type { IFileSystem } from '@chainglass/shared';
import { atomicWriteFile } from '../../services/atomic-file.js';
import type { IPodManager, PodCreateParams } from './pod-manager.types.js';
import { AgentPod } from './pod.agent.js';
import { CodePod } from './pod.code.js';
import type { IWorkUnitPod } from './pod.types.js';

export class PodManager implements IPodManager {
  private readonly pods = new Map<string, IWorkUnitPod>();
  private readonly sessions = new Map<string, string>();

  constructor(private readonly fs: IFileSystem) {}

  createPod(nodeId: string, params: PodCreateParams): IWorkUnitPod {
    const existing = this.pods.get(nodeId);
    if (existing) return existing;

    let pod: IWorkUnitPod;
    switch (params.unitType) {
      case 'agent':
        pod = new AgentPod(nodeId, params.agentInstance, params.unitSlug);
        break;
      case 'code':
        pod = new CodePod(nodeId, params.runner, params.scriptPath, params.unitSlug);
        break;
    }

    this.pods.set(nodeId, pod);
    return pod;
  }

  getPod(nodeId: string): IWorkUnitPod | undefined {
    return this.pods.get(nodeId);
  }

  getSessionId(nodeId: string): string | undefined {
    return this.sessions.get(nodeId);
  }

  setSessionId(nodeId: string, sessionId: string): void {
    this.sessions.set(nodeId, sessionId);
  }

  destroyPod(nodeId: string): void {
    this.pods.delete(nodeId);
  }

  async destroyAllPods(): Promise<void> {
    const terminatePromises = [...this.pods.values()].map((pod) =>
      pod.terminate().catch(() => {
        // Swallow errors — pod may already be finished
      })
    );
    await Promise.all(terminatePromises);
    this.pods.clear();
  }

  getSessions(): ReadonlyMap<string, string> {
    return this.sessions;
  }

  async loadSessions(ctx: { readonly worktreePath: string }, graphSlug: string): Promise<void> {
    const path = sessionsPath(ctx.worktreePath, graphSlug);

    try {
      const content = await this.fs.readFile(path);
      const data = JSON.parse(content) as { sessions: Record<string, string> };

      for (const [nodeId, sessionId] of Object.entries(data.sessions)) {
        this.sessions.set(nodeId, sessionId);
      }
    } catch {
      // File doesn't exist or parse error — start empty
    }
  }

  async persistSessions(ctx: { readonly worktreePath: string }, graphSlug: string): Promise<void> {
    const path = sessionsPath(ctx.worktreePath, graphSlug);

    const data = {
      sessions: Object.fromEntries(this.sessions),
      persisted_at: new Date().toISOString(),
    };

    await atomicWriteFile(this.fs, path, JSON.stringify(data, null, '\t'));
  }
}

function sessionsPath(worktreePath: string, graphSlug: string): string {
  return `${worktreePath}/.chainglass/graphs/${graphSlug}/pod-sessions.json`;
}
