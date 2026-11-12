/**
 * Plan 067: Event Popper Infrastructure
 *
 * Barrel exports for the `_platform/external-events` domain.
 * Import via `@chainglass/shared/event-popper`.
 */

// Envelope schemas and types
export {
  EventPopperRequestSchema,
  EventPopperResponseSchema,
  type EventPopperRequest,
  type EventPopperResponse,
} from './schemas.js';

// GUID generation
export { generateEventId } from './guid.js';

// Port discovery
export {
  currentServerPort,
  discoverServerInfo,
  listServerInfo,
  readServerInfo,
  removeServerInfo,
  requestedServerPort,
  ServerInfoSchema,
  ServerModeSchema,
  writeServerInfo,
  type ServerInfo,
  type ServerMode,
} from './port-discovery.js';

// Tmux context detection (re-export from utils)
export {
  detectTmuxContext,
  getTmuxMeta,
  type TmuxContext,
} from '../utils/tmux-context.js';
