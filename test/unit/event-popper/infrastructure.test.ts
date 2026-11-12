import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverServerInfo,
  listServerInfo,
  readServerInfo,
  removeServerInfo,
  writeServerInfo,
} from '@chainglass/shared/event-popper';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isLocalhostRequest, localhostGuard } from '../../../apps/web/src/lib/localhost-guard.js';
import { removeTmpDir } from '../../helpers/tmpdir';

/*
Test Doc:
- Why: Validate server port discovery and the localhost guard
- Contract: per-port server entries (round-trip, discovery, PID liveness), localhost guard
- Usage Notes: Port discovery tests use real tmp dirs (not FakeFileSystem) for atomic write verification
- Quality Contribution: guards server.json discovery the CLI and local auth rely on
- Worked Example: port round-trip, localhost allow/deny
*/

// ─── T003: Port Discovery Tests ────────────────────────────────

describe('port-discovery', () => {
  let testDir: string;
  const originalRequestedPort = process.env.CG_SERVER_PORT;

  function entry(port: number, mode: 'dev' | 'prod', pid = process.pid) {
    return { port, pid, startedAt: new Date().toISOString(), mode, localToken: `tok-${port}` };
  }

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `event-popper-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
    // biome-ignore lint/performance/noDelete: assigning undefined leaves the string "undefined"
    delete process.env.CG_SERVER_PORT;
  });

  afterEach(() => {
    removeTmpDir(testDir);
    if (originalRequestedPort === undefined) {
      // biome-ignore lint/performance/noDelete: assigning undefined leaves the string "undefined"
      delete process.env.CG_SERVER_PORT;
    } else {
      process.env.CG_SERVER_PORT = originalRequestedPort;
    }
  });

  it('write then read round-trip returns same info', () => {
    const info = entry(3000, 'prod');
    writeServerInfo(testDir, info);
    expect(readServerInfo(testDir, 3000)).toEqual(info);
  });

  it('returns null when no entry exists for the port', () => {
    writeServerInfo(testDir, entry(3000, 'prod'));
    expect(readServerInfo(testDir, 3010)).toBeNull();
  });

  it('returns null when PID is not alive', () => {
    writeServerInfo(testDir, entry(3000, 'prod', 999999999));
    expect(readServerInfo(testDir, 3000)).toBeNull();
    expect(listServerInfo(testDir)).toEqual([]);
  });

  it('returns null for malformed JSON', () => {
    const dir = join(testDir, '.chainglass', 'servers');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '3000.json'), 'not-json', 'utf-8');
    expect(readServerInfo(testDir, 3000)).toBeNull();
  });

  it('keeps a prod and a dev server side by side', () => {
    const prod = entry(3000, 'prod');
    const dev = entry(3010, 'dev', process.ppid);
    writeServerInfo(testDir, dev);
    writeServerInfo(testDir, prod);
    expect(readServerInfo(testDir, 3000)).toEqual(prod);
    expect(readServerInfo(testDir, 3010)).toEqual(dev);
    expect(listServerInfo(testDir)).toEqual([prod, dev]);
  });

  it('discoverServerInfo prefers prod, then the lowest port', () => {
    writeServerInfo(testDir, entry(3020, 'dev'));
    writeServerInfo(testDir, entry(3010, 'dev'));
    expect(discoverServerInfo(testDir)?.port).toBe(3010);
    writeServerInfo(testDir, entry(3030, 'prod'));
    expect(discoverServerInfo(testDir)?.port).toBe(3030);
  });

  it('CG_SERVER_PORT selects exactly that server', () => {
    writeServerInfo(testDir, entry(3000, 'prod'));
    writeServerInfo(testDir, entry(3010, 'dev'));
    process.env.CG_SERVER_PORT = '3010';
    expect(discoverServerInfo(testDir)?.localToken).toBe('tok-3010');
    process.env.CG_SERVER_PORT = '3020';
    expect(discoverServerInfo(testDir)).toBeNull();
    process.env.CG_SERVER_PORT = 'dev';
    expect(() => discoverServerInfo(testDir)).toThrow(/CG_SERVER_PORT/);
  });

  it('removeServerInfo deletes only an entry the caller still owns', () => {
    writeServerInfo(testDir, entry(3000, 'prod', process.ppid));
    removeServerInfo(testDir, 3000, process.pid);
    expect(readServerInfo(testDir, 3000)?.pid).toBe(process.ppid);

    writeServerInfo(testDir, entry(3000, 'prod'));
    removeServerInfo(testDir, 3000, process.pid);
    expect(existsSync(join(testDir, '.chainglass', 'servers', '3000.json'))).toBe(false);
  });
});

// ─── T005: Localhost Guard Tests ────────────────────────────────

function makeRequest(options: { ip?: string; headers?: Record<string, string> }): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/workspaces/ws/files/open', {
    headers: options.headers ?? {},
  });
  // NextRequest.ip is read-only, so we override via Object.defineProperty
  if (options.ip !== undefined) {
    Object.defineProperty(req, 'ip', { value: options.ip, writable: false });
  }
  return req;
}

describe('isLocalhostRequest', () => {
  it('allows request from 127.0.0.1', () => {
    const req = makeRequest({ ip: '127.0.0.1' });
    expect(isLocalhostRequest(req)).toBe(true);
  });

  it('allows request from ::1', () => {
    const req = makeRequest({ ip: '::1' });
    expect(isLocalhostRequest(req)).toBe(true);
  });

  it('allows request from ::ffff:127.0.0.1', () => {
    const req = makeRequest({ ip: '::ffff:127.0.0.1' });
    expect(isLocalhostRequest(req)).toBe(true);
  });

  it('rejects request from non-loopback IP', () => {
    const req = makeRequest({ ip: '192.168.1.100' });
    expect(isLocalhostRequest(req)).toBe(false);
  });

  it('rejects request with X-Forwarded-For header (proxy bypass)', () => {
    const req = makeRequest({
      ip: '127.0.0.1',
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    expect(isLocalhostRequest(req)).toBe(false);
  });

  it('rejects request with no trusted peer address (fail closed)', () => {
    const req = makeRequest({});
    expect(isLocalhostRequest(req)).toBe(false);
  });
});

describe('localhostGuard', () => {
  it('returns null (pass) for localhost requests', () => {
    const req = makeRequest({ ip: '127.0.0.1' });
    const result = localhostGuard(req);
    expect(result).toBeNull();
  });

  it('returns 403 for non-localhost requests', () => {
    const req = makeRequest({ ip: '192.168.1.100' });
    const result = localhostGuard(req);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });

  it('returns 403 for proxied requests', () => {
    const req = makeRequest({
      ip: '127.0.0.1',
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    const result = localhostGuard(req);
    expect(result).not.toBeNull();
    expect(result?.status).toBe(403);
  });
});

// ─── Port Discovery: Recycled PID Test ─────────────────────────

describe('readServerInfo recycled PID', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `event-popper-recycle-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    removeTmpDir(testDir);
  });

  it('returns null when recorded startedAt is far in the past relative to live process', () => {
    // Write an entry with our own PID but a very old startedAt
    // The real process (this test runner) started much later, so recycling check should catch it
    const info = {
      port: 3000,
      pid: process.pid,
      startedAt: '2020-01-01T00:00:00.000Z', // far in the past
      mode: 'dev' as const,
    };
    writeServerInfo(testDir, info);
    const result = readServerInfo(testDir, 3000);
    // On macOS/Linux, getProcessStartTime will return a time much later than 2020,
    // so the recycling guard should return null.
    // On unsupported platforms, getProcessStartTime returns null and the check is skipped.
    if (process.platform === 'darwin' || process.platform === 'linux') {
      expect(result).toBeNull();
    }
  });
});
