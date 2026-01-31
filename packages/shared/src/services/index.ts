// Services exports
export { AgentService } from './agent.service.js';
export type { AdapterFactory, AgentServiceRunOptions } from './agent.service.js';

// Note: EventStorageService removed in Plan 018 Phase 2.
// Use AgentEventAdapter from @chainglass/workflow for workspace-scoped event storage.

// Plan 015: Phase 3 - Session metadata storage
export { SessionMetadataService } from './session-metadata.service.js';
export type { ISessionMetadataStorage } from './session-metadata.service.js';
