/**
 * Feature barrel export for Plan 023: Central Watcher Notifications.
 *
 * Exports all interfaces, types, and fakes for the central watcher system.
 * Re-exported from packages/workflow/src/index.ts for consumer access.
 */

// Interfaces and types
export type { WatcherEvent, IWatcherAdapter } from './watcher-adapter.interface.js';
export type { ICentralWatcherService } from './central-watcher.interface.js';

// Service implementation
export { CentralWatcherService } from './central-watcher.service.js';

// WorkGraph watcher adapter (Phase 3)
export { WorkGraphWatcherAdapter } from './workgraph-watcher.adapter.js';
export type { WorkGraphChangedEvent } from './workgraph-watcher.adapter.js';

// Fakes
export { FakeWatcherAdapter } from './fake-watcher-adapter.js';
export {
  FakeCentralWatcherService,
  type StartCall,
  type StopCall,
  type RegisterAdapterCall,
} from './fake-central-watcher.service.js';

// File change watcher adapter (Plan 045)
export { FileChangeWatcherAdapter } from './file-change-watcher.adapter.js';
export type { FileChangeBatchItem } from './file-change-watcher.adapter.js';

// Source watcher constants (Plan 045)
export { SOURCE_WATCHER_IGNORED } from './source-watcher.constants.js';

// Fake file change watcher (Plan 045)
export { FakeFileChangeWatcherAdapter } from './fake-file-change-watcher.js';
