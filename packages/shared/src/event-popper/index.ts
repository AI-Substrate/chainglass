/**
 * Server port discovery (`.chainglass/servers/<port>.json`, incl. `localToken`).
 *
 * Originally Plan 067's Event Popper infrastructure; the question popper itself
 * was removed (2026-11-12) and only port discovery remains. Import via
 * `@chainglass/shared/event-popper`.
 */

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
