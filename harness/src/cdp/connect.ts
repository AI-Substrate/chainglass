/**
 * CDP connection helper — single source of truth for the connectOverCDP handshake.
 *
 * Both Playwright test fixtures and CLI commands (screenshot, test) use this
 * to discover the WebSocket debugger URL and connect. One place to fix when
 * CDP behavior changes (see Phase 2 socat proxy discovery).
 */

const DEFAULT_CDP_URL = 'http://127.0.0.1:9222';

export interface CdpVersionInfo {
  webSocketDebuggerUrl: string;
  Browser: string;
  [key: string]: unknown;
}

export async function getCdpVersion(
  cdpUrl = DEFAULT_CDP_URL,
): Promise<CdpVersionInfo> {
  const response = await fetch(`${cdpUrl}/json/version`);
  if (!response.ok) {
    throw new Error(`CDP endpoint not available at ${cdpUrl}: ${response.status}`);
  }
  return (await response.json()) as CdpVersionInfo;
}

export async function getWsEndpoint(cdpUrl = DEFAULT_CDP_URL): Promise<string> {
  const info = await getCdpVersion(cdpUrl);
  return info.webSocketDebuggerUrl;
}

export async function getCdpBrowser(cdpUrl = DEFAULT_CDP_URL): Promise<string | null> {
  try {
    const info = await getCdpVersion(cdpUrl);
    return info.Browser ?? null;
  } catch {
    return null;
  }
}

export async function isCdpAvailable(cdpUrl = DEFAULT_CDP_URL): Promise<boolean> {
  try {
    await getCdpVersion(cdpUrl);
    return true;
  } catch {
    return false;
  }
}
