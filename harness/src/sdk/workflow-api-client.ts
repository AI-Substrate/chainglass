/**
 * WorkflowApiClient — Typed fetch-based SDK for the Workflow REST API.
 *
 * Plan 076 Phase 4 Subtask 001: REST API + SDK.
 *
 * Implements IWorkflowApiClient with native fetch(). Constructor DI for base URL
 * enables both local (localhost:3000) and container (chainglass-wt:3000) usage.
 *
 * Pattern: follows harness health probe (native fetch, try-catch, typed responses).
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

  constructor(config: WorkflowApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.workspaceSlug = config.workspaceSlug;
    this.worktreePath = config.worktreePath;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** POST /execution — Start a workflow. */
  async run(graphSlug: string): Promise<WorkflowRunResult> {
    const url = this.executionUrl(graphSlug);
    const res = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worktreePath: this.worktreePath }),
    });

    const body = await res.json();

    if (!res.ok && res.status !== 409) {
      throw new WorkflowApiError(
        body.error ?? `POST /execution failed: ${res.status}`,
        res.status,
        body,
      );
    }

    return body as WorkflowRunResult;
  }

  /** DELETE /execution — Stop a running workflow. */
  async stop(graphSlug: string): Promise<WorkflowStopResult> {
    const url = this.executionUrl(graphSlug);
    const res = await this.fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worktreePath: this.worktreePath }),
    });

    const body = await res.json();

    if (!res.ok) {
      throw new WorkflowApiError(
        body.error ?? `DELETE /execution failed: ${res.status}`,
        res.status,
        body,
      );
    }

    return body as WorkflowStopResult;
  }

  /** POST /execution/restart — Restart a workflow. */
  async restart(graphSlug: string): Promise<WorkflowRunResult> {
    const url = `${this.executionUrl(graphSlug)}/restart`;
    const res = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worktreePath: this.worktreePath }),
    });

    const body = await res.json();

    if (!res.ok) {
      throw new WorkflowApiError(
        body.error ?? `POST /execution/restart failed: ${res.status}`,
        res.status,
        body,
      );
    }

    return body as WorkflowRunResult;
  }

  /** GET /execution — Poll current execution status. */
  async getStatus(graphSlug: string): Promise<WorkflowExecutionStatus | null> {
    const url = `${this.executionUrl(graphSlug)}?worktreePath=${encodeURIComponent(this.worktreePath)}`;
    const res = await this.fetch(url);

    if (!res.ok) {
      const body = await res.json();
      throw new WorkflowApiError(
        body.error ?? `GET /execution failed: ${res.status}`,
        res.status,
        body,
      );
    }

    const body = await res.json();
    return body as WorkflowExecutionStatus | null;
  }

  /** GET /detailed — Rich per-node diagnostics. */
  async getDetailed(graphSlug: string): Promise<WorkflowDetailedStatus | null> {
    const url = `${this.workflowUrl(graphSlug)}/detailed?worktreePath=${encodeURIComponent(this.worktreePath)}`;
    const res = await this.fetch(url);

    if (!res.ok) {
      const body = await res.json();
      throw new WorkflowApiError(
        body.error ?? `GET /detailed failed: ${res.status}`,
        res.status,
        body,
      );
    }

    const body = await res.json();
    return body as WorkflowDetailedStatus | null;
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
        throw new WorkflowApiError(
          `Request timed out after ${this.timeoutMs}ms: ${url}`,
          0,
        );
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new WorkflowApiError(`Request aborted: ${url}`, 0);
      }
      throw new WorkflowApiError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        0,
      );
    }
  }
}
