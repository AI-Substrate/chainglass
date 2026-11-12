/**
 * TLS front for HTTPS mode (docs/how/dev/https.md).
 *
 * Terminates TLS and forwards to the plain servers, which keep serving plain HTTP as before:
 *
 *   https://<host>:<httpsPort>                 → http://127.0.0.1:<nextPort>        (Next, incl. upgrades)
 *   wss://<host>:<httpsPort>/remote-view-ws/…  → ws://127.0.0.1:<streamd port>/…   (prefix stripped)
 *   wss://<host>:<httpsPort + 1500>            → ws://127.0.0.1:<nextPort + 1500>  (terminal sidecar)
 *
 * The browser dials the terminal at page port + 1500 (`use-terminal-socket.ts`), so the front
 * listens there too and tunnels the TLS stream's bytes to the sidecar untouched; the sidecar's
 * Origin + JWT checks still decide. Remote view expects the same-origin `/remote-view-ws` path over
 * HTTPS (`stream-url.ts`). Only WebSocket upgrades go to streamd: its plain HTTP endpoints (health,
 * shutdown) stay loopback-only.
 *
 * Forwarded headers (behind the front every request reaches Next from 127.0.0.1):
 *  - `X-Forwarded-For` is OVERWRITTEN with the client's socket address, never appended to and never
 *    taken from the client, so the localhost guard (`localhost-guard.ts`) sees a LAN client's
 *    address as a non-loopback hop and refuses it.
 *  - `X-Forwarded-Proto: https`, `X-Forwarded-Host` (the client's Host) and `X-Forwarded-Port` (the
 *    public port) are set; `Host` is kept, so Next sees the public origin.
 *  - With `frontSecret` (the launch's CHAINGLASS_FRONT_SECRET), requests to Next carry
 *    `x-chainglass-front: <secret>`: Next's socket-peer stamp then trusts X-Forwarded-For as the
 *    client (rate limit, cookie `Secure`). streamd never gets it. A client's own copy is dropped.
 *  - Responses are piped, never buffered: the live-update stream (`/api/events/mux`) is long-lived.
 *
 * Run: `pnpm tsx apps/web/src/lib/tls-front.ts` from the repo root (the recipes do).
 * `… tls-front.ts origins terminal|remote-view` prints the Origin allowlist that server needs
 * behind the front (`allowedOriginsBehindFront`); `… tls-front.ts check-certs` exits 1 unless the
 * configured certificate and key load and match (`certPairProblem`).
 * Env: PORT (Next, default 3000), HTTPS_PORT (default PORT + 30), TLS_FRONT_HOST (listen address,
 * default all interfaces), CHAINGLASS_TLS_CERT / CHAINGLASS_TLS_KEY (default
 * apps/web/certificates/chainglass{,-key}.pem, made by `just certs`), CHAINGLASS_FRONT_SECRET.
 */
import { type KeyObject, X509Certificate, createPrivateKey } from 'node:crypto';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { join } from 'node:path';
import tls from 'node:tls';

import { REMOTE_VIEW_WSS_PROXY_PATH } from '../features/088-remote-view/components/stream-url';
import { FRONT_HEADER, FRONT_SECRET_ENV, PEER_HEADER, unmapIPv4 } from './socket-peer';

/** The terminal sidecar listens at the Next port + 1500; the browser dials page port + 1500. */
export const TERMINAL_PORT_OFFSET = 1500;
/** streamd's default port when its registry file is absent (daemon-manager.ts). */
const REMOTE_VIEW_PORT_OFFSET = 1501;

/** Request headers a client may not set: the front sets the forwarded ones itself. */
const CLIENT_FORWARDING_HEADERS = new Set([
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
  'x-forwarded-port',
  'forwarded',
  'x-real-ip',
  FRONT_HEADER,
  PEER_HEADER,
]);

/** Hop-by-hop headers (RFC 9110 §7.6.1): they describe one connection and are never forwarded. */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
]);

export interface TlsFrontOptions {
  cert: string | Buffer;
  key: string | Buffer;
  /** Listen address; undefined = all interfaces. */
  host?: string;
  /** Public HTTPS port. The terminal tunnel listens at httpsPort + 1500. */
  httpsPort: number;
  /** Next's plain HTTP port on 127.0.0.1. The terminal sidecar is nextPort + 1500. */
  nextPort: number;
  /** streamd's port for a remote-view upgrade, or null when it is unknown. Read per upgrade. */
  remoteViewPort: () => number | null;
  /** This launch's CHAINGLASS_FRONT_SECRET, shared with the Next server it fronts. */
  frontSecret?: string;
}

export interface TlsFront {
  /** The bound ports (useful when 0 was asked for). */
  httpsPort: number;
  terminalPort: number;
  close(): Promise<void>;
}

/** The client's address as Next should see it: IPv4-mapped IPv6 (`::ffff:a.b.c.d`) unwrapped. */
export function clientAddress(socket: net.Socket): string {
  return unmapIPv4(socket.remoteAddress ?? '');
}

/**
 * Rewrite a client's raw request headers for the upstream: drop the client's forwarding headers
 * (and hop-by-hop ones unless `keepUpgrade`), then append the front's own, plus the front's
 * secret marker when given. Raw pairs keep repeated headers intact.
 */
export function forwardedHeaders(
  rawHeaders: readonly string[],
  opts: { client: string; publicPort: number; keepUpgrade: boolean; frontSecret?: string }
): string[] {
  const connectionTokens = new Set<string>();
  let host: string | undefined;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i].toLowerCase();
    if (name === 'connection' && !opts.keepUpgrade) {
      for (const token of rawHeaders[i + 1].split(','))
        connectionTokens.add(token.trim().toLowerCase());
    }
    if (name === 'host') host = rawHeaders[i + 1];
  }
  const out: string[] = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i].toLowerCase();
    if (CLIENT_FORWARDING_HEADERS.has(name)) continue;
    if (!opts.keepUpgrade && (HOP_BY_HOP.has(name) || connectionTokens.has(name))) continue;
    out.push(rawHeaders[i], rawHeaders[i + 1]);
  }
  out.push('X-Forwarded-For', opts.client, 'X-Forwarded-Proto', 'https');
  out.push('X-Forwarded-Port', String(opts.publicPort));
  if (host) out.push('X-Forwarded-Host', host);
  if (opts.frontSecret) out.push(FRONT_HEADER, opts.frontSecret);
  return out;
}

/** Response headers to send the client: the upstream's, minus hop-by-hop ones. */
function responseHeaders(rawHeaders: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (HOP_BY_HOP.has(rawHeaders[i].toLowerCase())) continue;
    out.push(rawHeaders[i], rawHeaders[i + 1]);
  }
  return out;
}

/** `/remote-view-ws` or `/remote-view-ws/…` (with any query). */
function isRemoteViewPath(url: string): boolean {
  const path = url.split('?')[0];
  return path === REMOTE_VIEW_WSS_PROXY_PATH || path.startsWith(`${REMOTE_VIEW_WSS_PROXY_PATH}/`);
}

/**
 * The one streamd endpoint the front exposes: the `/stream` WebSocket. streamd also serves REST
 * on its port (`/health`, `/shutdown`, …) and treats any request there as REST unless it is that
 * WebSocket, whatever Upgrade header it carries, so the front admits only `GET
 * /remote-view-ws/stream[?…]` with `Upgrade: websocket`. Everything else under the prefix is 404.
 */
function streamdPath(req: http.IncomingMessage): string | null {
  const url = req.url ?? '/';
  const q = url.indexOf('?');
  const pathname = q === -1 ? url : url.slice(0, q);
  if (pathname !== `${REMOTE_VIEW_WSS_PROXY_PATH}/stream`) return null;
  if (req.method !== 'GET' || req.headers.upgrade?.toLowerCase() !== 'websocket') return null;
  return `/stream${q === -1 ? '' : url.slice(q)}`;
}

function pipeBothWays(a: net.Socket, b: net.Socket): void {
  a.on('error', () => b.destroy());
  b.on('error', () => a.destroy());
  a.on('close', () => b.destroy());
  b.on('close', () => a.destroy());
  a.pipe(b);
  b.pipe(a);
}

function listen(server: net.Server, port: number, host: string | undefined): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve((server.address() as net.AddressInfo).port);
    });
  });
}

export async function startTlsFront(opts: TlsFrontOptions): Promise<TlsFront> {
  const agent = new http.Agent({ keepAlive: true });
  let publicPort = opts.httpsPort;
  // Upgraded and tunnelled sockets: closeAllConnections() does not see them (an upgraded socket
  // is detached from the HTTP server; the terminal server is a raw TLS server), so close() ends
  // them itself.
  const live = new Set<net.Socket>();
  const track = (socket: net.Socket): net.Socket => {
    live.add(socket);
    socket.once('close', () => live.delete(socket));
    return socket;
  };

  const server = https.createServer({ cert: opts.cert, key: opts.key });

  server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = req.url ?? '/';
    if (isRemoteViewPath(url)) {
      // Only WebSocket upgrades reach streamd; its HTTP endpoints stay loopback-only.
      res.writeHead(404).end();
      return;
    }
    const upstream = http.request({
      host: '127.0.0.1',
      port: opts.nextPort,
      method: req.method,
      path: url,
      headers: forwardedHeaders(req.rawHeaders, {
        client: clientAddress(req.socket),
        publicPort,
        keepUpgrade: false,
        frontSecret: opts.frontSecret,
      }),
      agent,
    });
    upstream.on('response', (up) => {
      res.writeHead(up.statusCode ?? 502, up.statusMessage, responseHeaders(up.rawHeaders));
      // Send headers now: a stream (SSE) may not write a body byte for a while.
      res.flushHeaders();
      // pipe() ends `res` only when `up` ends cleanly. If the upstream connection dies mid-body
      // (Next restarting under an open SSE), end the client's response too, so EventSource sees
      // the loss and reconnects instead of waiting on a half-open stream.
      up.once('close', () => {
        if (!up.complete) res.destroy();
      });
      up.on('error', () => res.destroy());
      up.pipe(res);
    });
    upstream.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' }).end(`Bad gateway: ${err.message}\n`);
      } else {
        res.destroy();
      }
    });
    res.on('close', () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
  });

  server.on('upgrade', (req: http.IncomingMessage, socket: net.Socket, head: Buffer) => {
    track(socket);
    const url = req.url ?? '/';
    let port: number | null = opts.nextPort;
    let path = url;
    const toStreamd = isRemoteViewPath(url);
    if (toStreamd) {
      const streamPath = streamdPath(req);
      if (streamPath === null) {
        socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
        return;
      }
      port = opts.remoteViewPort();
      path = streamPath;
    }
    if (port === null) {
      socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      return;
    }
    const headers = forwardedHeaders(req.rawHeaders, {
      client: clientAddress(socket),
      publicPort,
      keepUpgrade: true,
      frontSecret: toStreamd ? undefined : opts.frontSecret,
    });
    const upstream = track(net.connect(port, '127.0.0.1'));
    upstream.once('connect', () => {
      let requestHead = `${req.method} ${path} HTTP/1.1\r\n`;
      for (let i = 0; i < headers.length; i += 2)
        requestHead += `${headers[i]}: ${headers[i + 1]}\r\n`;
      upstream.write(`${requestHead}\r\n`);
      if (head.length > 0) upstream.write(head);
      pipeBothWays(socket, upstream);
    });
    upstream.once('error', () => {
      if (!socket.destroyed) socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    });
  });

  // Terminal: tunnel the TLS stream's bytes to the sidecar. It authenticates the upgrade itself
  // (Origin + JWT), so the front neither parses nor rewrites anything here.
  const terminal = tls.createServer({ cert: opts.cert, key: opts.key }, (socket) => {
    pipeBothWays(
      track(socket),
      track(net.connect(opts.nextPort + TERMINAL_PORT_OFFSET, '127.0.0.1'))
    );
  });

  publicPort = await listen(server, opts.httpsPort, opts.host);
  const terminalPort = await listen(
    terminal,
    opts.httpsPort === 0 ? 0 : opts.httpsPort + TERMINAL_PORT_OFFSET,
    opts.host
  ).catch(async (err) => {
    await new Promise((r) => server.close(r));
    throw err;
  });

  return {
    httpsPort: publicPort,
    terminalPort,
    async close() {
      server.closeAllConnections();
      for (const socket of live) socket.destroy();
      await Promise.all([
        new Promise((r) => server.close(r)),
        new Promise((r) => terminal.close(r)),
      ]);
      agent.destroy();
    },
  };
}

/**
 * streamd's port for the web server on `nextPort`: its registry file
 * (`<root>/.chainglass/streamd-<nextPort>.json`, field `port`), else CG_REMOTE_VIEW__DAEMON_PORT,
 * else nextPort + 1501 — the same order daemon-manager.ts uses to spawn it.
 */
export function readRemoteViewPort(
  root: string,
  nextPort: number,
  env: Partial<NodeJS.ProcessEnv>
): number | null {
  try {
    const entry = JSON.parse(
      readFileSync(join(root, '.chainglass', `streamd-${nextPort}.json`), 'utf8')
    ) as { port?: unknown };
    if (typeof entry.port === 'number' && entry.port > 0) return entry.port;
  } catch {
    // No registry yet (streamd starts on the first attach): fall through to the spawn port.
  }
  const override = Number(env.CG_REMOTE_VIEW__DAEMON_PORT);
  if (Number.isInteger(override) && override > 0) return override;
  return nextPort + REMOTE_VIEW_PORT_OFFSET;
}

/** `https://<name>:<port>` for every DNS name and IPv4 address the certificate covers. */
export function certOrigins(certPem: string | Buffer, port: number): string[] {
  const out: string[] = [];
  for (const entry of (new X509Certificate(certPem).subjectAltName ?? '').split(', ')) {
    if (entry.startsWith('DNS:')) out.push(`https://${entry.slice(4)}:${port}`);
    const ip = entry.startsWith('IP Address:') ? entry.slice(11) : '';
    // IPv6 stays opt-in, as in the sidecar's own default allowlist.
    if (net.isIPv4(ip)) out.push(`https://${ip}:${port}`);
  }
  return out;
}

/** The certificate and key the front serves: CHAINGLASS_TLS_CERT / _KEY, else `just certs`' files. */
export function certPaths(env: Partial<NodeJS.ProcessEnv>): { cert: string; key: string } {
  return {
    cert: env.CHAINGLASS_TLS_CERT || 'apps/web/certificates/chainglass.pem',
    key: env.CHAINGLASS_TLS_KEY || 'apps/web/certificates/chainglass-key.pem',
  };
}

/**
 * Why the front could not serve this pair (a file missing or unreadable, not a certificate or
 * key, or a key that does not match the certificate), else null. `_require-certs` runs it on the
 * exact paths the front will read, before any port is claimed.
 */
export function certPairProblem(paths: { cert: string; key: string }): string | null {
  let cert: X509Certificate;
  try {
    cert = new X509Certificate(readFileSync(paths.cert));
  } catch (err) {
    return `certificate ${paths.cert}: ${(err as Error).message}`;
  }
  let key: KeyObject;
  try {
    key = createPrivateKey(readFileSync(paths.key));
  } catch (err) {
    return `key ${paths.key}: ${(err as Error).message}`;
  }
  return cert.checkPrivateKey(key) ? null : `key ${paths.key} does not match ${paths.cert}`;
}

function splitOrigins(value: string | undefined): string[] | null {
  const list = (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return list.length > 0 ? list : null;
}

/**
 * The Origin allowlist a server behind the front needs: what it allows today plus
 * `https://<cert name>:<httpsPort>`. The terminal sidecar's TERMINAL_WS_ALLOWED_ORIGINS and
 * streamd's CG_REMOTE_VIEW__ALLOWED_ORIGINS (set on the web server, whose env streamd inherits)
 * each REPLACE that server's defaults, so the defaults are spelled out here: an operator's own
 * value if set, else the sidecar's default (localhost, 127.0.0.1 and every LAN IPv4 on the Next
 * port) or streamd's (localhost and 127.0.0.1 on the Next port).
 */
export async function allowedOriginsBehindFront(
  server: 'terminal' | 'remote-view',
  opts: {
    certPem: string | Buffer;
    httpsPort: number;
    nextPort: number;
    env: Partial<NodeJS.ProcessEnv>;
  }
): Promise<string[]> {
  let base: string[];
  if (server === 'terminal') {
    const { buildDefaultAllowedOrigins, getLocalNetworkHosts } = await import(
      '../features/064-terminal/server/terminal-auth'
    );
    base = splitOrigins(opts.env.TERMINAL_WS_ALLOWED_ORIGINS) ?? [
      ...buildDefaultAllowedOrigins(String(opts.nextPort), false, getLocalNetworkHosts()),
    ];
  } else {
    base = splitOrigins(opts.env.CG_REMOTE_VIEW__ALLOWED_ORIGINS) ?? [
      `http://localhost:${opts.nextPort}`,
      `http://127.0.0.1:${opts.nextPort}`,
    ];
  }
  return [...new Set([...base, ...certOrigins(opts.certPem, opts.httpsPort)])];
}

// ============ CLI entry point ============

if (process.argv[1]?.endsWith('tls-front.ts')) {
  const nextPort = Number(process.env.PORT ?? 3000);
  const httpsPort = Number(process.env.HTTPS_PORT ?? nextPort + 30);
  const paths = certPaths(process.env);
  const root = process.cwd();
  const server = process.argv[3];
  if (process.argv[2] === 'check-certs') {
    // `tls-front.ts check-certs`: exit 1 unless the front could serve its configured pair.
    const problem = certPairProblem(paths);
    if (problem) console.error(problem);
    process.exit(problem ? 1 : 0);
  }
  if (process.argv[2] === 'origins' && (server === 'terminal' || server === 'remote-view')) {
    // `tls-front.ts origins terminal|remote-view`: the allowlist for that server's env var.
    const origins = await allowedOriginsBehindFront(server, {
      certPem: readFileSync(paths.cert),
      httpsPort,
      nextPort,
      env: process.env,
    });
    console.log(origins.join(','));
    process.exit(0);
  }
  const front = await startTlsFront({
    cert: readFileSync(paths.cert),
    key: readFileSync(paths.key),
    host: process.env.TLS_FRONT_HOST || undefined,
    httpsPort,
    nextPort,
    remoteViewPort: () => readRemoteViewPort(root, nextPort, process.env),
    frontSecret: process.env[FRONT_SECRET_ENV] || undefined,
  });
  console.log(
    `[tls-front] https://*:${front.httpsPort} → http://127.0.0.1:${nextPort}; ` +
      `wss://*:${front.terminalPort} → ws://127.0.0.1:${nextPort + TERMINAL_PORT_OFFSET}; ` +
      `${REMOTE_VIEW_WSS_PROXY_PATH} → streamd`
  );
  const stop = () => void front.close().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  process.on('SIGHUP', stop);
}
