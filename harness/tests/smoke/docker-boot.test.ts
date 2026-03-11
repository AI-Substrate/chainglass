/**
 * Harness Integration Test: Docker Boot
 *
 * Full TDD — this test was written BEFORE the Dockerfile.
 * Validates: container starts, app responds, terminal sidecar responds.
 *
 * Uses describe.skip — unskip locally when Docker/OrbStack is running.
 * Does NOT run in `just fft`.
 */

import { describe, expect, it } from 'vitest';
import { computePorts } from '../../src/ports/allocator.js';

const ports = computePorts();
const APP_URL = process.env.HARNESS_APP_URL ?? `http://localhost:${ports.app}`;
const TERMINAL_URL = process.env.HARNESS_TERMINAL_URL ?? `http://localhost:${ports.terminal}`;

describe.skip('Harness: Docker Boot', () => {
  it('app responds with 200 on root', async () => {
    const response = await fetch(APP_URL);
    expect(response.status).toBe(200);
  }, 10_000);

  it('app returns HTML content', async () => {
    const response = await fetch(APP_URL);
    const text = await response.text();
    expect(text).toContain('<!DOCTYPE html');
  }, 10_000);

  it('API health endpoint responds', async () => {
    const response = await fetch(`${APP_URL}/api/health`);
    expect(response.ok).toBe(true);
  }, 10_000);

  it('MCP endpoint is accessible', async () => {
    const response = await fetch(`${APP_URL}/_next/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 }),
    });
    // MCP may return 200 or 405 depending on transport — just check it responds
    expect(response.status).toBeLessThan(500);
  }, 10_000);

  it('terminal sidecar is listening', async () => {
    // Terminal WS server doesn't serve HTTP, but the port should be open
    try {
      const response = await fetch(TERMINAL_URL);
      // Any response (even 400/426 upgrade required) means the server is running
      expect(response.status).toBeDefined();
    } catch (error: unknown) {
      // Connection refused = server not running
      if (
        error instanceof TypeError &&
        (error as { cause?: { code?: string } }).cause?.code === 'ECONNREFUSED'
      ) {
        expect.fail('Terminal sidecar not responding on port 4500');
      }
      // Other errors (e.g., upgrade required) are acceptable — server is running
    }
  }, 10_000);

  it('auth is bypassed (DISABLE_AUTH=true)', async () => {
    const response = await fetch(`${APP_URL}/api/workspaces`);
    // Should NOT get 401 — auth bypass should work
    expect(response.status).not.toBe(401);
  }, 10_000);

  it('HMR/dev mode is active', async () => {
    const response = await fetch(APP_URL);
    const text = await response.text();
    // Dev mode includes Next.js dev scripts
    expect(text).toContain('_next');
  }, 10_000);
});
