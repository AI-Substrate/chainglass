/**
 * True when `hostname` is a loopback or private-LAN address — the cases where
 * the page and the terminal sidecar share a host and the `port + 1500`
 * derivation reaches the sidecar directly (localhost dev, iPad-on-LAN browsing).
 *
 * For these hosts we ALWAYS derive and ignore NEXT_PUBLIC_TERMINAL_WS_URL, so a
 * tunnel override left in `.env.local` never breaks plain local/LAN use.
 */
export function isLocalOrLanHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '::1' || h === '[::1]') return true;
  // 127.0.0.0/8 loopback
  if (/^127\./.test(h)) return true;
  // RFC 1918 private ranges + link-local (iPad/phone on the same Wi-Fi)
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  return false;
}

/**
 * Resolve the terminal WebSocket base URL (scheme + host[:port], no path/query).
 *
 * Resolution order:
 *
 * 1. Override (`NEXT_PUBLIC_TERMINAL_WS_URL`), but ONLY when the page is served
 *    from a remote/proxy host (NOT loopback/LAN — see isLocalOrLanHostname).
 *    Dev tunnels / Codespaces expose each forwarded port on its OWN subdomain
 *    (e.g. `https://<id>-4500.<region>.devtunnels.ms`), so the page-port+1500
 *    maths can never reach the sidecar through such a proxy. Gating on host
 *    means the override can live permanently in `.env.local` without breaking
 *    `localhost:3000` or LAN-IP browsing. We normalize http(s) → ws(s) and strip
 *    any trailing slash and `/terminal` so callers may pass `wss://host`,
 *    `https://host`, or `.../terminal`.
 *
 * 2. Derived (default, and always used for local/LAN):
 *    `wss?://<page-host>:<page-port + 1500>`. The sidecar binds PORT+1500
 *    (3000 → 4500).
 *
 * Returns a base WITHOUT a trailing slash; callers append `/terminal?...`.
 */
export function resolveTerminalWsBaseUrl(loc: {
  hostname: string;
  port: string;
  protocol: string;
}): string {
  const override = process.env.NEXT_PUBLIC_TERMINAL_WS_URL?.trim();
  if (override && !isLocalOrLanHostname(loc.hostname)) {
    return override
      .replace(/^http:/i, 'ws:')
      .replace(/^https:/i, 'wss:')
      .replace(/\/+$/, '')
      .replace(/\/terminal$/i, '');
  }

  const port = Number(loc.port || '3000') + 1500;
  const protocol = loc.protocol === 'https:' ? 'wss' : 'ws';
  // Force IPv4 loopback for `localhost` pages. `localhost` resolves to IPv6 `::1`
  // first in modern browsers, but the sidecar (and `devtunnel connect`'s port
  // forward) are reliably reachable on IPv4 127.0.0.1 — and `::1:<port>` can be
  // squatted by an unrelated process (e.g. an orphaned sidecar from another
  // worktree), which silently routes the WS to the wrong server. Using
  // 127.0.0.1 dodges that. The Origin header still carries the page origin
  // (http://localhost:<port>), so the sidecar's allowlist is unaffected.
  const host = loc.hostname === 'localhost' ? '127.0.0.1' : loc.hostname;
  return `${protocol}://${host}:${port}`;
}
