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
 *  - Responses are piped, never buffered: the live-update stream (`/api/events/mux`) is long-lived.
 *
 * Run: `pnpm tsx apps/web/src/lib/tls-front.ts` from the repo root (the recipes do).
 * Env: PORT (Next, default 3000), HTTPS_PORT (default PORT + 30), TLS_FRONT_HOST (listen address,
 * default all interfaces), CHAINGLASS_TLS_CERT / CHAINGLASS_TLS_KEY (default
 * apps/web/certificates/chainglass{,-key}.pem, made by `just certs`).
 */
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { join } from 'node:path';
import tls from 'node:tls';

import { REMOTE_VIEW_WSS_PROXY_PATH } from '../features/088-remote-view/components/stream-url';

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
}

export interface TlsFront {
  /** The bound ports (useful when 0 was asked for). */
  httpsPort: number;
  terminalPort: number;
  close(): Promise<void>;
}

/** The client's address as Next should see it: IPv4-mapped IPv6 (`::ffff:a.b.c.d`) unwrapped. */
export function clientAddress(socket: net.Socket): string {
  const address = socket.remoteAddress ?? '';
  return address.startsWith('::ffff:') && net.isIPv4(address.slice(7)) ? address.slice(7) : address;
}

/**
 * Rewrite a client's raw request headers for the upstream: drop the client's forwarding headers
 * (and hop-by-hop ones unless `keepUpgrade`), then append the front's own. Raw pairs keep repeated
 * headers intact.
 */
export function forwardedHeaders(
  rawHeaders: readonly string[],
  opts: { client: string; publicPort: number; keepUpgrade: boolean }
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
      }),
      agent,
    });
    upstream.on('response', (up) => {
      res.writeHead(up.statusCode ?? 502, up.statusMessage, responseHeaders(up.rawHeaders));
      // Send headers now: a stream (SSE) may not write a body byte for a while.
      res.flushHeaders();
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
    const url = req.url ?? '/';
    let port: number | null = opts.nextPort;
    let path = url;
    if (isRemoteViewPath(url)) {
      port = opts.remoteViewPort();
      path = url.slice(REMOTE_VIEW_WSS_PROXY_PATH.length) || '/';
      if (!path.startsWith('/')) path = `/${path}`;
    }
    if (port === null) {
      socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
      return;
    }
    const headers = forwardedHeaders(req.rawHeaders, {
      client: clientAddress(socket),
      publicPort,
      keepUpgrade: true,
    });
    const upstream = net.connect(port, '127.0.0.1');
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
    pipeBothWays(socket, net.connect(opts.nextPort + TERMINAL_PORT_OFFSET, '127.0.0.1'));
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

// ============ CLI entry point ============

if (process.argv[1]?.endsWith('tls-front.ts')) {
  const nextPort = Number(process.env.PORT ?? 3000);
  const httpsPort = Number(process.env.HTTPS_PORT ?? nextPort + 30);
  const certPath = process.env.CHAINGLASS_TLS_CERT ?? 'apps/web/certificates/chainglass.pem';
  const keyPath = process.env.CHAINGLASS_TLS_KEY ?? 'apps/web/certificates/chainglass-key.pem';
  const root = process.cwd();
  const front = await startTlsFront({
    cert: readFileSync(certPath),
    key: readFileSync(keyPath),
    host: process.env.TLS_FRONT_HOST || undefined,
    httpsPort,
    nextPort,
    remoteViewPort: () => readRemoteViewPort(root, nextPort, process.env),
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
