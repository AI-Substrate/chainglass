import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EventPopperRequestSchema,
  EventPopperResponseSchema,
  generateEventId,
  readServerInfo,
  removeServerInfo,
  writeServerInfo,
} from '@chainglass/shared/event-popper';
import { detectTmuxContext, getTmuxMeta } from '@chainglass/shared/event-popper';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isLocalhostRequest, localhostGuard } from '../../../apps/web/src/lib/localhost-guard.js';

/*
Test Doc:
- Why: Validate all Phase 1 Event Popper infrastructure contracts
- Contract: EventPopperRequest/Response schemas, generateEventId, port discovery, localhost guard, tmux detection
- Usage Notes: Port discovery tests use real tmp dirs (not FakeFileSystem) for atomic write verification
- Quality Contribution: TDD for all pure infrastructure utilities; guards against Zod v4 regressions
- Worked Example: Schema accept/reject, GUID monotonicity, port round-trip, localhost allow/deny
*/

// ─── T001: Schema Tests ────────────────────────────────────────

describe('EventPopperRequestSchema', () => {
  const validRequest = {
    version: 1 as const,
    type: 'question',
    createdAt: '2026-03-07T05:52:00.000Z',
    source: 'claude-code:agent-1',
    payload: { text: 'Deploy?' },
  };

  it('accepts valid request data', () => {
    const result = EventPopperRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it('accepts request with optional meta', () => {
    const result = EventPopperRequestSchema.safeParse({
      ...validRequest,
      meta: { tmux: { session: 'test', window: '0' } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects extra fields (.strict)', () => {
    const result = EventPopperRequestSchema.safeParse({
      ...validRequest,
      extraField: 'should-fail',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const { type: _, ...incomplete } = validRequest;
    const result = EventPopperRequestSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('rejects wrong version', () => {
    const result = EventPopperRequestSchema.safeParse({ ...validRequest, version: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects empty source', () => {
    const result = EventPopperRequestSchema.safeParse({ ...validRequest, source: '' });
    expect(result.success).toBe(false);
  });
});

describe('EventPopperResponseSchema', () => {
  const validResponse = {
    version: 1 as const,
    status: 'answered',
    respondedAt: '2026-03-07T05:53:00.000Z',
    respondedBy: 'user:jordan',
    payload: { answer: true },
  };

  it('accepts valid response data', () => {
    const result = EventPopperResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  it('rejects extra fields (.strict)', () => {
    const result = EventPopperResponseSchema.safeParse({
      ...validResponse,
      bonus: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing respondedBy', () => {
    const { respondedBy: _, ...incomplete } = validResponse;
    const result = EventPopperResponseSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });
});

// ─── T002: GUID Tests ──────────────────────────────────────────

describe('generateEventId', () => {
  it('generates unique IDs across 1000 calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateEventId());
    }
    expect(ids.size).toBe(1000);
  });

  it('contains no colons or spaces (filesystem-safe)', () => {
    const id = generateEventId();
    expect(id).not.toContain(':');
    expect(id).not.toContain(' ');
  });

  it('sorts chronologically (IDs generated later sort after earlier)', () => {
    const ids: string[] = [];
    for (let i = 0; i < 100; i++) {
      ids.push(generateEventId());
    }
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
  });

  it('matches expected format: timestamp_sequence+hex', () => {
    const id = generateEventId();
    // e.g. 2026-03-07T05-52-00-000Z_00003a
    expect(id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_[0-9a-f]{6}$/);
  });
});

// ─── T003: Port Discovery Tests ────────────────────────────────

describe('port-discovery', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `event-popper-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('write then read round-trip returns same info', () => {
    const info = {
      port: 3000,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };
    writeServerInfo(testDir, info);
    const result = readServerInfo(testDir);
    expect(result).toEqual(info);
  });

  it('returns null when file is missing', () => {
    const result = readServerInfo(testDir);
    expect(result).toBeNull();
  });

  it('returns null when PID is not alive', () => {
    const info = {
      port: 3000,
      pid: 999999999, // unlikely to be alive
      startedAt: new Date().toISOString(),
    };
    writeServerInfo(testDir, info);
    const result = readServerInfo(testDir);
    expect(result).toBeNull();
  });

  it('removeServerInfo cleans up the file', () => {
    writeServerInfo(testDir, {
      port: 3000,
      pid: process.pid,
      startedAt: new Date().toISOString(),
    });
    removeServerInfo(testDir);
    expect(existsSync(join(testDir, '.chainglass', 'server.json'))).toBe(false);
  });

  it('returns null for malformed JSON', () => {
    const dir = join(testDir, '.chainglass');
    mkdirSync(dir, { recursive: true });
    const { writeFileSync } = require('node:fs');
    writeFileSync(join(dir, 'server.json'), 'not-json', 'utf-8');
    const result = readServerInfo(testDir);
    expect(result).toBeNull();
  });
});

// ─── T006: Tmux Detection Tests ────────────────────────────────

describe('detectTmuxContext', () => {
  const originalTmux = process.env.TMUX;
  const originalPane = process.env.TMUX_PANE;

  afterEach(() => {
    if (originalTmux !== undefined) {
      process.env.TMUX = originalTmux;
    } else {
      process.env.TMUX = undefined;
    }
    if (originalPane !== undefined) {
      process.env.TMUX_PANE = originalPane;
    } else {
      process.env.TMUX_PANE = undefined;
    }
  });

  it('returns undefined when $TMUX is not set', () => {
    process.env.TMUX = undefined;
    const result = detectTmuxContext();
    expect(result).toBeUndefined();
  });

  // Only run this test if we're actually in tmux (CI won't have it)
  it.skipIf(!process.env.TMUX)('returns context when in tmux', () => {
    const result = detectTmuxContext();
    expect(result).toBeDefined();
    expect(result?.session).toBeTruthy();
    expect(result?.window).toBeTruthy();
  });
});

describe('getTmuxMeta', () => {
  it('returns undefined when not in tmux', () => {
    const original = process.env.TMUX;
    process.env.TMUX = undefined;
    const result = getTmuxMeta();
    expect(result).toBeUndefined();
    if (original !== undefined) process.env.TMUX = original;
  });

  it.skipIf(!process.env.TMUX)('returns { tmux: TmuxContext } when in tmux', () => {
    const result = getTmuxMeta();
    expect(result).toBeDefined();
    expect(result?.tmux.session).toBeTruthy();
  });
});

// ─── T005: Localhost Guard Tests ────────────────────────────────

function makeRequest(options: { ip?: string; headers?: Record<string, string> }): NextRequest {
  const req = new NextRequest('http://localhost:3000/api/event-popper/ask-question', {
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
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns null when recorded startedAt is far in the past relative to live process', () => {
    // Write a server.json with our own PID but a very old startedAt
    // The real process (this test runner) started much later, so recycling check should catch it
    const info = {
      port: 3000,
      pid: process.pid,
      startedAt: '2020-01-01T00:00:00.000Z', // far in the past
    };
    writeServerInfo(testDir, info);
    const result = readServerInfo(testDir);
    // On macOS/Linux, getProcessStartTime will return a time much later than 2020,
    // so the recycling guard should return null.
    // On unsupported platforms, getProcessStartTime returns null and the check is skipped.
    if (process.platform === 'darwin' || process.platform === 'linux') {
      expect(result).toBeNull();
    }
  });
});
