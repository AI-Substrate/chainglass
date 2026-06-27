/**
 * Remote-view WS wire protocol — binary video-frame codec (Workshop 003 §Binary).
 *
 * Binary frames carry video only. Fixed 16-byte big-endian header, then one
 * AVCC access unit:
 *
 *   offset 0  u8   frameType   0x01 = video (others reserved → dropped silently)
 *   offset 1  u8   flags       bit0 = keyframe (IDR); bits1–7 reserved (0)
 *   offset 2  u16  reserved    0
 *   offset 4  u32  sequence    monotonic per session-attach (gaps = drops)
 *   offset 8  u64  captureTimestampMicros  daemon monotonic clock at capture
 *   offset 16 …    payload     one AVCC access unit
 *
 * Maps 1:1 to `new EncodedVideoChunk({ type, timestamp, data })` (see toChunkInit).
 * The header is mirrored byte-for-byte in the Swift daemon (Plan 088 Task 4.2);
 * `fixtures/frame-header.json` is the cross-language drift guard.
 *
 * u64 timestamps use BigInt (getBigUint64/setBigUint64) — values exceed the JS
 * Number safe-integer range.
 *
 * Plan 088 Phase 2 — T004.
 */

export const FRAME_TYPE_VIDEO = 0x01;
export const FRAME_HEADER_BYTES = 16;
export const FLAG_KEYFRAME = 0x01;

export interface FrameHeader {
  /** Frame type byte; 0x01 = video. */
  frameType: number;
  /** flags bit0 — IDR/keyframe. */
  keyframe: boolean;
  /** u32 monotonic sequence per session-attach. */
  sequence: number;
  /** u64 daemon capture timestamp, microseconds. */
  captureTimestampMicros: bigint;
}

export interface DecodedFrame {
  header: FrameHeader;
  payload: Uint8Array;
}

/** Node-safe shape matching `EncodedVideoChunkInit` (WebCodecs is browser-only). */
export interface EncodedChunkInit {
  type: 'key' | 'delta';
  timestamp: number;
  data: Uint8Array;
}

/** Encode the fixed 16-byte big-endian header. */
export function encodeFrameHeader(h: FrameHeader): Uint8Array {
  const buf = new ArrayBuffer(FRAME_HEADER_BYTES);
  const view = new DataView(buf);
  view.setUint8(0, h.frameType);
  view.setUint8(1, h.keyframe ? FLAG_KEYFRAME : 0);
  view.setUint16(2, 0, false); // reserved
  view.setUint32(4, h.sequence, false); // big-endian
  view.setBigUint64(8, h.captureTimestampMicros, false); // big-endian u64
  return new Uint8Array(buf);
}

/** Encode header + payload (one AVCC access unit) into a single frame buffer. */
export function encodeFrame(h: FrameHeader, payload: Uint8Array): Uint8Array {
  const header = encodeFrameHeader(h);
  const out = new Uint8Array(header.length + payload.length);
  out.set(header, 0);
  out.set(payload, header.length);
  return out;
}

function asBytes(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

/**
 * Decode the 16-byte header. Returns `null` for an unknown frame type (drop
 * silently per Workshop 003) or a buffer shorter than the header — never throws.
 */
export function decodeFrameHeader(buf: ArrayBuffer | Uint8Array): FrameHeader | null {
  const bytes = asBytes(buf);
  if (bytes.byteLength < FRAME_HEADER_BYTES) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frameType = view.getUint8(0);
  if (frameType !== FRAME_TYPE_VIDEO) return null; // unknown type → drop silently
  const flags = view.getUint8(1);
  const sequence = view.getUint32(4, false);
  const captureTimestampMicros = view.getBigUint64(8, false);
  return {
    frameType,
    keyframe: (flags & FLAG_KEYFRAME) !== 0,
    sequence,
    captureTimestampMicros,
  };
}

/** Decode header + payload. Returns `null` for an undecodable header. */
export function decodeFrame(buf: ArrayBuffer | Uint8Array): DecodedFrame | null {
  const bytes = asBytes(buf);
  const header = decodeFrameHeader(bytes);
  if (!header) return null;
  return { header, payload: bytes.subarray(FRAME_HEADER_BYTES) };
}

/** Map a decoded frame to an `EncodedVideoChunk` init shape (Phase 3 wires the real chunk). */
export function toChunkInit(frame: DecodedFrame): EncodedChunkInit {
  return {
    type: frame.header.keyframe ? 'key' : 'delta',
    timestamp: Number(frame.header.captureTimestampMicros),
    data: frame.payload,
  };
}
