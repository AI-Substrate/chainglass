/**
 * Resolve the terminal WebSocket base URL (scheme + host[:port], no path/query).
 *
 * Two modes:
 *
 * 1. Override (`NEXT_PUBLIC_TERMINAL_WS_URL`): used verbatim after normalization.
 *    Required for dev tunnels / Codespaces, where each forwarded port lives on
 *    its OWN subdomain (e.g. `https://<id>-4500.<region>.devtunnels.ms`) — the
 *    page-port+1500 maths can never reach the sidecar through such a proxy.
 *    We normalize http(s) → ws(s) and strip any trailing slash and `/terminal`
 *    so callers can pass either `wss://host`, `https://host`, or `.../terminal`.
 *
 * 2. Derived (default): `wss?://<page-host>:<page-port + 1500>`. The sidecar
 *    binds PORT+1500 (3000 → 4500). Works for localhost and LAN browsing.
 *
 * Returns a base WITHOUT a trailing slash; callers append `/terminal?...`.
 */
export function resolveTerminalWsBaseUrl(loc: {
  hostname: string;
  port: string;
  protocol: string;
}): string {
  const override = process.env.NEXT_PUBLIC_TERMINAL_WS_URL?.trim();
  if (override) {
    return override
      .replace(/^http:/i, 'ws:')
      .replace(/^https:/i, 'wss:')
      .replace(/\/+$/, '')
      .replace(/\/terminal$/i, '');
  }

  const port = Number(loc.port || '3000') + 1500;
  const protocol = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${loc.hostname}:${port}`;
}
