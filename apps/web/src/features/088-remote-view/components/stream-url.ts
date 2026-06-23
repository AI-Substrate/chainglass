/**
 * Stream WS base-url builder (Plan 088 Phase 6, T003 — INS-003).
 *
 * The canonical, research-backed way to reach a loopback-only `ws://127.0.0.1:<port>` daemon
 * from a browser over HTTPS is a reverse proxy (Caddy/nginx/Traefik) terminating TLS and
 * forwarding **same-origin, path-based** `wss://host/<path>` → `ws://127.0.0.1:<port>`. A Next.js
 * route handler CANNOT upgrade a WebSocket (it has no raw-socket/101 surface and Next's own server
 * closes upgrade requests), so there is no in-app proxy — the bridge is ops config (a Caddyfile),
 * and the only product code is choosing the right url for the context:
 *
 *   - HTTPS page  → `wss://${host}${PROXY_PATH}` (same-origin; the reverse proxy bridges to the
 *     daemon). No mixed-content, no CORS, no daemon port needed client-side.
 *   - http://localhost → connect DIRECTLY to the loopback daemon `ws://127.0.0.1:<daemonPort>`
 *     (the dev path; a non-localhost http origin is already blocked by the secure-context gate, T002).
 *
 * The session hook appends `/stream?session=…&token=…`, so this returns the BASE (no `/stream`).
 */

/**
 * Same-origin path a reverse proxy maps to the loopback daemon. The session hook appends `/stream`,
 * so the browser opens `wss://host/remote-view-ws/stream` — but the daemon upgrades ONLY the exact
 * path `/stream` (`native/streamd/.../WSServer.swift`), so the proxy MUST **strip this prefix**
 * before forwarding. In Caddy use `handle_path` (which strips the matched prefix), NOT a bare
 * `reverse_proxy /remote-view-ws/*` (which forwards the URI unstripped → daemon 404s):
 *
 *     handle_path /remote-view-ws/* {
 *         reverse_proxy 127.0.0.1:<daemonPort>      # daemon then sees GET /stream
 *     }
 *
 * Distinct from the Next `/api/remote-view/*` routes so the proxy never shadows token/sessions/health.
 */
export const REMOTE_VIEW_WSS_PROXY_PATH = '/remote-view-ws';

export function buildStreamUrl(env: {
  protocol: string;
  host: string;
  daemonPort?: number | null;
}): string | null {
  if (env.protocol === 'https:') {
    // Same-origin wss — the reverse proxy bridges to ws://127.0.0.1:<daemonPort>. The daemon stays
    // loopback-only (frozen contract); the proxy is the only thing on the network edge.
    return `wss://${env.host}${REMOTE_VIEW_WSS_PROXY_PATH}`;
  }
  // Plain http: the only valid origin is http://localhost — connect straight to the loopback daemon.
  if (typeof env.daemonPort === 'number') {
    return `ws://127.0.0.1:${env.daemonPort}`;
  }
  return null; // localhost but the daemon port is unknown → caller shows "Streamer not reachable"
}
