/**
 * Plan 045: Live File Events — Public API
 *
 * Feature folder barrel export for the browser-side event hub.
 * All exports are part of the _platform/events domain contract.
 */

// Types
export type {
  FileChange,
  FileChangeSSEMessage,
  FileChangeCallback,
  IFileChangeHub,
} from './file-change.types';

// Path matcher
export { createMatcher } from './path-matcher';
export type { PathMatcher } from './path-matcher';

// Hub
export { FileChangeHub } from './file-change-hub';
export { FakeFileChangeHub } from './fake-file-change-hub';

// Provider + hooks
export {
  FileChangeProvider,
  useFileChangeHub,
  useSSEConnectionState,
} from './file-change-provider';
export type { SSEConnectionState } from './file-change-provider';
export { useFileChanges } from './use-file-changes';
export type { UseFileChangesOptions, UseFileChangesReturn } from './use-file-changes';
