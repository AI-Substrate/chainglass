/**
 * Health probe helpers — SDK-like building blocks for checking harness services.
 *
 * Each probe returns a typed status object. The health command composes these
 * into the full health envelope. Other commands can reuse individual probes
 * (e.g., `dev` waits for app probe to pass).
 */

import { getCdpBrowser, getCdpVersion } from '../cdp/connect.js';

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
  url = 'http://127.0.0.1:3000',
): Promise<AppStatus> {
  try {
    const res = await fetch(url);
    return { status: res.ok ? 'up' : 'down', code: String(res.status) };
  } catch {
    return { status: 'down', code: '0' };
  }
}

export async function probeMcp(
  url = 'http://127.0.0.1:3000/_next/mcp',
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
  port = 4500,
): Promise<TerminalStatus> {
  try {
    // Use a TCP connect check via fetch to the WebSocket port
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    await fetch(`http://${host}:${port}`, { signal: controller.signal }).catch(() => {});
    clearTimeout(timeout);

    // If we get here without a connection refused error, port is open
    // For WebSocket ports, any response (even error) means the port is listening
    return { status: 'up' };
  } catch {
    return { status: 'down' };
  }
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

export async function probeAll(): Promise<HealthResult> {
  const [app, mcp, terminal, cdp] = await Promise.all([
    probeApp(),
    probeMcp(),
    probeTerminal(),
    probeCdp(),
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
