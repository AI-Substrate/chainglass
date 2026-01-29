/**
 * WorkGraph UI Feature Module - Plan 022
 *
 * Headless state management for WorkGraph visualization.
 */

// Types
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

// Real implementations
export { WorkGraphUIService } from './workgraph-ui.service';
export { WorkGraphUIInstance, computeAllNodeStatuses } from './workgraph-ui.instance';

// Fakes (for testing)
export { FakeWorkGraphUIService } from './fake-workgraph-ui-service';
export { FakeWorkGraphUIInstance } from './fake-workgraph-ui-instance';
