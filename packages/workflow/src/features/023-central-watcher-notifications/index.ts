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
export type { FileChangeBatchItem, FilesChangedCallback } from './file-change.types.js';

// Source watcher constants (Plan 045)
export { SOURCE_WATCHER_IGNORED } from './source-watcher.constants.js';

// Fake file change watcher (Plan 045)
export { FakeFileChangeWatcherAdapter } from './fake-file-change-watcher.js';

// Workflow watcher adapter (Plan 050 Phase 6)
export { WorkflowWatcherAdapter } from './workflow-watcher.adapter.js';
export type { WorkflowChangedEvent } from './workflow-watcher.adapter.js';

// Work unit catalog watcher adapter (Plan 058 Phase 4)
export { WorkUnitCatalogWatcherAdapter } from './workunit-catalog-watcher.adapter.js';
export type { UnitCatalogChangedEvent } from './workunit-catalog-watcher.adapter.js';
