'use client';

import { CanvasAddon } from '@xterm/addon-canvas';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';

import { useTerminalSocket } from '../hooks/use-terminal-socket';
import type { ConnectionStatus } from '../types';

// DYK-05: xterm.js v6 requires new object references for theme updates
const DARK_THEME = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  black: '#1e1e1e',
  red: '#f44747',
  green: '#6a9955',
  yellow: '#d7ba7d',
  blue: '#569cd6',
  magenta: '#c586c0',
  cyan: '#4ec9b0',
  white: '#d4d4d4',
  brightBlack: '#808080',
  brightRed: '#f44747',
  brightGreen: '#6a9955',
  brightYellow: '#d7ba7d',
  brightBlue: '#569cd6',
  brightMagenta: '#c586c0',
  brightCyan: '#4ec9b0',
  brightWhite: '#e8e8e8',
};

const LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#1e1e1e',
  cursor: '#1e1e1e',
  cursorAccent: '#ffffff',
  selectionBackground: '#add6ff',
  black: '#1e1e1e',
  red: '#cd3131',
  green: '#008000',
  yellow: '#795e26',
  blue: '#0451a5',
  magenta: '#af00db',
  cyan: '#0598bc',
  white: '#d4d4d4',
  brightBlack: '#808080',
  brightRed: '#cd3131',
  brightGreen: '#008000',
  brightYellow: '#795e26',
  brightBlue: '#0451a5',
  brightMagenta: '#af00db',
  brightCyan: '#0598bc',
  brightWhite: '#1e1e1e',
};

interface TerminalInnerProps {
  sessionName: string;
  cwd: string;
  className?: string;
  onConnectionChange?: (status: ConnectionStatus) => void;
  onCopyBuffer?: () => void;
}

export default function TerminalInner({
  sessionName,
  cwd,
  className,
  onConnectionChange,
}: TerminalInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const [copyModalText, setCopyModalText] = useState<string | null>(null);
  const [bottomOffset, setBottomOffset] = useState(0);
  const tmuxWarningShownRef = useRef(false);
  const { resolvedTheme } = useTheme();

  // Dynamic bottom offset via visualViewport — for iOS keyboard/browser chrome
  // Only activates on touch devices; desktop gets full height (bottom: 0)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    // Only apply on touch devices (iPad, phone)
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouch) return;

    const handleResize = () => {
      const offset = Math.max(0, Math.round(window.innerHeight - vv.height));
      setBottomOffset(offset);
    };
    handleResize();
    vv.addEventListener('resize', handleResize);
    return () => vv.removeEventListener('resize', handleResize);
  }, []);

  const showCopyModal = useCallback((text: string) => setCopyModalText(text), []);

  // Store last clipboard data for modal fallback
  const lastClipboardDataRef = useRef<string | null>(null);

  const { send, status, reconnect, copyBuffer } = useTerminalSocket({
    sessionName,
    cwd,
    onData: (data) => {
      if (!disposedRef.current && terminalRef.current) {
        terminalRef.current.write(data);
      }
    },
    onClipboard: async (data, error) => {
      if (error || !data) {
        const { toast } = await import('sonner');
        toast.error(error ?? 'No buffer available');
      }
      // Store for modal fallback, then broadcast to deferred clipboard write
      lastClipboardDataRef.current = data ?? null;
      window.dispatchEvent(new CustomEvent('terminal:clipboard-data', { detail: { data, error } }));
    },
    onStatus: async (_status, _tmux, _message) => {
      // DYK-01: Show toast once per mount when tmux is unavailable
      if (_status === 'connected' && _tmux === false && !tmuxWarningShownRef.current) {
        tmuxWarningShownRef.current = true;
        const { toast } = await import('sonner');
        toast.warning(
          _message ??
            "tmux not available — using raw shell. Sessions won't persist across page refreshes."
        );
      }
      // Re-fit terminal when WS confirms connection — PTY is now ready for resize
      if (_status === 'connected' && fitAddonRef.current && !disposedRef.current) {
        requestAnimationFrame(() => {
          if (disposedRef.current || !fitAddonRef.current) return;
          fitAddonRef.current.fit();
          const dims = fitAddonRef.current.proposeDimensions();
          if (dims) {
            sendRef.current(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
          }
        });
      }
    },
    onConnectionChange,
  });

  // Store send in a ref so terminal.onData doesn't go stale
  const sendRef = useRef(send);
  sendRef.current = send;

  // Listen for copy-buffer requests from header buttons (triggers WS request)
  const copyBufferRef = useRef(copyBuffer);
  copyBufferRef.current = copyBuffer;
  useEffect(() => {
    const handler = () => copyBufferRef.current();
    window.addEventListener('terminal:copy-buffer', handler);
    return () => window.removeEventListener('terminal:copy-buffer', handler);
  }, []);

  // Listen for modal fallback requests (HTTP origins where clipboard.write fails)
  useEffect(() => {
    const handler = () => {
      if (lastClipboardDataRef.current) {
        showCopyModal(lastClipboardDataRef.current);
      }
    };
    window.addEventListener('terminal:show-copy-modal', handler);
    return () => window.removeEventListener('terminal:show-copy-modal', handler);
  }, [showCopyModal]);

  // Store initial theme in ref so init effect doesn't depend on resolvedTheme
  const initialThemeRef = useRef(resolvedTheme);
  initialThemeRef.current = resolvedTheme;

  // Initialize terminal + addons + ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    disposedRef.current = false;

    const theme = initialThemeRef.current === 'dark' ? DARK_THEME : LIGHT_THEME;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily:
        "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, 'Courier New', monospace",
      theme,
      scrollback: 10000,
      allowProposedApi: true,
      // OSC 52 clipboard integration — tmux sends clipboard data via escape sequences
      // Requires tmux: set -g set-clipboard on; set -g allow-passthrough on
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Canvas renderer for multi-instance safety (DR-01 finding 4)
    let canvasAddon: CanvasAddon | null = null;
    try {
      canvasAddon = new CanvasAddon();
      terminal.loadAddon(canvasAddon);
    } catch {
      canvasAddon = null;
    }

    const webLinksAddon = new WebLinksAddon();
    terminal.loadAddon(webLinksAddon);

    // OSC 52 clipboard — enables copy from tmux mouse selection to browser clipboard
    const clipboardAddon = new ClipboardAddon();
    terminal.loadAddon(clipboardAddon);

    terminal.open(container);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Initial fit after a frame (container needs to be laid out)
    requestAnimationFrame(() => {
      if (disposedRef.current) return;
      fitAddon.fit();
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        sendRef.current(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    });

    // PL-08: Register onData handler BEFORE terminal is connected
    terminal.onData((data) => {
      sendRef.current(data);
    });

    // T004: ResizeObserver + FitAddon integration
    const observer = new ResizeObserver(() => {
      if (disposedRef.current) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (disposedRef.current) return;
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          sendRef.current(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
        }
      });
    });
    observer.observe(container);
    observerRef.current = observer;

    // DYK-03: Cleanup order matters — observer before dispose
    return () => {
      disposedRef.current = true;

      // 1. Stop resize events
      observer.disconnect();
      observerRef.current = null;

      // 2. Cancel pending animation frames
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      // 3. Dispose addons before terminal (WebLinksAddon crashes if terminal disposes first)
      try {
        clipboardAddon.dispose();
      } catch {
        /* already disposed */
      }
      try {
        webLinksAddon.dispose();
      } catch {
        /* already disposed */
      }
      try {
        canvasAddon?.dispose();
      } catch {
        /* already disposed */
      }
      try {
        fitAddon.dispose();
      } catch {
        /* already disposed */
      }

      // 4. Dispose terminal (last — removes DOM)
      try {
        terminal.dispose();
      } catch {
        /* strict mode double-dispose */
      }
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- terminal init runs once
  }, []);

  // T005: Theme sync — update terminal theme when app theme changes
  useEffect(() => {
    if (disposedRef.current || !terminalRef.current) return;
    // DYK-05: Must assign a new object reference for xterm to detect the change
    terminalRef.current.options.theme = resolvedTheme === 'dark' ? DARK_THEME : LIGHT_THEME;
  }, [resolvedTheme]);

  return (
    <div className={`relative h-full w-full ${className ?? ''}`}>
      <div
        ref={containerRef}
        className="absolute top-0 left-0 right-0"
        style={{ bottom: `${bottomOffset}px` }}
        data-testid="terminal-container"
      />
      {status === 'disconnected' && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <span>Disconnected</span>
            <button
              type="button"
              onClick={reconnect}
              className="rounded-md border px-3 py-1 text-xs hover:bg-accent"
            >
              Reconnect
            </button>
          </div>
        </div>
      )}
      {copyModalText !== null && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/90">
          <div
            className="flex flex-col gap-3 rounded-lg border bg-background p-4 shadow-xl"
            style={{ width: '800px', maxWidth: '95vw', height: '800px', maxHeight: '90vh' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Select and copy text below</span>
              <button
                type="button"
                onClick={() => setCopyModalText(null)}
                className="rounded-sm p-1 hover:bg-accent text-muted-foreground"
              >
                ✕
              </button>
            </div>
            <textarea
              readOnly
              value={copyModalText}
              className="flex-1 w-full rounded border bg-muted p-3 font-mono text-sm resize-none"
              onFocus={(e) => {
                e.target.select();
                e.target.setSelectionRange(0, e.target.value.length);
              }}
            />
            <span className="text-xs text-muted-foreground">Long-press or Ctrl+A then copy</span>
          </div>
        </div>
      )}
    </div>
  );
}
