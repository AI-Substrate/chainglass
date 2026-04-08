/**
 * WorkflowApiClient — Typed fetch-based SDK for the Workflow REST API.
 *
 * Plan 076 Phase 4: REST API + SDK.
 *
 * Implements IWorkflowApiClient with native fetch(). Constructor DI for base URL
 * enables both local (localhost:3000) and container (chainglass-wt:3000) usage.
 * Sends X-Local-Token header when localToken is provided (DYK #5).
 */

import type {
  IWorkflowApiClient,
  WorkflowApiClientConfig,
  WorkflowDetailedStatus,
  WorkflowExecutionStatus,
  WorkflowRunResult,
  WorkflowStopResult,
} from './workflow-api-client.interface.js';
import { WorkflowApiError } from './workflow-api-client.interface.js';

const DEFAULT_TIMEOUT_MS = 30_000;

export class WorkflowApiClient implements IWorkflowApiClient {
  private readonly baseUrl: string;
  private readonly workspaceSlug: string;
  private readonly worktreePath: string;
  private readonly timeoutMs: number;
  private readonly localToken?: string;

  constructor(config: WorkflowApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.workspaceSlug = config.workspaceSlug;
    this.worktreePath = config.worktreePath;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.localToken = config.localToken;
  }

  async run(graphSlug: string): Promise<WorkflowRunResult> {
    const url = this.executionUrl(graphSlug);
    const res = await this.fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ worktreePath: this.worktreePath }),
    });

    const body: unknown = await res.json();

    if (!res.ok && res.status !== 409) {
      throw new WorkflowApiError(
        ((body as Record<string, unknown>).error as string) ??
          `POST /execution failed: ${res.status}`,
        res.status,
        body
      );
    }

    return body as WorkflowRunResult;
  }

  async stop(graphSlug: string): Promise<WorkflowStopResult> {
    const url = this.executionUrl(graphSlug);
    const res = await this.fetch(url, {
      method: 'DELETE',
      headers: this.headers(),
      body: JSON.stringify({ worktreePath: this.worktreePath }),
    });

    const body: unknown = await res.json();

    if (!res.ok) {
      throw new WorkflowApiError(
        ((body as Record<string, unknown>).error as string) ??
          `DELETE /execution failed: ${res.status}`,
        res.status,
        body
      );
    }

    return body as WorkflowStopResult;
  }

  async restart(graphSlug: string): Promise<WorkflowRunResult> {
    const url = `${this.executionUrl(graphSlug)}/restart`;
    const res = await this.fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ worktreePath: this.worktreePath }),
    });

    const body: unknown = await res.json();

    if (!res.ok) {
      throw new WorkflowApiError(
        ((body as Record<string, unknown>).error as string) ??
          `POST /execution/restart failed: ${res.status}`,
        res.status,
        body
      );
    }

    return body as WorkflowRunResult;
  }

  async getStatus(graphSlug: string): Promise<WorkflowExecutionStatus | null> {
    const url = `${this.executionUrl(graphSlug)}?worktreePath=${encodeURIComponent(this.worktreePath)}`;
    const res = await this.fetch(url, { headers: this.headers() });

    if (!res.ok) {
      const body: unknown = await res.json();
      throw new WorkflowApiError(
        ((body as Record<string, unknown>).error as string) ??
          `GET /execution failed: ${res.status}`,
        res.status,
        body
      );
    }

    const body: unknown = await res.json();
    return body as WorkflowExecutionStatus | null;
  }

  async getDetailed(graphSlug: string): Promise<WorkflowDetailedStatus | null> {
    const url = `${this.workflowUrl(graphSlug)}/detailed?worktreePath=${encodeURIComponent(this.worktreePath)}`;
    const res = await this.fetch(url, { headers: this.headers() });

    if (!res.ok) {
      const body: unknown = await res.json();
      throw new WorkflowApiError(
        ((body as Record<string, unknown>).error as string) ??
          `GET /detailed failed: ${res.status}`,
        res.status,
        body
      );
    }

    const body: unknown = await res.json();
    return body as WorkflowDetailedStatus | null;
  }

  async getLogs(graphSlug: string): Promise<unknown> {
    const url = `${this.workflowUrl(graphSlug)}/logs?worktreePath=${encodeURIComponent(this.worktreePath)}`;
    const res = await this.fetch(url, { headers: this.headers() });

    if (!res.ok) {
      const body: unknown = await res.json();
      throw new WorkflowApiError(
        ((body as Record<string, unknown>).error as string) ?? `GET /logs failed: ${res.status}`,
        res.status,
        body
      );
    }

    return res.json();
  }

  // ── Headers with optional local token ─────────────────

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.localToken) {
      h['X-Local-Token'] = this.localToken;
    }
    return h;
  }

  // ── URL Builders ──────────────────────────────────────

  private workflowUrl(graphSlug: string): string {
    return `${this.baseUrl}/api/workspaces/${encodeURIComponent(this.workspaceSlug)}/workflows/${encodeURIComponent(graphSlug)}`;
  }

  private executionUrl(graphSlug: string): string {
    return `${this.workflowUrl(graphSlug)}/execution`;
  }

  // ── Fetch wrapper with timeout ────────────────────────

  private async fetch(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new WorkflowApiError(`Request timed out after ${this.timeoutMs}ms: ${url}`, 0);
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new WorkflowApiError(`Request aborted: ${url}`, 0);
      }
      throw new WorkflowApiError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        0
      );
    }
  }
}
