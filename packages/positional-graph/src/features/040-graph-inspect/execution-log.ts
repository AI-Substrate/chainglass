/**
 * Plan 076 FX002: Unified Workflow Execution Log — Builder
 *
 * Assembles all existing data (state.json events, pod-sessions, outputs, node statuses)
 * into a single chronological WorkflowExecutionLog. Pure composition — no new data access.
 *
 * Includes automatic diagnostics: STUCK_STARTING, UNWIRED_INPUT, MISSING_UNIT, STALE_LOCK.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { WorkspaceContext } from '@chainglass/workflow';

import type { IPositionalGraphService } from '../../interfaces/index.js';
import type {
  Diagnostic,
  NodeLog,
  TimelineEntry,
  WorkflowExecutionLog,
} from './execution-log.types.js';

const STUCK_THRESHOLD_MS = 60_000;

/**
 * Build a unified execution log from all available workflow data.
 * Reuses the same service reads as inspect.ts — no new data access patterns.
 */
export async function buildExecutionLog(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string
): Promise<WorkflowExecutionLog> {
  const status = await service.getStatus(ctx, graphSlug);
  const state = await service.loadGraphState(ctx, graphSlug);

  // Load pod sessions
  const podSessions = loadPodSessions(ctx.worktreePath, graphSlug);

  // Build per-node logs and timeline entries
  const allTimeline: TimelineEntry[] = [];
  const nodeMap: Record<string, NodeLog> = {};
  let failedCount = 0;
  let runningCount = 0;
  let pendingCount = 0;

  for (const line of status.lines) {
    for (const nodeStatus of line.nodes) {
      const nodeState = state.nodes?.[nodeStatus.nodeId];
      const sessionId = podSessions[nodeStatus.nodeId] ?? null;

      // Count statuses
      if (nodeStatus.status === 'blocked-error') failedCount++;
      else if (nodeStatus.status === 'starting' || nodeStatus.status === 'agent-accepted')
        runningCount++;
      else if (nodeStatus.status === 'pending' || nodeStatus.status === 'ready') pendingCount++;

      // Build timeline entries from node events
      const nodeTimeline: TimelineEntry[] = [];
      const rawEvents = nodeState?.events ?? [];

      for (const evt of rawEvents) {
        nodeTimeline.push({
          timestamp: evt.created_at,
          nodeId: nodeStatus.nodeId,
          unitSlug: nodeStatus.unitSlug,
          event: mapEventType(evt.event_type),
          source: evt.source,
          message: buildEventMessage(evt.event_type, evt.source, nodeStatus.unitSlug, evt.payload),
          detail: evt.payload && Object.keys(evt.payload).length > 0 ? evt.payload : undefined,
        });
      }

      // Add synthetic "started" entry if node has started_at but no explicit start event
      if (nodeState?.started_at && !rawEvents.some((e) => e.event_type === 'node:accepted')) {
        nodeTimeline.unshift({
          timestamp: nodeState.started_at,
          nodeId: nodeStatus.nodeId,
          unitSlug: nodeStatus.unitSlug,
          event: 'started',
          source: 'orchestrator',
          message: `${nodeStatus.unitSlug} started`,
        });
      }

      // Add error entry if node has error but no error event in timeline
      if (nodeState?.error && !rawEvents.some((e) => e.event_type === 'node:error')) {
        nodeTimeline.push({
          timestamp: nodeState.started_at ?? state.updated_at ?? new Date().toISOString(),
          nodeId: nodeStatus.nodeId,
          unitSlug: nodeStatus.unitSlug,
          event: 'error',
          source: 'orchestrator',
          message: `${nodeState.error.code}: ${nodeState.error.message}`,
          detail: nodeState.error,
        });
      }

      // Load saved outputs
      let outputs: Record<string, unknown> = {};
      try {
        const canEndResult = await service.canEnd(ctx, graphSlug, nodeStatus.nodeId);
        const savedNames = canEndResult.savedOutputs ?? [];
        const entries = await Promise.all(
          savedNames.map(async (name) => {
            const data = await service.getOutputData(ctx, graphSlug, nodeStatus.nodeId, name);
            return [name, summarizeOutput(data.value)] as const;
          })
        );
        outputs = Object.fromEntries(entries.filter(([, v]) => v !== undefined));
      } catch {
        // Best effort — outputs may not exist
      }

      // Compute timing
      const startedAt = nodeState?.started_at ?? null;
      const completedAt = nodeState?.completed_at ?? null;
      let durationMs: number | null = null;
      if (startedAt && completedAt) {
        durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      }

      // Compute blockedBy
      const blockedBy: string[] = [];
      const rd = nodeStatus.readyDetail;
      if (!rd.precedingLinesComplete) blockedBy.push('preceding-lines');
      if (!rd.inputsAvailable) blockedBy.push('inputs');
      if (!rd.serialNeighborComplete) blockedBy.push('serial-neighbor');
      if (rd.contextFromReady === false) blockedBy.push('context-source');
      if (!rd.unitFound) blockedBy.push('missing-unit');

      nodeMap[nodeStatus.nodeId] = {
        nodeId: nodeStatus.nodeId,
        unitSlug: nodeStatus.unitSlug,
        unitType: nodeStatus.unitType,
        status: nodeStatus.status,
        timing: { startedAt, completedAt, durationMs },
        error: nodeState?.error
          ? { code: nodeState.error.code, message: nodeState.error.message }
          : null,
        agentSessionId: sessionId,
        events: nodeTimeline,
        outputs,
        blockedBy,
      };

      allTimeline.push(...nodeTimeline);
    }
  }

  // Sort timeline chronologically
  allTimeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Compute workflow-level timing
  const allStartTimes = Object.values(nodeMap)
    .map((n) => n.timing.startedAt)
    .filter(Boolean) as string[];
  const allCompleteTimes = Object.values(nodeMap)
    .map((n) => n.timing.completedAt)
    .filter(Boolean) as string[];
  const wfStartedAt = allStartTimes.length > 0 ? allStartTimes.sort()[0] : null;
  const wfCompletedAt =
    status.status === 'complete' && allCompleteTimes.length > 0
      ? allCompleteTimes.sort().reverse()[0]
      : null;
  const wfDurationMs =
    wfStartedAt && wfCompletedAt
      ? new Date(wfCompletedAt).getTime() - new Date(wfStartedAt).getTime()
      : wfStartedAt
        ? Date.now() - new Date(wfStartedAt).getTime()
        : null;

  // Build diagnostics
  const diagnostics = buildDiagnostics(nodeMap, status, ctx.worktreePath, graphSlug);

  return {
    slug: graphSlug,
    status: status.status,
    timing: {
      startedAt: wfStartedAt,
      completedAt: wfCompletedAt,
      durationMs: wfDurationMs,
    },
    progress: {
      totalNodes: status.totalNodes,
      completedNodes: status.completedNodes,
      failedNodes: failedCount,
      runningNodes: runningCount,
      pendingNodes: pendingCount,
    },
    timeline: allTimeline,
    nodes: nodeMap,
    diagnostics,
  };
}

// ── Helpers ─────────────────────────────────────────────

function loadPodSessions(worktreePath: string, graphSlug: string): Record<string, string> {
  try {
    const path = join(
      worktreePath,
      '.chainglass',
      'data',
      'workflows',
      graphSlug,
      'pod-sessions.json'
    );
    if (!existsSync(path)) return {};
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed.sessions ?? {};
  } catch {
    return {};
  }
}

function mapEventType(eventType: string): string {
  switch (eventType) {
    case 'node:accepted':
      return 'accepted';
    case 'node:completed':
      return 'completed';
    case 'node:error':
      return 'error';
    case 'node:restart':
      return 'restart';
    case 'question:ask':
      return 'question-asked';
    case 'question:answer':
      return 'question-answered';
    case 'progress:update':
      return 'progress';
    default:
      return eventType;
  }
}

function buildEventMessage(
  eventType: string,
  source: string,
  unitSlug: string,
  payload?: Record<string, unknown>
): string {
  switch (eventType) {
    case 'node:accepted':
      return `${unitSlug} accepted by ${source}`;
    case 'node:completed':
      return `${unitSlug} completed`;
    case 'node:error':
      return payload?.code
        ? `${payload.code}: ${String(payload.message ?? 'Unknown error').substring(0, 200)}`
        : `${unitSlug} errored`;
    case 'node:restart':
      return `${unitSlug} restart requested`;
    case 'question:ask':
      return `${unitSlug} asked: "${String(payload?.text ?? '').substring(0, 100)}"`;
    case 'question:answer':
      return `${unitSlug} answered`;
    case 'progress:update':
      return String(payload?.message ?? `${unitSlug} progress update`).substring(0, 200);
    default:
      return `${unitSlug} ${eventType}`;
  }
}

function summarizeOutput(value: unknown): unknown {
  if (typeof value === 'string' && value.length > 200) {
    return `${value.substring(0, 200)}... (${value.length} chars)`;
  }
  return value;
}

/** Build automatic diagnostics from node state. */
function buildDiagnostics(
  nodes: Record<string, NodeLog>,
  status: {
    status: string;
    lines: Array<{
      nodes: Array<{
        readyDetail: { inputsAvailable: boolean; unitFound: boolean };
        inputPack: {
          inputs: Record<string, { status: string; detail: { code?: string; inputName?: string } }>;
        };
      }>;
    }>;
  },
  worktreePath: string,
  graphSlug: string
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const now = Date.now();

  for (const [nodeId, node] of Object.entries(nodes)) {
    // STUCK_STARTING: node at "starting" for too long with no accept event
    if (node.status === 'starting' && node.timing.startedAt) {
      const elapsed = now - new Date(node.timing.startedAt).getTime();
      if (elapsed > STUCK_THRESHOLD_MS) {
        const elapsedStr = formatDuration(elapsed);
        diagnostics.push({
          severity: 'warning',
          nodeId,
          code: 'STUCK_STARTING',
          message: `${node.unitSlug} started ${elapsedStr} ago with no accept event — agent may have failed silently`,
          fix: `Check agent adapter (is GH_TOKEN set?). Check server logs for pod errors. Try: just wf-restart ${graphSlug}`,
        });
      }
    }

    // Node errors
    if (node.error) {
      diagnostics.push({
        severity: 'error',
        nodeId,
        code: node.error.code,
        message: `${node.unitSlug}: ${node.error.message}`,
      });
    }
  }

  // UNWIRED_INPUT: check inputPack for E160 errors
  for (const line of status.lines) {
    for (const nodeStatus of line.nodes) {
      if (nodeStatus.inputPack?.inputs) {
        for (const [inputName, entry] of Object.entries(nodeStatus.inputPack.inputs)) {
          if (entry.status === 'error' && entry.detail?.code === 'E160') {
            diagnostics.push({
              severity: 'error',
              nodeId: (nodeStatus as unknown as { nodeId: string }).nodeId,
              code: 'UNWIRED_INPUT',
              message: `Input "${inputName}" is not wired to any source node`,
              fix: `Wire it: cg wf node set-input ${graphSlug} <nodeId> ${inputName} --from-unit <sourceUnit> --output <outputName>`,
            });
          }
        }
      }
      // MISSING_UNIT
      if (!nodeStatus.readyDetail.unitFound) {
        diagnostics.push({
          severity: 'error',
          nodeId: (nodeStatus as unknown as { nodeId: string }).nodeId,
          code: 'MISSING_UNIT',
          message: `Work unit "${(nodeStatus as unknown as { unitSlug: string }).unitSlug}" not found`,
          fix: 'Create the unit or check the slug spelling',
        });
      }
    }
  }

  // STALE_LOCK: check for drive.lock with dead PID
  try {
    const lockPath = join(
      worktreePath,
      '.chainglass',
      'data',
      'workflows',
      graphSlug,
      'drive.lock'
    );
    if (existsSync(lockPath)) {
      const lockContent = readFileSync(lockPath, 'utf-8').trim();
      const lockPid = Number.parseInt(lockContent, 10);
      if (lockPid > 0) {
        try {
          process.kill(lockPid, 0);
        } catch {
          diagnostics.push({
            severity: 'warning',
            code: 'STALE_LOCK',
            message: `Stale drive lock from PID ${lockPid} (process is dead)`,
            fix: `Remove: rm ${lockPath}`,
          });
        }
      }
    }
  } catch {
    // Best effort
  }

  return diagnostics;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
