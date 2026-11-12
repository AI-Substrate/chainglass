/**
 * @vitest-environment node
 */
/**
 * The TLS front (apps/web/src/lib/tls-front.ts) against real upstream servers: every request and
 * upgrade reaches the plain server with the client's socket address in X-Forwarded-For (never the
 * client's own value), responses stream without buffering, remote view gets its prefix stripped
 * and only upgrades, and the terminal port tunnels bytes to the sidecar port.
 *
 * Behind the front, a stamped "Next" (socket-peer.ts) must: still refuse a LAN client on
 * localhost-only routes; trust the front's client address and https only with the launch secret
 * from a loopback peer; and never let a direct client fake the marker.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net, { type AddressInfo } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';

import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { isLocalhostRequest } from '../../../../apps/web/src/lib/localhost-guard';
import {
  FRONT_HEADER,
  FRONT_SECRET_ENV,
  _uninstallPeerAddressStampForTests,
  installPeerAddressStamp,
  requestClient,
  socketPeerAddress,
} from '../../../../apps/web/src/lib/socket-peer';
import {
  TERMINAL_PORT_OFFSET,
  type TlsFront,
  allowedOriginsBehindFront,
  certOrigins,
  readRemoteViewPort,
  startTlsFront,
} from '../../../../apps/web/src/lib/tls-front';

const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find((a) => a && a.family === 'IPv4' && !a.internal)?.address;

let dir: string;
let cert: Buffer;
let key: Buffer;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'tls-front-'));
  const san = ['DNS:localhost', 'IP:127.0.0.1', ...(lanAddress ? [`IP:${lanAddress}`] : [])];
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      `subjectAltName=${san.join(',')}`,
      '-keyout',
      join(dir, 'key.pem'),
      '-out',
      join(dir, 'cert.pem'),
    ],
    { stdio: 'ignore' }
  );
  cert = readFileSync(join(dir, 'cert.pem'));
  key = readFileSync(join(dir, 'key.pem'));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

function listen(server: net.Server, port = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });
}

function closeServer(server: net.Server): () => Promise<void> {
  return () =>
    new Promise((resolve) => {
      if (server instanceof http.Server) server.closeAllConnections();
      server.close(() => resolve());
    });
}

/** A plain upstream ("Next") that answers with the request it saw. */
async function echoUpstream(): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body }));
    });
  });
  const port = await listen(server);
  cleanups.push(closeServer(server));
  return { server, port };
}

async function front(
  nextPort: number,
  remoteViewPort: () => number | null = () => null,
  frontSecret?: string
): Promise<TlsFront> {
  const f = await startTlsFront({
    cert,
    key,
    host: '0.0.0.0',
    httpsPort: 0,
    nextPort,
    remoteViewPort,
    frontSecret,
  });
  cleanups.push(() => f.close());
  return f;
}

function request(
  host: string,
  port: number,
  opts: { path?: string; method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host,
        port,
        ca: cert,
        // Verify against the cert by address, whatever Host header the test sends.
        servername: host === '127.0.0.1' ? 'localhost' : undefined,
        path: opts.path ?? '/',
        method: opts.method ?? 'GET',
        headers: opts.headers,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      }
    );
    req.on('error', reject);
    req.end(opts.body);
  });
}

/** Send an upgrade through the front; resolve with the upstream's 101 response headers. */
function upgrade(
  port: number,
  path: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; socket: net.Socket }> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      host: '127.0.0.1',
      port,
      ca: cert,
      path,
      headers: { connection: 'Upgrade', upgrade: 'websocket', ...headers },
    });
    req.on('upgrade', (res, socket) =>
      resolve({ status: res.statusCode ?? 0, headers: res.headers, socket })
    );
    req.on('response', (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, headers: res.headers, socket: res.socket });
    });
    req.on('error', reject);
    req.end();
  });
}

/** An upstream that accepts upgrades, reports what it saw in the 101, then echoes bytes. */
async function upgradeUpstream(): Promise<{ port: number; hits: string[] }> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(`http ${req.url}`);
    res.end('plain');
  });
  server.on('upgrade', (req, socket) => {
    hits.push(`upgrade ${req.url}`);
    const lines = [
      'HTTP/1.1 101 Switching Protocols',
      'Connection: Upgrade',
      'Upgrade: websocket',
      `x-seen-url: ${req.url}`,
      `x-seen-xff: ${req.headers['x-forwarded-for']}`,
      `x-seen-proto: ${req.headers['x-forwarded-proto']}`,
      `x-seen-host: ${req.headers.host}`,
    ];
    socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    socket.pipe(socket);
  });
  const port = await listen(server);
  cleanups.push(closeServer(server));
  return { port, hits };
}

describe('tls-front: HTTP requests', () => {
  it('overwrites the client forwarding headers with its own and keeps Host', async () => {
    const up = await echoUpstream();
    const f = await front(up.port);
    const r = await request('127.0.0.1', f.httpsPort, {
      path: '/api/x?y=1',
      method: 'POST',
      body: 'payload',
      headers: {
        host: 'ops.osk.lan:3030',
        'x-forwarded-for': '127.0.0.1, 10.0.0.9',
        'x-forwarded-proto': 'http',
        'x-forwarded-host': 'evil.example',
        forwarded: 'for=127.0.0.1',
        'x-real-ip': '127.0.0.1',
      },
    });
    const seen = JSON.parse(r.body);
    expect(seen.method).toBe('POST');
    expect(seen.url).toBe('/api/x?y=1');
    expect(seen.body).toBe('payload');
    expect(seen.headers['x-forwarded-for']).toBe('127.0.0.1');
    expect(seen.headers['x-forwarded-proto']).toBe('https');
    expect(seen.headers['x-forwarded-host']).toBe('ops.osk.lan:3030');
    expect(seen.headers['x-forwarded-port']).toBe(String(f.httpsPort));
    expect(seen.headers.host).toBe('ops.osk.lan:3030');
    expect(seen.headers.forwarded).toBeUndefined();
    expect(seen.headers['x-real-ip']).toBeUndefined();
  });

  it.skipIf(!lanAddress)(
    'a LAN client is forwarded with its LAN address, whatever it claims',
    async () => {
      const up = await echoUpstream();
      const f = await front(up.port);
      const r = await request(lanAddress as string, f.httpsPort, {
        headers: { 'x-forwarded-for': '127.0.0.1' },
      });
      expect(JSON.parse(r.body).headers['x-forwarded-for']).toBe(lanAddress);
    }
  );

  it('passes repeated response headers (Set-Cookie) and the status through', async () => {
    const server = http.createServer((_req, res) => {
      res.setHeader('set-cookie', ['a=1; Path=/', 'b=2; Path=/']);
      res.writeHead(401).end('no');
    });
    const port = await listen(server);
    cleanups.push(closeServer(server));
    const f = await front(port);
    const r = await request('127.0.0.1', f.httpsPort);
    expect(r.status).toBe(401);
    expect(r.headers['set-cookie']).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    expect(r.body).toBe('no');
  });

  it('streams a response without waiting for it to end', async () => {
    let finish: () => void = () => {};
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: first\n\n');
      finish = () => res.end('data: last\n\n');
    });
    const port = await listen(server);
    cleanups.push(closeServer(server));
    const f = await front(port);
    const first = await new Promise<string>((resolve, reject) => {
      https
        .get({ host: '127.0.0.1', port: f.httpsPort, ca: cert, path: '/api/events/mux' }, (res) => {
          res.once('data', (c) => resolve(String(c)));
        })
        .on('error', reject);
    });
    expect(first).toBe('data: first\n\n');
    finish();
  });

  it('answers 502 when the upstream is down', async () => {
    const probe = net.createServer();
    const deadPort = await listen(probe);
    await closeServer(probe)();
    const f = await front(deadPort);
    const r = await request('127.0.0.1', f.httpsPort);
    expect(r.status).toBe(502);
  });
});

describe('tls-front: WebSocket upgrades', () => {
  it('forwards an upgrade to Next with the forwarded headers rewritten', async () => {
    const up = await upgradeUpstream();
    const f = await front(up.port);
    const r = await upgrade(f.httpsPort, '/_next/webpack-hmr', {
      host: 'localhost:3030',
      'x-forwarded-for': '10.0.0.9',
    });
    cleanups.push(async () => {
      r.socket.destroy();
    });
    expect(r.status).toBe(101);
    expect(r.headers['x-seen-url']).toBe('/_next/webpack-hmr');
    expect(r.headers['x-seen-xff']).toBe('127.0.0.1');
    expect(r.headers['x-seen-proto']).toBe('https');
    expect(r.headers['x-seen-host']).toBe('localhost:3030');
    r.socket.write('ping');
    const echoed = await new Promise<string>((resolve) =>
      r.socket.once('data', (c) => resolve(String(c)))
    );
    expect(echoed).toBe('ping');
  });

  it('sends /remote-view-ws upgrades to streamd with the prefix stripped', async () => {
    const next = await upgradeUpstream();
    const streamd = await upgradeUpstream();
    const f = await front(next.port, () => streamd.port);
    const r = await upgrade(f.httpsPort, '/remote-view-ws/stream?session=s1&token=t');
    cleanups.push(async () => {
      r.socket.destroy();
    });
    expect(r.status).toBe(101);
    expect(streamd.hits).toEqual(['upgrade /stream?session=s1&token=t']);
    expect(next.hits).toEqual([]);
  });

  it('never sends plain HTTP under /remote-view-ws to streamd', async () => {
    const next = await upgradeUpstream();
    const streamd = await upgradeUpstream();
    const f = await front(next.port, () => streamd.port);
    const r = await request('127.0.0.1', f.httpsPort, {
      path: '/remote-view-ws/shutdown',
      method: 'POST',
    });
    expect(r.status).toBe(404);
    expect(streamd.hits).toEqual([]);
    expect(next.hits).toEqual([]);
  });

  it('refuses a remote-view upgrade when streamd has no port', async () => {
    const next = await upgradeUpstream();
    const f = await front(next.port, () => null);
    const r = await upgrade(f.httpsPort, '/remote-view-ws/stream');
    expect(r.status).toBe(502);
  });
});

describe('tls-front: terminal tunnel', () => {
  it('tunnels TLS bytes from httpsPort + 1500 to the sidecar at nextPort + 1500', async () => {
    // The sidecar must sit exactly at nextPort + 1500: find a free pair.
    let nextPort = 0;
    let sidecar: net.Server | undefined;
    for (let attempt = 0; attempt < 20 && !sidecar; attempt++) {
      const probe = net.createServer();
      nextPort = await listen(probe);
      await closeServer(probe)();
      const s = net.createServer((sock) => sock.pipe(sock));
      try {
        await listen(s, nextPort + TERMINAL_PORT_OFFSET);
        sidecar = s;
      } catch {
        // Port taken; try another pair.
      }
    }
    if (!sidecar) throw new Error('no free port pair for the sidecar');
    cleanups.push(closeServer(sidecar));
    const f = await startTlsFront({
      cert,
      key,
      host: '127.0.0.1',
      httpsPort: 0,
      nextPort,
      remoteViewPort: () => null,
    });
    cleanups.push(() => f.close());
    const socket = tls.connect({
      host: '127.0.0.1',
      port: f.terminalPort,
      ca: cert,
      servername: 'localhost',
    });
    cleanups.push(async () => {
      socket.destroy();
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('secureConnect', () => resolve());
      socket.once('error', reject);
    });
    socket.write('GET /terminal HTTP/1.1\r\n\r\n');
    const echoed = await new Promise<string>((resolve) =>
      socket.once('data', (c) => resolve(String(c)))
    );
    expect(echoed).toBe('GET /terminal HTTP/1.1\r\n\r\n');
  });
});

describe('readRemoteViewPort', () => {
  it('prefers the registry file, then CG_REMOTE_VIEW__DAEMON_PORT, then nextPort + 1501', () => {
    const root = mkdtempSync(join(tmpdir(), 'tls-front-root-'));
    try {
      expect(readRemoteViewPort(root, 3000, {})).toBe(4501);
      expect(readRemoteViewPort(root, 3000, { CG_REMOTE_VIEW__DAEMON_PORT: '6099' })).toBe(6099);
      mkdirSync(join(root, '.chainglass'));
      writeFileSync(join(root, '.chainglass', 'streamd-3000.json'), JSON.stringify({ port: 6123 }));
      expect(readRemoteViewPort(root, 3000, { CG_REMOTE_VIEW__DAEMON_PORT: '6099' })).toBe(6123);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('Origin allowlists behind the front', () => {
  const certNames = ['localhost', '127.0.0.1', ...(lanAddress ? [lanAddress] : [])];

  it('certOrigins: https://<name>:<port> for each DNS name and IPv4 address in the cert', () => {
    expect(certOrigins(cert, 3030)).toEqual(certNames.map((n) => `https://${n}:3030`));
  });

  it('terminal: the sidecar default (http on the Next port, LAN included) plus the https names', async () => {
    const origins = await allowedOriginsBehindFront('terminal', {
      certPem: cert,
      httpsPort: 3030,
      nextPort: 3000,
      env: {},
    });
    expect(origins).toEqual(
      expect.arrayContaining(['http://localhost:3000', 'http://127.0.0.1:3000'])
    );
    if (lanAddress) expect(origins).toContain(`http://${lanAddress}:3000`);
    expect(origins).toEqual(expect.arrayContaining(certNames.map((n) => `https://${n}:3030`)));
    expect(origins.filter((o) => o.startsWith('https://')).every((o) => o.endsWith(':3030'))).toBe(
      true
    );
  });

  it("an operator's own allowlist is kept, not replaced by the defaults", async () => {
    const origins = await allowedOriginsBehindFront('terminal', {
      certPem: cert,
      httpsPort: 3030,
      nextPort: 3000,
      env: { TERMINAL_WS_ALLOWED_ORIGINS: 'https://remote.example.com' },
    });
    expect(origins).toEqual([
      'https://remote.example.com',
      ...certNames.map((n) => `https://${n}:3030`),
    ]);
  });

  it("remote view: streamd's default (localhost on the Next port) plus the https names", async () => {
    const origins = await allowedOriginsBehindFront('remote-view', {
      certPem: cert,
      httpsPort: 3030,
      nextPort: 3000,
      env: {},
    });
    expect(origins).toEqual([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      ...certNames.map((n) => `https://${n}:3030`),
    ]);
  });
});

describe('behind the front: what a stamped Next server decides', () => {
  const SECRET = 'front-secret-for-tests-0123456789abcdef';

  afterEach(() => {
    _uninstallPeerAddressStampForTests();
    vi.unstubAllEnvs();
  });

  /** A stamped plain server ("Next") answering with the guard's verdict and the stamped client. */
  async function stampedNext(host = '0.0.0.0'): Promise<number> {
    const server = http.createServer((req, res) => {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers))
        if (typeof v === 'string') headers.set(k, v);
      const nextReq = new NextRequest(`http://${req.headers.host}${req.url}`, { headers });
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          local: isLocalhostRequest(nextReq),
          peer: socketPeerAddress(headers),
          client: requestClient(headers),
          markerSeen: req.headers[FRONT_HEADER] !== undefined,
        })
      );
    });
    await new Promise<void>((resolve) => server.listen(0, host, resolve));
    cleanups.push(closeServer(server));
    return (server.address() as AddressInfo).port;
  }

  it('a client has one key direct or through the front, on a dual-stack listener like Next', async () => {
    // Next listens on `::`; an IPv4 client's socket address there is `::ffff:a.b.c.d`, while the
    // front forwards `a.b.c.d`. Both must key the same rate-limit bucket.
    installWithSecret();
    const port = await stampedNext('::');
    const direct = await plainGet('127.0.0.1', port);
    expect(direct.peer).toBe('::ffff:127.0.0.1');
    expect(direct.client).toEqual({ address: '127.0.0.1', secure: false });
    expect(direct.local).toBe(true);
    const f = await front(port, () => null, SECRET);
    const viaFront = JSON.parse((await request('127.0.0.1', f.httpsPort, { path: '/api/x' })).body);
    expect(viaFront.client).toEqual({ address: '127.0.0.1', secure: true });
  });

  function installWithSecret(): void {
    vi.stubEnv(FRONT_SECRET_ENV, SECRET);
    installPeerAddressStamp();
  }

  function plainGet(host: string, port: number, headers: Record<string, string> = {}) {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      http
        .get({ host, port, path: '/api/workspaces/demo/files/open', headers }, (res) => {
          let body = '';
          res.on('data', (c) => {
            body += c;
          });
          res.on('end', () => resolve(JSON.parse(body)));
        })
        .on('error', reject);
    });
  }

  it('a browser on this machine through the front is local; its client is 127.0.0.1 over https', async () => {
    installWithSecret();
    const f = await front(await stampedNext(), () => null, SECRET);
    const r = JSON.parse((await request('127.0.0.1', f.httpsPort, { path: '/api/x' })).body);
    expect(r).toEqual({
      local: true,
      peer: '127.0.0.1',
      client: { address: '127.0.0.1', secure: true },
      markerSeen: false,
    });
  });

  it('install takes the secret out of process.env (child processes never inherit it)', () => {
    installWithSecret();
    expect(process.env[FRONT_SECRET_ENV]).toBeUndefined();
  });

  it.skipIf(!lanAddress)(
    'a LAN client through the front is refused by the guard and keyed on its own address',
    async () => {
      installWithSecret();
      const f = await front(await stampedNext(), () => null, SECRET);
      const r = JSON.parse(
        (
          await request(lanAddress as string, f.httpsPort, {
            path: '/api/x',
            headers: { 'x-forwarded-for': '127.0.0.1', host: 'localhost' },
          })
        ).body
      );
      expect(r).toEqual({
        local: false,
        peer: '127.0.0.1',
        client: { address: lanAddress, secure: true },
        markerSeen: false,
      });
    }
  );

  it.skipIf(!lanAddress)(
    'a direct LAN client cannot fake the front, even holding the real secret',
    async () => {
      installWithSecret();
      const r = await plainGet(lanAddress as string, await stampedNext(), {
        [FRONT_HEADER]: SECRET,
        'x-forwarded-for': '10.9.9.9',
        'x-forwarded-proto': 'https',
      });
      expect(r).toEqual({
        local: false,
        peer: lanAddress,
        client: { address: lanAddress, secure: false },
        markerSeen: false,
      });
    }
  );

  it('a direct loopback client with a wrong marker is its own socket peer, over http', async () => {
    installWithSecret();
    const r = await plainGet('127.0.0.1', await stampedNext(), {
      [FRONT_HEADER]: 'guessed-secret',
      'x-forwarded-for': '10.9.9.9',
      'x-forwarded-proto': 'https',
    });
    expect(r.client).toEqual({ address: '127.0.0.1', secure: false });
    expect(r.markerSeen).toBe(false);
  });

  it('a front without the secret is not trusted: every client is the shared loopback peer', async () => {
    installWithSecret();
    const f = await front(await stampedNext(), () => null);
    const r = JSON.parse((await request('127.0.0.1', f.httpsPort, { path: '/api/x' })).body);
    expect(r.client).toEqual({ address: '127.0.0.1', secure: false });
  });

  it('the secret never reaches streamd', async () => {
    installWithSecret();
    const streamd = await upgradeUpstreamHeaders();
    const f = await front(await stampedNext(), () => streamd.port, SECRET);
    const r = await upgrade(f.httpsPort, '/remote-view-ws/stream');
    cleanups.push(async () => {
      r.socket.destroy();
    });
    expect(r.status).toBe(101);
    expect(streamd.headers[0]?.[FRONT_HEADER]).toBeUndefined();
  });
});

/** An upgrade upstream that records the headers it saw. */
async function upgradeUpstreamHeaders(): Promise<{
  port: number;
  headers: http.IncomingHttpHeaders[];
}> {
  const headers: http.IncomingHttpHeaders[] = [];
  const server = http.createServer((_req, res) => res.end());
  server.on('upgrade', (req, socket) => {
    headers.push(req.headers);
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'
    );
    // http.Server sockets are half-open: echo (and so end) when the client ends.
    socket.pipe(socket);
  });
  const port = await listen(server);
  cleanups.push(closeServer(server));
  return { port, headers };
}
