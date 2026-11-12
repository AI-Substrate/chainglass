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
 * Installed once per process from `instrumentation.ts` `register()` (Node runtime). Route handlers
 * and the proxy run in the same process and share the `globalThis` state.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

export const PEER_HEADER = 'x-chainglass-peer';

type Emit = (this: unknown, event: string | symbol, ...args: unknown[]) => boolean;

interface StampState {
  token: string;
  originals: Array<{ proto: { emit: Emit }; emit: Emit }>;
}

const globalState = globalThis as typeof globalThis & { __chainglassPeerStamp?: StampState };

function stamp(req: http.IncomingMessage, token: string): void {
  const address = req.socket?.remoteAddress;
  if (address) {
    req.headers[PEER_HEADER] = `${token} ${address}`;
  } else {
    delete req.headers[PEER_HEADER];
  }
}

/** Patch http/https servers in this process to stamp the socket peer on every request. Idempotent. */
export function installPeerAddressStamp(): void {
  if (globalState.__chainglassPeerStamp) return;
  const token = randomBytes(24).toString('base64url');
  const originals: StampState['originals'] = [];
  for (const proto of [http.Server.prototype, https.Server.prototype] as unknown as Array<{
    emit: Emit;
  }>) {
    const original = proto.emit;
    originals.push({ proto, emit: original });
    proto.emit = function emitWithPeerStamp(this: unknown, event, ...args) {
      if (event === 'request' || event === 'upgrade') {
        stamp(args[0] as http.IncomingMessage, token);
      }
      return original.call(this, event, ...args);
    };
  }
  globalState.__chainglassPeerStamp = { token, originals };
}

/**
 * The socket peer address the stamp recorded for this request, or null when the request was not
 * stamped by this process (stamp not installed, header missing, or token mismatch).
 */
export function socketPeerAddress(headers: Headers): string | null {
  const state = globalState.__chainglassPeerStamp;
  const value = headers.get(PEER_HEADER);
  if (!state || !value) return null;
  const space = value.indexOf(' ');
  if (space <= 0) return null;
  const given = Buffer.from(value.slice(0, space));
  const expected = Buffer.from(state.token);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return value.slice(space + 1) || null;
}

/** Test-only: the header a stamped request from `address` carries. Requires the stamp. */
export function _peerHeaderForTests(address: string): Record<string, string> {
  const state = globalState.__chainglassPeerStamp;
  if (!state) throw new Error('installPeerAddressStamp() first');
  return { [PEER_HEADER]: `${state.token} ${address}` };
}

/** Test-only: restore the original `emit` methods and forget the token. */
export function _uninstallPeerAddressStampForTests(): void {
  const state = globalState.__chainglassPeerStamp;
  if (!state) return;
  for (const { proto, emit } of state.originals) proto.emit = emit;
  globalState.__chainglassPeerStamp = undefined;
}
