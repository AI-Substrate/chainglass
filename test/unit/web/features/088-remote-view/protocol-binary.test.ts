// @vitest-environment node
/**
 * Plan 088 Phase 2 — T004: binary video-frame header codec (Workshop 003 §Binary).
 *
 * TDD: this test + the cross-language fixture (protocol/fixtures/frame-header.json)
 * are authored first; protocol/binary.ts implements them. The fixture's hex
 * strings are the binary drift guard the Swift daemon (Task 4.2) matches
 * byte-for-byte.
 */
import {
  FRAME_HEADER_BYTES,
  FRAME_TYPE_VIDEO,
  decodeFrame,
  decodeFrameHeader,
  encodeFrame,
  encodeFrameHeader,
  toChunkInit,
} from '@/features/088-remote-view/protocol/binary';
import fixture from '@/features/088-remote-view/protocol/fixtures/frame-header.json';
import { describe, expect, it } from 'vitest';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(s: string): Uint8Array {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

describe('remote-view binary frame-header codec', () => {
  it('encodes each committed fixture row to the exact big-endian bytes', () => {
    /*
    Test Doc:
    - Why: the 16-byte header is mirrored in Swift (Task 4.2); a single byte of layout drift desyncs the two decoders.
    - Contract: encodeFrameHeader({frameType,keyframe,sequence,captureTimestampMicros}) produces the fixture's `hex` exactly.
    - Usage Notes: fixture captureTimestampMicros is a decimal string → BigInt; asserts against committed hex, not an in-test constant.
    - Quality Contribution: the binary half of the cross-language drift guard (Workshop 003 acceptance).
    - Worked Example: {seq:1,delta,ts:18150} → "010000000000000100000000000046e6".
    */
    for (const row of fixture.frames) {
      const bytes = encodeFrameHeader({
        frameType: FRAME_TYPE_VIDEO,
        keyframe: row.keyframe,
        sequence: row.sequence,
        captureTimestampMicros: BigInt(row.captureTimestampMicros),
      });
      expect(bytes.length).toBe(FRAME_HEADER_BYTES);
      expect(hex(bytes)).toBe(row.hex);
    }
  });

  it('decodes each committed fixture row back to its fields (round-trip, incl. u64 > 2^53)', () => {
    /*
    Test Doc:
    - Why: decode must reconstruct sequence + the full u64 timestamp without precision loss.
    - Contract: decodeFrameHeader(fixtureBytes) returns {frameType:0x01, keyframe, sequence, captureTimestampMicros:BigInt}.
    - Usage Notes: row 4 is 2^53+1 — only a BigInt u64 read survives it; a Number read would corrupt it.
    - Quality Contribution: proves getBigUint64 is used, not a lossy double read.
    - Worked Example: hex "…0020000000000001" → captureTimestampMicros === 9007199254740993n.
    */
    for (const row of fixture.frames) {
      const decoded = decodeFrameHeader(fromHex(row.hex));
      expect(decoded).not.toBeNull();
      expect(decoded?.frameType).toBe(FRAME_TYPE_VIDEO);
      expect(decoded?.keyframe).toBe(row.keyframe);
      expect(decoded?.sequence).toBe(row.sequence);
      expect(decoded?.captureTimestampMicros).toBe(BigInt(row.captureTimestampMicros));
    }
  });

  it('round-trips header + payload via encodeFrame / decodeFrame', () => {
    /*
    Test Doc:
    - Why: real frames carry an AVCC access unit after the header; the codec must split the two cleanly.
    - Contract: decodeFrame(encodeFrame(h, payload)) yields the same header and a byte-identical payload.
    - Usage Notes: payload is an arbitrary Uint8Array (stand-in for an AVCC AU).
    - Quality Contribution: confirms the 16-byte offset boundary between header and payload.
    - Worked Example: keyframe header + [0xde,0xad,0xbe,0xef] → same back out.
    */
    const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01]);
    const frame = encodeFrame(
      { frameType: FRAME_TYPE_VIDEO, keyframe: true, sequence: 7, captureTimestampMicros: 123456n },
      payload
    );
    const out = decodeFrame(frame);
    expect(out).not.toBeNull();
    expect(out?.header.sequence).toBe(7);
    expect(out?.header.keyframe).toBe(true);
    expect(out?.header.captureTimestampMicros).toBe(123456n);
    expect(Array.from(out?.payload ?? [])).toEqual(Array.from(payload));
  });

  it('maps 1:1 to an EncodedVideoChunk init (type + timestamp + data)', () => {
    /*
    Test Doc:
    - Why: Workshop 003 says the header maps 1:1 to new EncodedVideoChunk({type, timestamp, data}); the viewport (Phase 3) relies on it.
    - Contract: toChunkInit yields {type:'key'|'delta', timestamp:number (micros), data:payload}.
    - Usage Notes: EncodedVideoChunk isn't available in node, so we assert the init shape, not the constructed chunk.
    - Quality Contribution: pins the decode→WebCodecs bridge contract before Phase 3 wires the real decoder.
    - Worked Example: keyframe ts=123456n → {type:'key', timestamp:123456, data:…}.
    */
    const payload = new Uint8Array([1, 2, 3]);
    const keyInit = toChunkInit({
      header: { frameType: 1, keyframe: true, sequence: 0, captureTimestampMicros: 123456n },
      payload,
    });
    expect(keyInit.type).toBe('key');
    expect(keyInit.timestamp).toBe(123456);
    expect(Array.from(keyInit.data)).toEqual([1, 2, 3]);
    const deltaInit = toChunkInit({
      header: { frameType: 1, keyframe: false, sequence: 1, captureTimestampMicros: 200n },
      payload,
    });
    expect(deltaInit.type).toBe('delta');
  });

  it('drops unknown frame types and too-short buffers silently (returns null)', () => {
    /*
    Test Doc:
    - Why: Workshop 003 mandates "receiver MUST drop unknown frame types silently"; a truncated frame must not throw.
    - Contract: decodeFrameHeader returns null for frameType !== 0x01 and for buffers shorter than 16 bytes.
    - Usage Notes: covers a reserved future frame type (0x02) and a 4-byte runt.
    - Quality Contribution: hardens the hot path against malformed/forward-version frames.
    - Worked Example: a 0x02-typed header → null; the socket keeps reading.
    */
    const unknown = fromHex('02010000000000000000000000000000');
    expect(decodeFrameHeader(unknown)).toBeNull();
    expect(decodeFrameHeader(new Uint8Array([1, 0, 0, 0]))).toBeNull();
    expect(decodeFrame(new Uint8Array([1, 0]))).toBeNull();
  });
});
