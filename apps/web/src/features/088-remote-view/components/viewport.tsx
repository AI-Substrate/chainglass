'use client';

/**
 * Viewport — WebCodecs decode → canvas (Plan 088 Phase 3, T004 decode core).
 *
 * The session hook owns the single WebSocket (control + binary video on one socket);
 * it forwards `video-config` and each decoded frame here via callbacks, and exposes
 * `requestKeyframe()` for drop-recovery. This component owns only the *video plane*:
 *   - configure a `VideoDecoder` from the daemon's `video-config` (DATA-DRIVEN — codec,
 *     avcC `description`, dims all come from the wire, so Phase 4's real encoder params
 *     flow through unchanged; never hardcode avc1.640020/800×656);
 *   - decode each frame to the canvas, resyncing on a keyframe after (re)config;
 *   - browser-side backpressure (Workshop 003): if the decode queue runs deep, drop to
 *     the next keyframe and ask the daemon for an IDR.
 *
 * NOT unit-tested (jsdom has no WebCodecs) — validated by the browser smoke (T007),
 * per the Constitution Deviation Ledger. The full HUD + per-state chrome land in T005;
 * this task renders the canvas + a minimal status overlay.
 *
 * `data-testid="remote-view-viewport"` is the lazy-chunk sentinel the bundle guard
 * (T008) asserts is code-split out of the base bundle (AC-13).
 */

import { useCallback, useEffect, useRef } from 'react';
import { useRemoteViewSession } from '../hooks/use-remote-view-session';
import { type DecodedFrame, toChunkInit } from '../protocol/binary';
import type { VideoConfigMessage } from '../protocol/messages';

export interface ViewportProps {
  /** WS base url of the daemon/fake, e.g. `ws://127.0.0.1:<port>`. */
  url: string;
  /** Active session id (the `rv` param). */
  session: string;
  /** Picked window id, or null on a deep-link re-enter (hook learns it from hello-ok). */
  windowId: number | null;
}

/** Workshop 003 browser-side backpressure: drop deltas to the next keyframe past this depth. */
const DECODE_QUEUE_DROP_THRESHOLD = 10;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function Viewport({ url, session, windowId }: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const configSigRef = useRef<string | null>(null);
  const awaitingKeyframeRef = useRef(true);
  const requestKeyframeRef = useRef<() => void>(() => {});

  const drawFrame = useCallback((frame: VideoFrame) => {
    const canvas = canvasRef.current;
    if (canvas) {
      if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth;
      if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight;
      let ctx = ctxRef.current;
      if (!ctx) {
        ctx = canvas.getContext('2d');
        ctxRef.current = ctx;
      }
      ctx?.drawImage(frame, 0, 0);
    }
    frame.close();
  }, []);

  const handleVideoConfig = useCallback(
    (config: VideoConfigMessage) => {
      const sig = `${config.codec}:${config.width}x${config.height}`;
      if (configSigRef.current === sig && decoderRef.current?.state === 'configured') return;
      try {
        decoderRef.current?.close();
      } catch {
        /* noop */
      }
      const decoder = new VideoDecoder({
        output: drawFrame,
        error: () => {
          awaitingKeyframeRef.current = true;
          requestKeyframeRef.current();
        },
      });
      decoder.configure({
        codec: config.codec,
        codedWidth: config.width,
        codedHeight: config.height,
        description: base64ToBytes(config.description),
        optimizeForLatency: true,
      });
      decoderRef.current = decoder;
      configSigRef.current = sig;
      awaitingKeyframeRef.current = true; // need an IDR after (re)config
      requestKeyframeRef.current();
    },
    [drawFrame]
  );

  const handleFrame = useCallback((frame: DecodedFrame) => {
    const decoder = decoderRef.current;
    if (!decoder || decoder.state !== 'configured') return;
    const init = toChunkInit(frame);
    // After (re)config or a drop, resync only on a keyframe.
    if (awaitingKeyframeRef.current) {
      if (init.type !== 'key') return;
      awaitingKeyframeRef.current = false;
    }
    // Browser-side backpressure: queue too deep → drop to the next keyframe (Workshop 003).
    if (decoder.decodeQueueSize > DECODE_QUEUE_DROP_THRESHOLD) {
      awaitingKeyframeRef.current = true;
      requestKeyframeRef.current();
      return;
    }
    try {
      decoder.decode(
        new EncodedVideoChunk({ type: init.type, timestamp: init.timestamp, data: init.data })
      );
    } catch {
      awaitingKeyframeRef.current = true;
      requestKeyframeRef.current();
    }
  }, []);

  const { state, requestKeyframe } = useRemoteViewSession({
    url,
    session,
    windowId,
    onVideoConfig: handleVideoConfig,
    onFrame: handleFrame,
  });
  requestKeyframeRef.current = requestKeyframe;

  // Tear the decoder down on unmount so a re-mount starts clean.
  useEffect(
    () => () => {
      try {
        decoderRef.current?.close();
      } catch {
        /* noop */
      }
      decoderRef.current = null;
    },
    []
  );

  return (
    <div className="relative h-full w-full bg-black" data-testid="remote-view-viewport">
      <canvas
        ref={canvasRef}
        data-testid="remote-view-viewport-canvas"
        className="h-full w-full object-contain"
      />
      {state.name !== 'live' ? (
        <div
          data-testid="remote-view-viewport-status"
          className="absolute inset-0 flex items-center justify-center text-sm text-white/70"
        >
          {state.name}…
        </div>
      ) : null}
    </div>
  );
}
