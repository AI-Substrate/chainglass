/**
 * Health probe helpers — SDK-like building blocks for checking harness services.
 *
 * Each probe returns a typed status object. The health command composes these
 * into the full health envelope. Other commands can reuse individual probes
 * (e.g., `dev` waits for app probe to pass).
 */

import net from 'node:net';
import { getCdpBrowser, getCdpVersion } from '../cdp/connect.js';

import type { HarnessPorts } from '../ports/allocator.js';

export interface ServiceStatus {
  status: 'up' | 'down';
}

export interface AppStatus extends ServiceStatus {
  code: string;
}

export interface McpStatus extends ServiceStatus {
  code: string;
}

export interface TerminalStatus extends ServiceStatus {}

export interface CdpStatus extends ServiceStatus {
  browser: string | null;
}

export interface HealthResult {
  status: 'ok' | 'degraded' | 'down';
  app: AppStatus;
  mcp: McpStatus;
  terminal: TerminalStatus;
  cdp: CdpStatus;
}

export async function probeApp(
  url = 'http://127.0.0.1:3100',
): Promise<AppStatus> {
  try {
    const res = await fetch(url);
    return { status: res.ok ? 'up' : 'down', code: String(res.status) };
  } catch {
    return { status: 'down', code: '0' };
  }
}

export async function probeMcp(
  url = 'http://127.0.0.1:3100/_next/mcp',
): Promise<McpStatus> {
  try {
    const res = await fetch(url);
    // MCP returns 406 when accessible but no proper Accept header — that's "up"
    const code = String(res.status);
    const isUp = res.status !== 0 && code !== '000';
    return { status: isUp ? 'up' : 'down', code };
  } catch {
    return { status: 'down', code: '0' };
  }
}

export async function probeTerminal(
  host = '127.0.0.1',
  port = 4600,
): Promise<TerminalStatus> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      resolve({ status: 'up' });
    });
    socket.once('error', () => resolve({ status: 'down' }));
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve({ status: 'down' });
    });
  });
}

export async function probeCdp(
  url = 'http://127.0.0.1:9222',
): Promise<CdpStatus> {
  try {
    const info = await getCdpVersion(url);
    return { status: 'up', browser: info.Browser ?? null };
  } catch {
    return { status: 'down', browser: null };
  }
}

export async function probeAll(ports?: HarnessPorts): Promise<HealthResult> {
  const appPort = ports?.app ?? 3100;
  const terminalPort = ports?.terminal ?? 4600;
  const cdpPort = ports?.cdp ?? 9222;

  const [app, mcp, terminal, cdp] = await Promise.all([
    probeApp(`http://127.0.0.1:${appPort}`),
    probeMcp(`http://127.0.0.1:${appPort}/_next/mcp`),
    probeTerminal('127.0.0.1', terminalPort),
    probeCdp(`http://127.0.0.1:${cdpPort}`),
  ]);

  const allUp = app.status === 'up' && terminal.status === 'up' && cdp.status === 'up';
  const allDown = app.status === 'down' && terminal.status === 'down' && cdp.status === 'down';

  return {
    status: allDown ? 'down' : allUp ? 'ok' : 'degraded',
    app,
    mcp,
    terminal,
    cdp,
  };
}
