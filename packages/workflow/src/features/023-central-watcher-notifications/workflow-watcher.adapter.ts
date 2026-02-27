/**
 * Workflow watcher adapter — filters filesystem events for positional graph changes.
 *
 * Emits two event types:
 * - WorkflowStructureChangedEvent: graph.yaml or node.yaml changed (structural)
 * - WorkflowStatusChangedEvent: state.json changed (runtime status)
 *
 * Per Plan 050 Phase 6: Real-Time SSE Updates
 * Per ADR-02: Self-filtering adapter — receives all events, filters internally
 * Per DYK #1: Structural vs runtime distinction — different handling downstream
 */

import type { IWatcherAdapter, WatcherEvent } from './watcher-adapter.interface.js';

export interface WorkflowChangedEvent {
  graphSlug: string;
  workspaceSlug: string;
  worktreePath: string;
  filePath: string;
  changeType: 'structure' | 'status';
  timestamp: Date;
}

type WorkflowChangedCallback = (event: WorkflowChangedEvent) => void;

/** Match graph.yaml in workflows/{slug}/ */
const GRAPH_YAML_REGEX = /workflows\/([^/]+)\/graph\.yaml$/;
/** Match node.yaml in workflows/{slug}/nodes/{nodeId}/ */
const NODE_YAML_REGEX = /workflows\/([^/]+)\/nodes\/[^/]+\/node\.yaml$/;
/** Match state.json in workflows/{slug}/ */
const STATE_JSON_REGEX = /workflows\/([^/]+)\/state\.json$/;

export class WorkflowWatcherAdapter implements IWatcherAdapter {
  readonly name = 'workflow-watcher';

  private readonly structureSubscribers = new Set<WorkflowChangedCallback>();
  private readonly statusSubscribers = new Set<WorkflowChangedCallback>();

  private structureTimer: ReturnType<typeof setTimeout> | null = null;
  private statusTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingStructure: WorkflowChangedEvent | null = null;
  private pendingStatus: WorkflowChangedEvent | null = null;

  constructor(
    private readonly structureDebounceMs = 200,
    private readonly statusDebounceMs = 200
  ) {}

  handleEvent(event: WatcherEvent): void {
    // Check structural changes first (graph.yaml, node.yaml)
    const graphMatch = event.path.match(GRAPH_YAML_REGEX);
    const nodeMatch = event.path.match(NODE_YAML_REGEX);
    if (graphMatch || nodeMatch) {
      const graphSlug = (graphMatch?.[1] ?? nodeMatch?.[1])!;
      this.debounceStructure({
        graphSlug,
        workspaceSlug: event.workspaceSlug,
        worktreePath: event.worktreePath,
        filePath: event.path,
        changeType: 'structure',
        timestamp: new Date(),
      });
      return;
    }

    // Check runtime status changes (state.json)
    const stateMatch = event.path.match(STATE_JSON_REGEX);
    if (stateMatch) {
      this.debounceStatus({
        graphSlug: stateMatch[1],
        workspaceSlug: event.workspaceSlug,
        worktreePath: event.worktreePath,
        filePath: event.path,
        changeType: 'status',
        timestamp: new Date(),
      });
    }
  }

  onStructureChanged(callback: WorkflowChangedCallback): () => void {
    this.structureSubscribers.add(callback);
    return () => {
      this.structureSubscribers.delete(callback);
    };
  }

  onStatusChanged(callback: WorkflowChangedCallback): () => void {
    this.statusSubscribers.add(callback);
    return () => {
      this.statusSubscribers.delete(callback);
    };
  }

  private debounceStructure(event: WorkflowChangedEvent): void {
    this.pendingStructure = event;
    if (this.structureTimer) clearTimeout(this.structureTimer);
    this.structureTimer = setTimeout(() => {
      if (this.pendingStructure) {
        this.dispatch(this.structureSubscribers, this.pendingStructure);
        this.pendingStructure = null;
      }
    }, this.structureDebounceMs);
  }

  private debounceStatus(event: WorkflowChangedEvent): void {
    this.pendingStatus = event;
    if (this.statusTimer) clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => {
      if (this.pendingStatus) {
        this.dispatch(this.statusSubscribers, this.pendingStatus);
        this.pendingStatus = null;
      }
    }, this.statusDebounceMs);
  }

  private dispatch(subscribers: Set<WorkflowChangedCallback>, event: WorkflowChangedEvent): void {
    for (const callback of subscribers) {
      try {
        callback(event);
      } catch (error) {
        console.warn(`[${this.name}] Subscriber callback threw`, {
          graphSlug: event.graphSlug,
          changeType: event.changeType,
          error,
        });
      }
    }
  }
}
