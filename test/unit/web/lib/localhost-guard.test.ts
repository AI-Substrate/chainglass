/**
 * @vitest-environment node
 */
/**
 * "Local" means the TCP peer is this machine, and nothing the client sends can say otherwise.
 *
 * Before: Next 15+ never sets `NextRequest.ip`, so `isLocalhostRequest` fell back to the Host
 * header and accepted a loopback `X-Forwarded-For`, both client-controlled. A LAN client sending
 * `Host: localhost` (plus `X-Forwarded-For: 127.0.0.1` where Next would otherwise fill it in)
 * passed as local: `localhostGuard` (files/open launches apps), `requireLocalAuth`, and the
 * proxy's X-Local-Token short-circuit.
 *
 * After: `installPeerAddressStamp()` overwrites `x-chainglass-peer` with `<process token>
 * <socket remote address>` on every request/upgrade, and `isLocalhostRequest` trusts only a value
 * carrying this process's token. The real-server cases go through Node's http server so the stamp
 * runs exactly as it does under `next start`.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it } from 'vitest';

import { isLocalhostRequest, localhostGuard } from '../../../../apps/web/src/lib/localhost-guard';
import {
  PEER_HEADER,
  _peerHeaderForTests,
  _uninstallPeerAddressStampForTests,
  installPeerAddressStamp,
  socketPeerAddress,
} from '../../../../apps/web/src/lib/socket-peer';

const lanAddress = Object.values(networkInterfaces())
  .flat()
  .find((a) => a && a.family === 'IPv4' && !a.internal)?.address;

function headerRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/workspaces/demo/files/open', { headers });
}

afterEach(() => {
  _uninstallPeerAddressStampForTests();
});

describe('isLocalhostRequest ignores client-controlled headers', () => {
  it('a client claiming Host: localhost is not local', () => {
    installPeerAddressStamp();
    expect(isLocalhostRequest(headerRequest({ host: 'localhost:3000' }))).toBe(false);
  });

  it('a client sending X-Forwarded-For: 127.0.0.1 and Host: localhost is not local', () => {
    installPeerAddressStamp();
    const req = headerRequest({ host: 'localhost:3000', 'x-forwarded-for': '127.0.0.1' });
    expect(isLocalhostRequest(req)).toBe(false);
  });

  it('a client-sent peer header without the process token is not local', () => {
    installPeerAddressStamp();
    const req = headerRequest({ [PEER_HEADER]: 'guess 127.0.0.1', host: 'localhost:3000' });
    expect(isLocalhostRequest(req)).toBe(false);
  });

  it('nothing is local when the stamp is not installed', () => {
    installPeerAddressStamp();
    const headers = _peerHeaderForTests('127.0.0.1');
    _uninstallPeerAddressStampForTests();
    expect(isLocalhostRequest(headerRequest(headers))).toBe(false);
  });
});

/** A request as the stamp leaves it, or with no stamp at all (peer null). */
function stampedRequest(peer: string | null, extra: Record<string, string> = {}): NextRequest {
  return headerRequest(peer === null ? extra : { ...extra, ..._peerHeaderForTests(peer) });
}

describe('isLocalhostRequest with the stamp installed: the socket peer decides', () => {
  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('loopback peer %s is local', (peer) => {
    installPeerAddressStamp();
    expect(isLocalhostRequest(stampedRequest(peer))).toBe(true);
  });

  it('a non-loopback peer is not local, whatever Host says', () => {
    installPeerAddressStamp();
    expect(isLocalhostRequest(stampedRequest('192.168.1.100', { host: 'localhost:3000' }))).toBe(
      false
    );
  });

  it('no recorded peer is not local (fail closed)', () => {
    installPeerAddressStamp();
    expect(isLocalhostRequest(stampedRequest(null))).toBe(false);
  });

  it.each(['10.0.0.1', '127.0.0.1, 10.0.0.1'])(
    'a loopback peer relaying X-Forwarded-For %s (a reverse proxy) is not local',
    (xff) => {
      installPeerAddressStamp();
      expect(isLocalhostRequest(stampedRequest('127.0.0.1', { 'x-forwarded-for': xff }))).toBe(
        false
      );
    }
  );

  it('localhostGuard passes a local request and answers 403 otherwise', () => {
    installPeerAddressStamp();
    expect(localhostGuard(stampedRequest('127.0.0.1'))).toBeNull();
    expect(localhostGuard(stampedRequest('192.168.1.100'))?.status).toBe(403);
  });
});

function toHeaders(raw: http.IncomingHttpHeaders): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') h.set(k, v);
  return h;
}

/** Start a real http server that answers with the guard's verdict and the stamped peer. */
async function guardServer(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const nextReq = new NextRequest(`http://${req.headers.host}${req.url}`, {
      headers: toHeaders(req.headers),
    });
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        local: isLocalhostRequest(nextReq),
        peer: socketPeerAddress(nextReq.headers),
      })
    );
  });
  server.on('upgrade', (req, socket) => {
    const peer = socketPeerAddress(toHeaders(req.headers)) ?? '';
    socket.end(`HTTP/1.1 400 Bad Request\r\nx-peer: ${peer}\r\n\r\n`);
  });
  await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
  const { port } = server.address() as AddressInfo;
  return { port, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

function get(host: string, port: number, headers: Record<string, string> = {}) {
  return new Promise<{ local: boolean; peer: string | null }>((resolve, reject) => {
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

describe('isLocalhostRequest with the socket peer stamp (real http server)', () => {
  it('a request from 127.0.0.1 is local', async () => {
    installPeerAddressStamp();
    const srv = await guardServer();
    try {
      const r = await get('127.0.0.1', srv.port);
      expect(r).toEqual({ local: true, peer: '127.0.0.1' });
    } finally {
      await srv.close();
    }
  });

  it('a loopback request carrying a non-loopback X-Forwarded-For (a reverse proxy) is not local', async () => {
    installPeerAddressStamp();
    const srv = await guardServer();
    try {
      const r = await get('127.0.0.1', srv.port, { 'x-forwarded-for': '203.0.113.4' });
      expect(r.local).toBe(false);
    } finally {
      await srv.close();
    }
  });

  it.skipIf(!lanAddress)(
    'a LAN request spoofing the peer header, Host and X-Forwarded-For is not local',
    async () => {
      installPeerAddressStamp();
      const srv = await guardServer();
      try {
        const r = await get(lanAddress as string, srv.port, {
          host: `localhost:${srv.port}`,
          'x-forwarded-for': '127.0.0.1',
          // Even the real token cannot be smuggled in: the stamp overwrites the header.
          ..._peerHeaderForTests('127.0.0.1'),
        });
        expect(r).toEqual({ local: false, peer: lanAddress });
      } finally {
        await srv.close();
      }
    }
  );

  it.skipIf(!lanAddress)('upgrade requests are stamped with the real peer too', async () => {
    installPeerAddressStamp();
    const srv = await guardServer();
    try {
      const peer = await new Promise<string | undefined>((resolve, reject) => {
        const req = http.request({
          host: lanAddress,
          port: srv.port,
          headers: {
            connection: 'Upgrade',
            upgrade: 'websocket',
            ..._peerHeaderForTests('127.0.0.1'),
          },
        });
        req.on('response', (res) => {
          resolve(res.headers['x-peer'] as string | undefined);
          res.resume();
        });
        req.on('error', reject);
        req.end();
      });
      expect(peer).toBe(lanAddress);
    } finally {
      await srv.close();
    }
  });
});
