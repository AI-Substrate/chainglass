/**
 * WorkGraph UI Feature Module - Plan 022
 *
 * Headless state management and React components for WorkGraph visualization.
 */

// Types - Phase 1
export type {
  CreateGraphResult,
  DeleteGraphResult,
  IWorkGraphUIInstance,
  IWorkGraphUIInstanceCore,
  IWorkGraphUIService,
  ListGraphsResult,
  NodeStatus,
  Position,
  StoredNodeState,
  UIEdge,
  UINodeState,
  Unsubscribe,
  WorkGraphState,
  WorkGraphUIEvent,
  WorkGraphUIEventCallback,
  WorkGraphUIEventType,
} from './workgraph-ui.types';

// Types - Phase 2
export type {
  WorkGraphFlowData,
  WorkGraphFlowNode,
  WorkGraphFlowEdge,
  WorkGraphNodeData,
  WorkGraphRFNode,
  WorkGraphRFEdge,
  UseWorkGraphFlowResult,
} from './use-workgraph-flow';

export type { StatusIndicatorProps, StatusIndicatorSize } from './status-indicator';
export type { WorkGraphNodeProps } from './workgraph-node';
export type { WorkGraphCanvasProps } from './workgraph-canvas';

// Real implementations - Phase 1
export { WorkGraphUIService } from './workgraph-ui.service';
export { WorkGraphUIInstance, computeAllNodeStatuses } from './workgraph-ui.instance';

// React components - Phase 2
export { useWorkGraphFlow } from './use-workgraph-flow';
export { StatusIndicator } from './status-indicator';
export { WorkGraphNode } from './workgraph-node';
export { WorkGraphCanvas } from './workgraph-canvas';

// Fakes (for testing)
export { FakeWorkGraphUIService } from './fake-workgraph-ui-service';
export { FakeWorkGraphUIInstance } from './fake-workgraph-ui-instance';
