'use client';

import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal } from '@xterm/xterm';
import { useTheme } from 'next-themes';
import { useEffect, useRef } from 'react';
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
  const { resolvedTheme } = useTheme();

  const { send, status, reconnect } = useTerminalSocket({
    sessionName,
    cwd,
    onData: (data) => {
      if (!disposedRef.current && terminalRef.current) {
        terminalRef.current.write(data);
      }
    },
    onConnectionChange,
  });

  // Store send in a ref so terminal.onData doesn't go stale
  const sendRef = useRef(send);
  sendRef.current = send;

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
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Canvas renderer for multi-instance safety (DR-01 finding 4)
    try {
      terminal.loadAddon(new CanvasAddon());
    } catch {
      // Fall back to default renderer if canvas fails
    }

    terminal.loadAddon(new WebLinksAddon());
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

      // 3. Dispose terminal (last — removes DOM)
      terminal.dispose();
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
    <div className={`relative flex h-full w-full flex-col ${className ?? ''}`}>
      <div ref={containerRef} className="h-full w-full flex-1" data-testid="terminal-container" />
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
    </div>
  );
}
