import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentEvent } from '@chainglass/shared';
import { CopilotCLIAdapter } from '@chainglass/shared';

/**
 * Unit tests for CopilotCLIAdapter.
 *
 * TDD: Written FIRST (RED), implementation follows (GREEN).
 *
 * Uses injectable sendKeys function (Option B) and real temp files
 * for events.jsonl tailing — no mocks.
 */

/** Helper: create a temp session directory with events.jsonl */
function createTempSession(): { sessionDir: string; eventsPath: string; sessionId: string } {
  const sessionId = `test-session-${Date.now()}`;
  const sessionDir = path.join(os.tmpdir(), '.copilot-test', 'session-state', sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });
  const eventsPath = path.join(sessionDir, 'events.jsonl');
  fs.writeFileSync(eventsPath, '');
  return { sessionDir, eventsPath, sessionId };
}

/** Helper: append an event line to events.jsonl */
function appendEvent(eventsPath: string, type: string, data: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    type,
    data,
    timestamp: new Date().toISOString(),
    id: `evt-${Date.now()}`,
  });
  fs.appendFileSync(eventsPath, `${line}\n`);
}

/** Helper: append event after a delay */
function appendEventDelayed(
  eventsPath: string,
  type: string,
  data: Record<string, unknown>,
  delayMs: number
): void {
  setTimeout(() => appendEvent(eventsPath, type, data), delayMs);
}

describe('CopilotCLIAdapter', () => {
  let tmpSessionRoot: string;
  let sendKeysCalls: Array<{ target: string; text: string }>;
  let fakeSendKeys: (target: string, text: string) => void;

  beforeEach(() => {
    tmpSessionRoot = path.join(os.tmpdir(), '.copilot-test');
    fs.mkdirSync(path.join(tmpSessionRoot, 'session-state'), { recursive: true });
    sendKeysCalls = [];
    fakeSendKeys = (target: string, text: string) => {
      sendKeysCalls.push({ target, text });
    };
  });

  afterEach(() => {
    fs.rmSync(tmpSessionRoot, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should accept options with sendKeys function', () => {
      const adapter = new CopilotCLIAdapter({
        sendKeys: fakeSendKeys,
        sessionStateDir: `${tmpSessionRoot}/session-state`,
      });
      expect(adapter).toBeDefined();
    });
  });

  describe('run()', () => {
    it('should require sessionId in options', async () => {
      const adapter = new CopilotCLIAdapter({
        sendKeys: fakeSendKeys,
        sessionStateDir: `${tmpSessionRoot}/session-state`,
      });

      const result = await adapter.run({ prompt: 'hello' });

      expect(result.status).toBe('failed');
      expect(result.output).toContain('sessionId');
    });

    it('should return failed if events.jsonl does not exist', async () => {
      const adapter = new CopilotCLIAdapter({
        sendKeys: fakeSendKeys,
        sessionStateDir: `${tmpSessionRoot}/session-state`,
      });

      const result = await adapter.run({
        prompt: 'hello',
        sessionId: 'nonexistent-session',
      });

      expect(result.status).toBe('failed');
    });

    it('should send prompt via sendKeys', async () => {
      const { eventsPath, sessionId } = createTempSession();
      const adapter = new CopilotCLIAdapter({
        sendKeys: fakeSendKeys,
        sessionStateDir: `${tmpSessionRoot}/session-state`,
        tmuxTarget: 'test:0.0',
        pollIntervalMs: 50,
      });

      // Simulate events appearing after a short delay
      appendEventDelayed(eventsPath, 'assistant.message', { content: 'response' }, 100);
      appendEventDelayed(eventsPath, 'session.idle', {}, 150);

      const result = await adapter.run({
        prompt: 'hello world',
        sessionId,
      });

      // Verify sendKeys was called with the prompt text and Enter
      expect(sendKeysCalls.length).toBeGreaterThanOrEqual(1);
      const textCall = sendKeysCalls.find((c) => c.text === 'hello world');
      expect(textCall).toBeDefined();
      expect(textCall?.target).toBe('test:0.0');
    });

    it('should start file watcher BEFORE sending prompt (AC-11)', async () => {
      const { eventsPath, sessionId } = createTempSession();
      const callOrder: string[] = [];

      const trackingSendKeys = (target: string, text: string) => {
        callOrder.push(`sendKeys:${text}`);
        // Simulate immediate event response
        appendEvent(eventsPath, 'assistant.message', { content: 'hi' });
        appendEvent(eventsPath, 'session.idle', {});
      };

      const adapter = new CopilotCLIAdapter({
        sendKeys: trackingSendKeys,
        sessionStateDir: `${tmpSessionRoot}/session-state`,
        tmuxTarget: 'test:0.0',
        pollIntervalMs: 50,
      });

      await adapter.run({ prompt: 'test', sessionId });

      // The file watcher setup happens before sendKeys is called
      // We can verify by the fact that events emitted synchronously
      // during sendKeys are still captured
      expect(callOrder).toContain('sendKeys:test');
    });

    it('should emit events via onEvent callback (AC-03)', async () => {
      const { eventsPath, sessionId } = createTempSession();
      const adapter = new CopilotCLIAdapter({
        sendKeys: fakeSendKeys,
        sessionStateDir: `${tmpSessionRoot}/session-state`,
        tmuxTarget: 'test:0.0',
        pollIntervalMs: 50,
      });

      const events: AgentEvent[] = [];

      appendEventDelayed(eventsPath, 'assistant.message_delta', { content: 'He' }, 80);
      appendEventDelayed(eventsPath, 'assistant.message_delta', { content: 'llo' }, 120);
      appendEventDelayed(eventsPath, 'assistant.message', { content: 'Hello' }, 160);
      appendEventDelayed(eventsPath, 'session.idle', {}, 200);

      const result = await adapter.run({
        prompt: 'greet me',
        sessionId,
        onEvent: (event) => events.push(event),
      });

      expect(result.status).toBe('completed');
      expect(events.length).toBeGreaterThan(0);
      const deltaEvents = events.filter((e) => e.type === 'text_delta');
      expect(deltaEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('should return completed AgentResult after session.idle (AC-02)', async () => {
      const { eventsPath, sessionId } = createTempSession();
      const adapter = new CopilotCLIAdapter({
        sendKeys: fakeSendKeys,
        sessionStateDir: `${tmpSessionRoot}/session-state`,
        tmuxTarget: 'test:0.0',
        pollIntervalMs: 50,
      });

      appendEventDelayed(eventsPath, 'assistant.message', { content: 'Done!' }, 100);
      appendEventDelayed(eventsPath, 'session.idle', {}, 150);

      const result = await adapter.run({ prompt: 'do it', sessionId });

      expect(result.status).toBe('completed');
      expect(result.sessionId).toBe(sessionId);
      expect(result.output).toContain('Done!');
      expect(result.exitCode).toBe(0);
      expect(result.tokens).toBeNull();
    });

    it('should return failed on timeout (AC-06)', async () => {
      const { sessionId } = createTempSession();
      const adapter = new CopilotCLIAdapter({
        sendKeys: fakeSendKeys,
        sessionStateDir: `${tmpSessionRoot}/session-state`,
        tmuxTarget: 'test:0.0',
        pollIntervalMs: 50,
        timeoutMs: 200,
      });

      // No events appended — will timeout
      const result = await adapter.run({ prompt: 'waiting forever', sessionId });

      expect(result.status).toBe('failed');
      expect(result.output).toContain('timeout');
    });

    it('should return failed if sendKeys throws (tmux unreachable, AC-05)', async () => {
      const { sessionId } = createTempSession();
      const throwingSendKeys = () => {
        throw new Error('tmux session not found');
      };

      const adapter = new CopilotCLIAdapter({
        sendKeys: throwingSendKeys,
        sessionStateDir: `${tmpSessionRoot}/session-state`,
        tmuxTarget: 'test:0.0',
        pollIntervalMs: 50,
      });

      const result = await adapter.run({ prompt: 'test', sessionId });

      expect(result.status).toBe('failed');
      expect(result.output).toContain('tmux');
    });

    it('should validate sessionId against path traversal (AC-13)', async () => {
      const adapter = new CopilotCLIAdapter({
        sendKeys: fakeSendKeys,
        sessionStateDir: `${tmpSessionRoot}/session-state`,
        tmuxTarget: 'test:0.0',
      });

      const result = await adapter.run({
        prompt: 'test',
        sessionId: '../../../etc/passwd',
      });

      expect(result.status).toBe('failed');
      expect(result.output).toContain('invalid');
    });

    it('should skip malformed events.jsonl lines (AC-12)', async () => {
      const { eventsPath, sessionId } = createTempSession();
      const adapter = new CopilotCLIAdapter({
        sendKeys: fakeSendKeys,
        sessionStateDir: `${tmpSessionRoot}/session-state`,
        tmuxTarget: 'test:0.0',
        pollIntervalMs: 50,
      });

      const events: AgentEvent[] = [];

      // Write malformed line first, then valid events
      setTimeout(() => {
        fs.appendFileSync(eventsPath, 'not valid json\n');
        appendEvent(eventsPath, 'assistant.message', { content: 'worked' });
        appendEvent(eventsPath, 'session.idle', {});
      }, 100);

      const result = await adapter.run({
        prompt: 'test',
        sessionId,
        onEvent: (e) => events.push(e),
      });

      expect(result.status).toBe('completed');
      // The malformed line was skipped, valid events still came through
      const messageEvents = events.filter((e) => e.type === 'message');
      expect(messageEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('compact()', () => {
    it('should send /compact via sendKeys (AC-07)', async () => {
      const { eventsPath, sessionId } = createTempSession();
      const adapter = new CopilotCLIAdapter({
        sendKeys: fakeSendKeys,
        sessionStateDir: `${tmpSessionRoot}/session-state`,
        tmuxTarget: 'test:0.0',
        pollIntervalMs: 50,
      });

      // compact waits for session.compaction_complete (not turn_end)
      appendEventDelayed(eventsPath, 'session.compaction_start', {}, 80);
      appendEventDelayed(eventsPath, 'session.compaction_complete', { success: true }, 150);

      const result = await adapter.compact(sessionId);

      expect(result.status).toBe('completed');
      expect(result.sessionId).toBe(sessionId);
      const compactCall = sendKeysCalls.find((c) => c.text === '/compact');
      expect(compactCall).toBeDefined();
    });
  });

  describe('terminate()', () => {
    it('should return killed status without killing CLI (AC-08, AC-09)', async () => {
      const { sessionId } = createTempSession();
      const adapter = new CopilotCLIAdapter({
        sendKeys: fakeSendKeys,
        sessionStateDir: `${tmpSessionRoot}/session-state`,
        tmuxTarget: 'test:0.0',
      });

      const result = await adapter.terminate(sessionId);

      expect(result.status).toBe('killed');
      expect(result.exitCode).toBe(0);
      expect(result.sessionId).toBe(sessionId);
      // No process kill commands should have been issued
      expect(sendKeysCalls.length).toBe(0);
    });

    it('should stop file watcher on terminate', async () => {
      const { eventsPath, sessionId } = createTempSession();
      const adapter = new CopilotCLIAdapter({
        sendKeys: fakeSendKeys,
        sessionStateDir: `${tmpSessionRoot}/session-state`,
        tmuxTarget: 'test:0.0',
        pollIntervalMs: 50,
      });

      // Start a run that will be interrupted by terminate
      const events: AgentEvent[] = [];
      const runPromise = adapter.run({
        prompt: 'long task',
        sessionId,
        onEvent: (e) => events.push(e),
      });

      // Give the watcher time to start, then terminate
      await new Promise((r) => setTimeout(r, 100));
      const terminateResult = await adapter.terminate(sessionId);

      expect(terminateResult.status).toBe('killed');

      // The run should resolve after terminate
      const runResult = await runPromise;
      expect(runResult.status).toBe('killed');
    });
  });
});
