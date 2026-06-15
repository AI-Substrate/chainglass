/**
 * Remote-view WS wire protocol — control messages (Workshop 003).
 *
 * Text frames = JSON control (this file); binary frames = video only
 * (`binary.ts`). Every message is a discriminated union on `t` (client) or `t`
 * (server); input events discriminate on `k`. Zod parse-at-boundary matches the
 * repo convention (064-terminal imports `from 'zod'`); zod v4 `discriminatedUnion`.
 *
 * These types are mirrored as Swift `Codable` structs in the daemon (Plan 088
 * Task 4.2). The canonical fixture set (`fixtures/messages.json`) is the
 * cross-language drift guard — both runners round-trip the same objects.
 *
 * Forward-compat rules (Workshop 003): receivers MUST ignore unknown `t`
 * (the parse helpers return `null`, not throw) and unknown fields (Zod strips
 * them by default). The protocol only ever evolves additively before v2.
 *
 * Plan 088 Phase 2 — T003.
 */
import { z } from 'zod';

/** Protocol major version, exchanged in hello / hello-ok. */
export const PROTOCOL_VERSION = 1 as const;

// ───────────────────────── shared shapes ─────────────────────────

/** Keyboard modifier flags (DOM `KeyboardEvent` modifier state). */
export const ModsSchema = z.object({
  shift: z.boolean(),
  ctrl: z.boolean(),
  alt: z.boolean(),
  meta: z.boolean(),
});
export type Mods = z.infer<typeof ModsSchema>;

/** Mouse button index: 0=left, 1=middle, 2=right. */
const ButtonSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

/**
 * One input event. Coordinates `x`,`y` are normalized `[0,1]` of the video
 * frame — the client never knows window points; the daemon owns the mapping.
 * Keyboard uses DOM `code` (physical position); `text` covers IME/unicode.
 */
export const InputEventSchema = z.discriminatedUnion('k', [
  z.object({ k: z.literal('mousemove'), x: z.number(), y: z.number() }),
  z.object({ k: z.literal('mousedown'), x: z.number(), y: z.number(), button: ButtonSchema }),
  z.object({ k: z.literal('mouseup'), x: z.number(), y: z.number(), button: ButtonSchema }),
  z.object({ k: z.literal('wheel'), x: z.number(), y: z.number(), dx: z.number(), dy: z.number() }),
  z.object({ k: z.literal('keydown'), code: z.string(), modifiers: ModsSchema }),
  z.object({ k: z.literal('keyup'), code: z.string(), modifiers: ModsSchema }),
  z.object({ k: z.literal('text'), text: z.string() }),
]);
export type InputEvent = z.infer<typeof InputEventSchema>;

/** Window descriptor carried in `hello-ok` (and reused by the session service). */
export const WindowDescriptorSchema = z.object({
  id: z.number(),
  app: z.string(),
  title: z.string(),
  pixelWidth: z.number(),
  pixelHeight: z.number(),
  scale: z.number(),
});
export type WindowDescriptor = z.infer<typeof WindowDescriptorSchema>;

/** Protocol error codes (Workshop 003 §Error codes). Stable strings agents switch on. */
export const ERROR_CODES = [
  'E_AUTH',
  'E_ORIGIN',
  'E_VERSION',
  'E_SESSION_UNKNOWN',
  'E_WINDOW_GONE',
  'E_PERMISSION',
  'E_INTERNAL',
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Window-state transitions the daemon broadcasts. */
export const WindowStateSchema = z.enum(['minimized', 'restored', 'resized', 'moved', 'gone']);
export type WindowStateName = z.infer<typeof WindowStateSchema>;

// ───────────────────────── browser → daemon ─────────────────────────

export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hello'), v: z.literal(PROTOCOL_VERSION), session: z.string() }),
  z.object({ t: z.literal('input'), events: z.array(InputEventSchema) }),
  z.object({ t: z.literal('request-keyframe') }),
  z.object({ t: z.literal('pause') }),
  z.object({ t: z.literal('resume') }),
  z.object({
    t: z.literal('client-stats'),
    decodeFps: z.number(),
    queueDepth: z.number(),
    e2eLatencyMs: z.number().nullable(),
  }),
  z.object({ t: z.literal('ping'), sentAt: z.number() }),
  z.object({ t: z.literal('detach') }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ───────────────────────── daemon → browser ─────────────────────────

export const ServerMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello-ok'),
    v: z.literal(PROTOCOL_VERSION),
    session: z.string(),
    window: WindowDescriptorSchema,
  }),
  z.object({
    t: z.literal('video-config'),
    codec: z.string(),
    description: z.string(),
    width: z.number(),
    height: z.number(),
    fps: z.number(),
  }),
  z.object({
    t: z.literal('window-state'),
    state: WindowStateSchema,
    pixelWidth: z.number().optional(),
    pixelHeight: z.number().optional(),
  }),
  z.object({ t: z.literal('displaced') }),
  z.object({
    t: z.literal('stats'),
    captureFps: z.number(),
    encodeFps: z.number(),
    bitrateKbps: z.number(),
    droppedFrames: z.number(),
    bufferedAmount: z.number(),
  }),
  z.object({ t: z.literal('pong'), sentAt: z.number(), daemonAt: z.number() }),
  z.object({ t: z.literal('error'), code: ErrorCodeSchema, message: z.string(), fatal: z.boolean() }),
  z.object({ t: z.literal('bye'), reason: z.enum(['detached', 'window-gone', 'shutdown']) }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// ───────────────────────── parse / encode helpers ─────────────────────────

/** Accept a JSON string or a pre-parsed object; bad JSON → undefined. */
function coerce(data: unknown): unknown {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return undefined;
    }
  }
  return data;
}

/**
 * Parse a browser→daemon message at the boundary. Returns `null` for anything
 * invalid OR carrying an unknown `t` (forward-compat: ignore, never throw).
 */
export function parseClientMessage(data: unknown): ClientMessage | null {
  const result = ClientMessageSchema.safeParse(coerce(data));
  return result.success ? result.data : null;
}

/**
 * Parse a daemon→browser message at the boundary. Returns `null` for anything
 * invalid OR carrying an unknown `t` (forward-compat: ignore, never throw).
 */
export function parseServerMessage(data: unknown): ServerMessage | null {
  const result = ServerMessageSchema.safeParse(coerce(data));
  return result.success ? result.data : null;
}

/** Serialize a control message to a WS text frame. */
export function encodeMessage(msg: ClientMessage | ServerMessage): string {
  return JSON.stringify(msg);
}
