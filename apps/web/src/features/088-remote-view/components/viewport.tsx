'use client';

/**
 * Viewport — WebCodecs decode → canvas + HUD + Workshop-002 state chrome
 * (Plan 088 Phase 3, T004 decode core + T005 HUD/states).
 *
 * The session hook owns the single WebSocket (control + binary video on one socket);
 * it forwards `video-config`, each decoded frame, daemon `stats`, and ping/pong RTT
 * here via callbacks, and exposes `requestKeyframe()` + `ping()`. This component owns
 * the video plane and the on-screen chrome:
 *   - configure a `VideoDecoder` DATA-DRIVEN from `video-config` (codec, avcC
 *     `description`, dims all from the wire — never hardcoded, so Phase 4's real
 *     encoder params flow through);
 *   - decode each frame to the canvas, resyncing on a keyframe after (re)config;
 *   - browser-side backpressure (Workshop 003): decode queue too deep → drop to the
 *     next keyframe and ask for an IDR;
 *   - a live stats HUD (fps, latency, dropped, bitrate). Latency is the ping/pong
 *     round-trip MEASUREMENT PATH (proven against the fake); true capture→display
 *     glass-to-glass needs the real daemon's wall-clock frame stamps (Phase 6, AC-2);
 *   - render every Workshop-002 viewport state. `displaced` ALWAYS shows a Reclaim
 *     button and never self-resolves (F004 — the FSM traps it; only reclaim/pick/detach
 *     escape). `error` names the failure; `E_PERMISSION` names the TCC grant (AC-14;
 *     the System-Settings fix path + how-to are Phase 6).
 *
 * NOT unit-tested (jsdom has no WebCodecs) — validated by the browser smoke (T007),
 * per the Constitution Deviation Ledger. `data-testid="remote-view-viewport"` is the
 * lazy-chunk sentinel the bundle guard (T008) asserts is code-split (AC-13).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useInputCapture } from '../hooks/use-input-capture';
import { useRemoteViewSession } from '../hooks/use-remote-view-session';
import { type DecodedFrame, toChunkInit } from '../protocol/binary';
import type { ErrorCode } from '../protocol/messages';
import type { ViewportStateName } from '../server/session-machine';
import { useRemoteViewStatsPublisher } from '../state/use-remote-view-stats-publisher';

export interface ViewportProps {
  /** WS base url of the daemon/fake, e.g. `ws://127.0.0.1:<port>`. */
  url: string;
  /** Active session id (the `rv` param). */
  session: string;
  /** Picked window id, or null on a deep-link re-enter (hook learns it from hello-ok). */
  windowId: number | null;
  /** Return to the window picker (clears `rv`); used by the state-chrome "back" actions. */
  onExit: () => void;
}

/** Workshop 003 browser-side backpressure: drop deltas to the next keyframe past this depth. */
const DECODE_QUEUE_DROP_THRESHOLD = 10;
const PING_INTERVAL_MS = 2000;
const HUD_SAMPLE_MS = 1000;

interface HudStats {
  fps: number;
  latencyMs: number | null;
  dropped: number;
  bitrateKbps: number;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** E_PERMISSION names the exact TCC grant; other codes get a plain label (Phase 6 adds fix paths). */
const ERROR_TEXT: Record<ErrorCode, string> = {
  E_AUTH: 'Authentication failed for the stream.',
  E_ORIGIN: 'This origin is not allowed to stream.',
  E_VERSION: 'The daemon and app protocol versions do not match.',
  E_SESSION_UNKNOWN: 'That session no longer exists.',
  E_WINDOW_GONE: 'The window is no longer available.',
  E_PERMISSION:
    'Screen Recording permission is required on the host Mac (System Settings → Privacy & Security → Screen Recording).',
  E_INTERNAL: 'The streamer hit an internal error.',
};

export function Viewport({ url, session, windowId, onExit }: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const configSigRef = useRef<string | null>(null);
  const awaitingKeyframeRef = useRef(true);
  const requestKeyframeRef = useRef<() => void>(() => {});

  // HUD accumulators (sampled into `hud` state once per second).
  const frameCountRef = useRef(0);
  const byteCountRef = useRef(0);
  const droppedRef = useRef(0);
  const latencyRef = useRef<number | null>(null);
  const [hud, setHud] = useState<HudStats>({ fps: 0, latencyMs: null, dropped: 0, bitrateKbps: 0 });
  // null = unknown (no config yet); false = WebCodecs/this config unsupported → fallback overlay (F003).
  const [supported, setSupported] = useState<boolean | null>(() =>
    typeof VideoDecoder === 'undefined' || typeof EncodedVideoChunk === 'undefined' ? false : null
  );

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
    async (config: { codec: string; description: string; width: number; height: number }) => {
      if (typeof VideoDecoder === 'undefined' || typeof EncodedVideoChunk === 'undefined') {
        setSupported(false); // WebCodecs missing (older Safari, no GPU) → fallback, not a crash (F003)
        return;
      }
      // Signature includes the avcC `description`: a real daemon may resend changed SPS/PPS at the
      // same codec+dims, which MUST trigger a reconfigure (F004).
      const sig = `${config.codec}:${config.width}x${config.height}:${config.description}`;
      if (configSigRef.current === sig && decoderRef.current?.state === 'configured') return;
      const decoderConfig: VideoDecoderConfig = {
        codec: config.codec,
        codedWidth: config.width,
        codedHeight: config.height,
        description: base64ToBytes(config.description),
        optimizeForLatency: true,
      };
      // Verify before constructing — an unsupported codec/avcC renders the fallback, never throws (F003).
      try {
        const probe = await VideoDecoder.isConfigSupported(decoderConfig);
        if (!probe.supported) {
          setSupported(false);
          return;
        }
      } catch {
        setSupported(false);
        return;
      }
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
      try {
        decoder.configure(decoderConfig);
      } catch {
        setSupported(false);
        return;
      }
      decoderRef.current = decoder;
      configSigRef.current = sig;
      awaitingKeyframeRef.current = true; // need an IDR after (re)config
      setSupported(true);
      requestKeyframeRef.current();
    },
    [drawFrame]
  );

  const handleFrame = useCallback((frame: DecodedFrame) => {
    const decoder = decoderRef.current;
    if (!decoder || decoder.state !== 'configured') return;
    const init = toChunkInit(frame);
    frameCountRef.current += 1;
    byteCountRef.current += init.data.byteLength;
    // After (re)config or a drop, resync only on a keyframe.
    if (awaitingKeyframeRef.current) {
      if (init.type !== 'key') return;
      awaitingKeyframeRef.current = false;
    }
    // Browser-side backpressure: queue too deep → drop to the next keyframe (Workshop 003).
    if (decoder.decodeQueueSize > DECODE_QUEUE_DROP_THRESHOLD) {
      awaitingKeyframeRef.current = true;
      droppedRef.current += 1;
      requestKeyframeRef.current();
      return;
    }
    try {
      decoder.decode(
        new EncodedVideoChunk({ type: init.type, timestamp: init.timestamp, data: init.data })
      );
    } catch {
      awaitingKeyframeRef.current = true;
      droppedRef.current += 1;
      requestKeyframeRef.current();
    }
  }, []);

  const handlePong = useCallback((rttMs: number) => {
    latencyRef.current = rttMs;
  }, []);

  const handleStats = useCallback((stats: { droppedFrames: number; bitrateKbps: number }) => {
    // Prefer daemon-measured drops when present (real daemon, Phase 6); bitrate stays client-measured.
    droppedRef.current = stats.droppedFrames;
  }, []);

  const { state, errorMessage, reclaim, requestKeyframe, ping, sendInput } = useRemoteViewSession({
    url,
    session,
    windowId,
    onVideoConfig: handleVideoConfig,
    onFrame: handleFrame,
    onPong: handlePong,
    onStats: handleStats,
  });
  requestKeyframeRef.current = requestKeyframe;

  const { capturing } = useInputCapture({
    canvasRef,
    send: sendInput,
    enabled: state.name === 'live' || state.name === 'degraded',
  });

  // GlobalState quality publisher (T007) — additive to the HUD; throttled to 5s internally.
  const statsPublisher = useRemoteViewStatsPublisher();

  // HUD sampler: once a second, snapshot fps/bitrate from the accumulators.
  useEffect(() => {
    const id = setInterval(() => {
      const fps = frameCountRef.current;
      const bitrateKbps = Math.round((byteCountRef.current * 8) / 1000);
      frameCountRef.current = 0;
      byteCountRef.current = 0;
      setHud({ fps, bitrateKbps, dropped: droppedRef.current, latencyMs: latencyRef.current });
      // Publish a 5s-throttled copy for agents (Workshop 003 Q2) — the HUD path above is unchanged.
      statsPublisher.publishFps(session, fps);
      if (latencyRef.current != null) statsPublisher.publishLatencyMs(session, latencyRef.current);
    }, HUD_SAMPLE_MS);
    return () => clearInterval(id);
  }, [session, statsPublisher]);

  // App-level ping loop for HUD latency (the daemon answers with pong → onPong RTT).
  useEffect(() => {
    const id = setInterval(() => ping(), PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ping]);

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
      {/* The canvas is the input surface — focusable (tabIndex) so it can capture keyboard
          for the streamed app (Workshop 001 §Focus). */}
      <canvas
        ref={canvasRef}
        data-testid="remote-view-viewport-canvas"
        tabIndex={0}
        className="h-full w-full object-contain outline-none"
      />

      {supported === false ? (
        <div
          data-testid="remote-view-unsupported"
          className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-white/80"
        >
          Video playback isn’t supported in this browser. Use a recent Chromium-based browser.
        </div>
      ) : (
        <>
          {(state.name === 'live' || state.name === 'degraded') && (
            <div
              data-testid="remote-view-hud"
              className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-white/80"
            >
              {hud.fps} fps · rtt {hud.latencyMs == null ? '—' : `${hud.latencyMs}ms`} ·{' '}
              {hud.bitrateKbps} kbps · {hud.dropped} dropped
            </div>
          )}
          {capturing && (
            <div
              data-testid="remote-view-capturing"
              className="absolute bottom-2 left-2 rounded bg-primary/80 px-2 py-1 text-[11px] text-primary-foreground"
            >
              ⌨ keys captured · ⌘⇧Esc to release
            </div>
          )}
          <ViewportChrome
            name={state.name}
            errorCode={state.errorCode}
            errorMessage={errorMessage}
            onReclaim={reclaim}
            onExit={onExit}
          />
        </>
      )}
    </div>
  );
}

function ViewportChrome({
  name,
  errorCode,
  errorMessage,
  onReclaim,
  onExit,
}: {
  name: ViewportStateName;
  errorCode: ErrorCode | null;
  errorMessage: string | null;
  onReclaim: () => void;
  onExit: () => void;
}) {
  if (name === 'live') return null;

  const backButton = (
    <button
      type="button"
      onClick={onExit}
      className="rounded border border-white/30 px-3 py-1 text-sm text-white hover:bg-white/10"
    >
      Back to windows
    </button>
  );

  // Transient overlays — the canvas (last frame) stays visible behind a small badge.
  if (
    name === 'attaching' ||
    name === 'reconnecting' ||
    name === 'degraded' ||
    name === 'sessionLost'
  ) {
    const label =
      name === 'attaching'
        ? 'Connecting…'
        : name === 'reconnecting'
          ? 'Reconnecting…'
          : name === 'degraded'
            ? 'Stream stalled — waiting for frames…'
            : 'Session lost — recovering…';
    return (
      <div
        data-testid={`remote-view-state-${name}`}
        className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white/80"
      >
        {label}
      </div>
    );
  }

  // Blocking cards — the stream can't continue without a user action.
  let title: string;
  let body: string;
  if (name === 'displaced') {
    title = 'Taken over in another tab';
    body = 'This window is being viewed elsewhere. Reclaim it here, or go back to the window list.';
  } else if (name === 'windowGone') {
    title = 'Window closed';
    body = 'The streamed window is gone.';
  } else if (name === 'daemonDown') {
    title = 'Streamer not responding';
    body = 'Could not reach the streamer on the host Mac.';
  } else {
    title = 'Stream error';
    // Prefer the daemon's message (F007); ERROR_TEXT is the fallback and always names the
    // E_PERMISSION grant (AC-14). The stable code is shown as a badge for support/agents.
    body = errorMessage ?? (errorCode ? ERROR_TEXT[errorCode] : 'The stream stopped unexpectedly.');
  }

  return (
    <div
      data-testid={`remote-view-state-${name}`}
      className="absolute inset-0 flex items-center justify-center bg-black/70"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg border border-white/15 bg-background p-6 text-center">
        <div className="text-sm font-medium">{title}</div>
        {name === 'error' && errorCode && (
          <code
            data-testid="remote-view-error-code"
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
          >
            {errorCode}
          </code>
        )}
        <div className="text-xs text-muted-foreground">{body}</div>
        <div className="flex gap-2">
          {name === 'displaced' && (
            <button
              type="button"
              onClick={onReclaim}
              data-testid="remote-view-reclaim"
              className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground hover:opacity-90"
            >
              Reclaim
            </button>
          )}
          {backButton}
        </div>
      </div>
    </div>
  );
}
