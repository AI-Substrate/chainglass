/**
 * Socket peer address for "is this request local?" decisions.
 *
 * Next.js 15+ removed `NextRequest.ip`, and neither the proxy nor route handlers can reach the
 * Node socket. Every header the client sends (Host, X-Forwarded-For, …) is client-controlled, so
 * none of them can say "this request came from this machine".
 *
 * `installPeerAddressStamp()` patches `emit` on Node's `http.Server` and `https.Server`
 * prototypes. For every `request` and `upgrade` event, before any listener (Next's router) sees
 * the request, it OVERWRITES the `x-chainglass-peer` header with `<token> <remoteAddress>`, where
 * `<token>` is a random value generated at install and never sent to clients.
 * `socketPeerAddress()` returns the address only when the header carries this process's token.
 *
 * Why a client cannot forge it:
 *  - The overwrite runs inside `emit`, after Node parses the request and before any listener runs,
 *    so whatever the client sent under that name is replaced (or deleted when the socket has no
 *    address).
 *  - A request that never passed through the stamp (it arrived before install, or came in through
 *    another server entrypoint) can only carry a client-chosen value, and the client does not
 *    know the token: `socketPeerAddress()` returns null and callers fail closed. This also covers
 *    requests that Next queued while starting up, before `register()` ran.
 *
 * Behind the TLS front (`tls-front.ts`, HTTPS mode) every request's socket peer is 127.0.0.1, so
 * the stamp also records the CLIENT: the front's `X-Forwarded-For` address and protocol, trusted
 * only when the request provably came from the front — a loopback socket peer AND
 * `x-chainglass-front` equal to the per-launch secret the recipe hands both processes in
 * `CHAINGLASS_FRONT_SECRET`. Otherwise the client is the socket peer and the protocol is the
 * socket's own. The stamp removes `x-chainglass-front` before any listener runs, and install
 * removes the secret from `process.env`, so neither app code nor child processes (agents,
 * terminals, streamd) ever see it.
 *
 * Installed once per process from `instrumentation.ts` `register()` (Node runtime). Route handlers
 * and the proxy run in the same process and share the `globalThis` state.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import type { TLSSocket } from 'node:tls';

export const PEER_HEADER = 'x-chainglass-peer';
/** Sent by the TLS front to Next only; the value is the launch's `CHAINGLASS_FRONT_SECRET`. */
export const FRONT_HEADER = 'x-chainglass-front';
export const FRONT_SECRET_ENV = 'CHAINGLASS_FRONT_SECRET';

export const LOOPBACK_ADDRESSES: ReadonlySet<string> = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
]);

/**
 * An address as one client key: IPv4-mapped IPv6 (`::ffff:a.b.c.d`, what a dual-stack listener
 * reports for IPv4 clients) unwrapped to `a.b.c.d`, so a client has the same key whether it
 * reaches Next directly or through the TLS front.
 */
export function unmapIPv4(address: string): string {
  return /^::ffff:\d{1,3}(\.\d{1,3}){3}$/i.test(address) ? address.slice(7) : address;
}

type Emit = (this: unknown, event: string | symbol, ...args: unknown[]) => boolean;

interface StampState {
  token: string;
  /** The TLS front's secret for this launch, or null when no front was started with this server. */
  frontSecret: Buffer | null;
  originals: Array<{ proto: { emit: Emit }; emit: Emit }>;
}

const globalState = globalThis as typeof globalThis & { __chainglassPeerStamp?: StampState };

function sameSecret(given: string, secret: Buffer): boolean {
  const buf = Buffer.from(given);
  return buf.length === secret.length && timingSafeEqual(buf, secret);
}

function stamp(req: http.IncomingMessage, state: StampState): void {
  const marker = req.headers[FRONT_HEADER];
  delete req.headers[FRONT_HEADER];
  const peer = req.socket?.remoteAddress;
  if (!peer) {
    delete req.headers[PEER_HEADER];
    return;
  }
  let client = unmapIPv4(peer);
  let proto = (req.socket as TLSSocket).encrypted ? 'https' : 'http';
  if (
    state.frontSecret &&
    typeof marker === 'string' &&
    LOOPBACK_ADDRESSES.has(peer) &&
    sameSecret(marker, state.frontSecret)
  ) {
    // The front overwrites X-Forwarded-For with exactly one address: its client's socket.
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && /^[0-9A-Fa-f.:]+$/.test(forwarded)) {
      client = unmapIPv4(forwarded);
    }
    proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  }
  req.headers[PEER_HEADER] = `${state.token} ${peer} ${client} ${proto}`;
}

/** Patch http/https servers in this process to stamp the socket peer on every request. Idempotent. */
export function installPeerAddressStamp(): void {
  if (globalState.__chainglassPeerStamp) return;
  const secret = process.env[FRONT_SECRET_ENV];
  // Keep the secret out of every child process (agents, streamd) Next spawns.
  delete process.env[FRONT_SECRET_ENV];
  const state: StampState = {
    token: randomBytes(24).toString('base64url'),
    frontSecret: secret ? Buffer.from(secret) : null,
    originals: [],
  };
  for (const proto of [http.Server.prototype, https.Server.prototype] as unknown as Array<{
    emit: Emit;
  }>) {
    const original = proto.emit;
    state.originals.push({ proto, emit: original });
    proto.emit = function emitWithPeerStamp(this: unknown, event, ...args) {
      if (event === 'request' || event === 'upgrade') {
        stamp(args[0] as http.IncomingMessage, state);
      }
      return original.call(this, event, ...args);
    };
  }
  globalState.__chainglassPeerStamp = state;
}

/** The stamp's fields for this request, or null when this process did not stamp it. */
function readStamp(headers: Headers): { peer: string; client: string; secure: boolean } | null {
  const state = globalState.__chainglassPeerStamp;
  const value = headers.get(PEER_HEADER);
  if (!state || !value) return null;
  const [token, peer, client, proto] = value.split(' ');
  const given = Buffer.from(token);
  const expected = Buffer.from(state.token);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (!peer || !client || (proto !== 'http' && proto !== 'https')) return null;
  return { peer, client, secure: proto === 'https' };
}

/**
 * The socket peer address the stamp recorded for this request, or null when the request was not
 * stamped by this process (stamp not installed, header missing, or token mismatch). Behind the TLS
 * front this is 127.0.0.1; `requestClient()` gives the client behind it.
 */
export function socketPeerAddress(headers: Headers): string | null {
  return readStamp(headers)?.peer ?? null;
}

/**
 * Who sent this request and over what: the TLS front's client address and protocol when the
 * request came through the front (proven by its secret), else the socket peer and the socket's
 * protocol. Null when the request was not stamped by this process.
 */
export function requestClient(headers: Headers): { address: string; secure: boolean } | null {
  const s = readStamp(headers);
  return s ? { address: s.client, secure: s.secure } : null;
}

/**
 * Test-only: the header a stamped request carries — from socket peer `address`, and (behind the
 * front) from `client` over `proto`. Requires the stamp.
 */
export function _peerHeaderForTests(
  address: string,
  client: string = address,
  proto: 'http' | 'https' = 'http'
): Record<string, string> {
  const state = globalState.__chainglassPeerStamp;
  if (!state) throw new Error('installPeerAddressStamp() first');
  return { [PEER_HEADER]: `${state.token} ${address} ${client} ${proto}` };
}

/** Test-only: restore the original `emit` methods and forget the token. */
export function _uninstallPeerAddressStampForTests(): void {
  const state = globalState.__chainglassPeerStamp;
  if (!state) return;
  for (const { proto, emit } of state.originals) proto.emit = emit;
  globalState.__chainglassPeerStamp = undefined;
}
