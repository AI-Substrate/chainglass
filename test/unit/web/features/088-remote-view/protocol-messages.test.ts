// @vitest-environment node
/**
 * Plan 088 Phase 2 — T003: wire-protocol control-message schemas (Workshop 003).
 *
 * TDD: these tests + the canonical fixture file (protocol/fixtures/messages.json)
 * are authored first; protocol/messages.ts implements them. The fixture file is
 * the cross-language source of truth — the Swift daemon (Task 4.2) round-trips
 * the same objects, so this suite is half of the drift guard.
 */
import {
  ClientMessageSchema,
  ERROR_CODES,
  type ServerMessage,
  ServerMessageSchema,
  encodeMessage,
  parseClientMessage,
  parseServerMessage,
} from '@/features/088-remote-view/protocol/messages';
import fixtures from '@/features/088-remote-view/protocol/fixtures/messages.json';
import { describe, expect, it } from 'vitest';

const CLIENT_TYPES = [
  'hello',
  'input',
  'request-keyframe',
  'pause',
  'resume',
  'client-stats',
  'ping',
  'detach',
] as const;
const SERVER_TYPES = [
  'hello-ok',
  'video-config',
  'window-state',
  'displaced',
  'stats',
  'pong',
  'error',
  'bye',
] as const;
const INPUT_KINDS = [
  'mousemove',
  'mousedown',
  'mouseup',
  'wheel',
  'keydown',
  'keyup',
  'text',
] as const;

describe('remote-view wire protocol — control messages', () => {
  it('round-trips every canonical client + server fixture (encode → parse identity)', () => {
    /*
    Test Doc:
    - Why: the protocol is the interface between the web feature, the fake, and the Swift daemon; every shape must survive encode→wire→decode unchanged (Workshop 003 §Type Ownership).
    - Contract: parseClientMessage(encodeMessage(m)) deep-equals m for all client fixtures; same for server fixtures.
    - Usage Notes: fixtures live in protocol/fixtures/messages.json (cross-language); parse helpers JSON-parse strings then Zod safeParse.
    - Quality Contribution: codec round-trip per message (Workshop 003 acceptance) — the half of the drift guard the TS side owns.
    - Worked Example: {t:'hello',v:1,session:'ses_…'} → JSON string → back to the identical object.
    */
    for (const m of fixtures.client) {
      expect(parseClientMessage(encodeMessage(m as never))).toEqual(m);
    }
    for (const m of fixtures.server) {
      expect(parseServerMessage(encodeMessage(m as never))).toEqual(m);
    }
  });

  it('covers every message type, all 7 error codes, and all 7 input-event kinds in the fixtures', () => {
    /*
    Test Doc:
    - Why: a fixture set that silently omits a message type or error code is a false drift guard — Swift could diverge on the missing one undetected.
    - Contract: the fixtures' `t` values cover CLIENT_TYPES and SERVER_TYPES exactly; server `error` fixtures cover all ERROR_CODES; the `input` fixture exercises every InputEvent `k`.
    - Usage Notes: derives the present sets from the fixture file and compares to the canonical lists.
    - Quality Contribution: keeps messages.json complete as the protocol evolves (drift-rule enforcement).
    - Worked Example: removing the E_PERMISSION error fixture fails this test before it can desync Task 4.2.
    */
    const clientTs = new Set(fixtures.client.map((m) => m.t));
    const serverTs = new Set(fixtures.server.map((m) => m.t));
    expect([...clientTs].sort()).toEqual([...CLIENT_TYPES].sort());
    expect([...serverTs].sort()).toEqual([...SERVER_TYPES].sort());

    const codes = new Set(
      fixtures.server.filter((m) => m.t === 'error').map((m) => (m as { code: string }).code)
    );
    expect([...codes].sort()).toEqual([...ERROR_CODES].sort());

    const inputMsg = fixtures.client.find((m) => m.t === 'input') as
      | { events: { k: string }[] }
      | undefined;
    expect(inputMsg).toBeDefined();
    const kinds = new Set(inputMsg?.events.map((e) => e.k));
    expect([...kinds].sort()).toEqual([...INPUT_KINDS].sort());
  });

  it('rejects malformed messages (parse helper returns null, never throws)', () => {
    /*
    Test Doc:
    - Why: parse-at-boundary must reject garbage deterministically rather than crash the socket handler.
    - Contract: structurally-invalid messages → null from the parse helper; no exception escapes.
    - Usage Notes: covers missing fields, wrong version literal, wrong field type, invalid enum, invalid button, non-JSON string.
    - Quality Contribution: hardens the receive path against partial/hostile frames (Plan 064 PL-03 lesson).
    - Worked Example: {t:'hello',v:2,…} fails the v:literal(1) check → null.
    */
    const badClient: unknown[] = [
      { t: 'hello' }, // missing v + session
      { t: 'hello', v: 2, session: 'x' }, // wrong version literal
      { t: 'ping', sentAt: 'not-a-number' },
      { t: 'input', events: [{ k: 'mousedown', x: 0, y: 0, button: 5 }] }, // invalid button
      'not json at all',
    ];
    for (const b of badClient) {
      expect(parseClientMessage(b)).toBeNull();
    }
    const badServer: unknown[] = [
      { t: 'error', code: 'E_NOPE', message: 'x', fatal: false }, // invalid code
      { t: 'hello-ok', v: 1, session: 'x' }, // missing window
      { t: 'window-state', state: 'spinning' }, // invalid state enum
    ];
    for (const b of badServer) {
      expect(parseServerMessage(b)).toBeNull();
    }
    expect(() => parseClientMessage(undefined)).not.toThrow();
  });

  it('ignores an unknown discriminator `t` (forward-compat — returns null, not a throw)', () => {
    /*
    Test Doc:
    - Why: Workshop 003 mandates "receivers MUST ignore unknown `t`" so the protocol can add message types additively without breaking old clients.
    - Contract: a message with an unrecognised `t` → null (caller skips it); discriminatedUnion would otherwise throw.
    - Usage Notes: safeParse under the hood converts the would-be throw into a null.
    - Quality Contribution: guarantees additive evolution safety (Workshop 003 §Version) before v2.
    - Worked Example: {t:'frobnicate', …} from a future daemon → null, socket stays open.
    */
    expect(parseClientMessage({ t: 'frobnicate', payload: 1 })).toBeNull();
    expect(parseServerMessage({ t: 'super-new-event' })).toBeNull();
  });

  it('strips unknown extra fields (forward-compat — unknown fields ignored, not rejected)', () => {
    /*
    Test Doc:
    - Why: Workshop 003 mandates "ignore unknown fields" so a newer sender can add optional fields a v1 receiver simply drops.
    - Contract: a valid message carrying extra keys parses successfully; the parsed result contains only the schema-declared keys.
    - Usage Notes: relies on Zod's default object behaviour (strip unknown keys).
    - Quality Contribution: confirms additive field evolution is safe and lossless for known fields.
    - Worked Example: {t:'pause', futureFlag:true} → {t:'pause'}.
    */
    expect(parseClientMessage({ t: 'pause', futureFlag: true })).toEqual({ t: 'pause' });
    const parsed = parseServerMessage({
      t: 'pong',
      sentAt: 1,
      daemonAt: 2,
      newField: 'ignored',
    }) as ServerMessage | null;
    expect(parsed).toEqual({ t: 'pong', sentAt: 1, daemonAt: 2 });
  });

  it('exposes Zod schemas usable directly by the fake and the hook', () => {
    /*
    Test Doc:
    - Why: the fake (T005) and the reconnect hook (T007) import these schemas directly to validate at their boundaries.
    - Contract: ClientMessageSchema / ServerMessageSchema are exported and safeParse correctly.
    - Usage Notes: a smoke check that the public schema exports exist and behave.
    - Quality Contribution: pins the public surface other Phase 2 tasks depend on.
    - Worked Example: ServerMessageSchema.safeParse({t:'displaced'}).success === true.
    */
    expect(ClientMessageSchema.safeParse({ t: 'detach' }).success).toBe(true);
    expect(ServerMessageSchema.safeParse({ t: 'displaced' }).success).toBe(true);
  });
});
