import { beforeEach, describe, expect, it } from 'vitest';

import type {
  AgentEvent,
  AgentThinkingEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
} from '@chainglass/shared';
import { FakeProcessManager } from '@chainglass/shared';

// Import will fail until T005 implements the adapter
import { ClaudeCodeAdapter } from '@chainglass/shared';

/**
 * Unit tests for ClaudeCodeAdapter.
 *
 * Per plan Task 2.4: Tests verify run(), resume, flags, token extraction.
 * Uses FakeProcessManager per testing policy (no vi.mock()).
 *
 * Per DYK-06: Uses setProcessOutput/getProcessOutput pattern for output testing.
 * Per DYK-09: compact() delegates to run({ prompt: "/compact", sessionId }).
 */
describe('ClaudeCodeAdapter', () => {
  let fakeProcessManager: FakeProcessManager;
  let adapter: ClaudeCodeAdapter;

  // Sample stream-json output for testing
  const sampleOutput = [
    '{"type":"message","session_id":"test-session-123"}',
    '{"type":"assistant","content":[{"type":"text","text":"Hello, world!"}]}',
    '{"type":"result","result":"Done","usage":{"input_tokens":100,"output_tokens":50},"context_window":200000}',
  ].join('\n');

  /**
   * Helper to configure a process response before adapter.run() completes.
   * The FakeProcessManager auto-increments PIDs starting at 1001.
   *
   * Sets up output and schedules exit - output is set immediately via
   * process state tracking, exit is scheduled after a tiny delay.
   */
  function configureNextProcess(output: string, exitCode: number): void {
    // FakeProcessManager starts at PID 1001 and increments
    const nextPid = 1001 + fakeProcessManager.getSpawnHistory().length;

    // Pre-configure the output for this PID by manually setting it
    // We need to wait for spawn, then set output, then exit
    // Use a poll approach to wait for the process to exist
    const setupProcess = (): void => {
      const state = (
        fakeProcessManager as unknown as { _processes: Map<number, { output: string }> }
      )._processes.get(nextPid);
      if (state) {
        state.output = output;
        fakeProcessManager.exitProcess(nextPid, exitCode);
      } else {
        // Process doesn't exist yet, retry
        setTimeout(setupProcess, 0);
      }
    };

    // Start checking immediately
    setTimeout(setupProcess, 0);
  }

  beforeEach(() => {
    fakeProcessManager = new FakeProcessManager();
    adapter = new ClaudeCodeAdapter(fakeProcessManager);
  });

  describe('run()', () => {
    it('should spawn with --output-format=stream-json flag', async () => {
      /*
      Test Doc:
      - Why: AC-16 requires --output-format=stream-json for structured output
      - Contract: spawn() called with stream-json flag
      - Usage Notes: This flag produces NDJSON output for parsing
      - Quality Contribution: Ensures correct CLI invocation
      - Worked Example: run() → spawn with --output-format=stream-json
      */
      configureNextProcess(sampleOutput, 0);
      await adapter.run({ prompt: 'test prompt' });

      const history = fakeProcessManager.getSpawnHistory();
      expect(history.length).toBe(1);
      expect(history[0].args).toContain('--output-format=stream-json');
    });

    it('should spawn with --verbose flag (required for stream-json with -p)', async () => {
      /*
      Test Doc:
      - Why: Claude CLI requires --verbose when using stream-json with -p flag
      - Contract: spawn() called with --verbose flag
      - Usage Notes: Without this flag, CLI errors: "stream-json requires --verbose"
      - Quality Contribution: Ensures CLI invocation doesn't fail
      - Worked Example: run() → spawn with --verbose
      */
      configureNextProcess(sampleOutput, 0);
      await adapter.run({ prompt: 'test prompt' });

      const history = fakeProcessManager.getSpawnHistory();
      expect(history[0].args).toContain('--verbose');
    });

    it('should spawn with --dangerously-skip-permissions flag', async () => {
      /*
      Test Doc:
      - Why: AC-16 requires permission bypass for non-interactive execution
      - Contract: spawn() called with permission bypass flag
      - Usage Notes: Required to avoid interactive prompts
      - Quality Contribution: Ensures non-interactive operation
      - Worked Example: run() → spawn with --dangerously-skip-permissions
      */
      configureNextProcess(sampleOutput, 0);
      await adapter.run({ prompt: 'test prompt' });

      const history = fakeProcessManager.getSpawnHistory();
      expect(history.length).toBe(1);
      expect(history[0].args).toContain('--dangerously-skip-permissions');
    });

    it('should spawn with prompt via -p flag', async () => {
      /*
      Test Doc:
      - Why: Prompt must be passed to CLI via -p flag
      - Contract: spawn() includes -p followed by prompt string
      - Usage Notes: Prompt is passed as argument, not stdin
      - Quality Contribution: Ensures prompt reaches CLI correctly
      - Worked Example: run({prompt:"hello"}) → spawn with -p "hello"
      */
      configureNextProcess(sampleOutput, 0);
      await adapter.run({ prompt: 'hello world' });

      const history = fakeProcessManager.getSpawnHistory();
      expect(history[0].args).toContain('-p');
      expect(history[0].args).toContain('hello world');
    });

    it('should extract session ID from stream-json output', async () => {
      /*
      Test Doc:
      - Why: AC-1 requires session ID in result for resumption
      - Contract: Session ID extracted from first message with session_id
      - Usage Notes: Per DYK-07: parse all messages, return first session_id
      - Quality Contribution: Validates session ID extraction pipeline
      - Worked Example: output with session_id → result.sessionId
      */
      configureNextProcess(sampleOutput, 0);
      const result = await adapter.run({ prompt: 'test' });

      expect(result.sessionId).toBe('test-session-123');
    });

    it('should extract token metrics from Result message', async () => {
      /*
      Test Doc:
      - Why: AC-9/AC-10/AC-11 require token tracking
      - Contract: Tokens extracted from usage field in Result message
      - Usage Notes: Per Discovery 03: sum input + output + cache tokens
      - Quality Contribution: Validates token extraction pipeline
      - Worked Example: Result with usage → tokens with used, total, limit
      */
      configureNextProcess(sampleOutput, 0);
      const result = await adapter.run({ prompt: 'test' });

      expect(result.tokens).not.toBeNull();
      expect(result.tokens?.used).toBe(150); // 100 + 50
      expect(result.tokens?.limit).toBe(200000);
    });

    it('should return status completed on exit code 0', async () => {
      /*
      Test Doc:
      - Why: AC-5 requires status='completed' on exit 0
      - Contract: Exit code 0 maps to completed status
      - Usage Notes: Standard process success convention
      - Quality Contribution: Ensures status mapping is correct
      - Worked Example: exit 0 → status='completed'
      */
      configureNextProcess(sampleOutput, 0);
      const result = await adapter.run({ prompt: 'test' });

      expect(result.status).toBe('completed');
      expect(result.exitCode).toBe(0);
    });

    it('should return status failed on non-zero exit code', async () => {
      /*
      Test Doc:
      - Why: AC-6 requires status='failed' on error exit
      - Contract: Non-zero exit code maps to failed status
      - Usage Notes: Exit code preserved for debugging
      - Quality Contribution: Ensures error states are reported
      - Worked Example: exit 1 → status='failed', exitCode=1
      */
      configureNextProcess('{"error":"Something went wrong"}', 1);
      const result = await adapter.run({ prompt: 'test' });

      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(1);
    });

    it('should capture text output from messages', async () => {
      /*
      Test Doc:
      - Why: AC-4 requires output field in result
      - Contract: Text content extracted from assistant messages
      - Usage Notes: Multiple text blocks concatenated
      - Quality Contribution: Ensures full response captured
      - Worked Example: assistant with text → output field
      */
      configureNextProcess(sampleOutput, 0);
      const result = await adapter.run({ prompt: 'test' });

      expect(result.output).toContain('Hello, world!');
    });
  });

  describe('prompt validation (FIX-003, FIX-005)', () => {
    it('should throw when prompt is empty string', async () => {
      /*
      Test Doc:
      - Why: Empty prompts cause confusing CLI errors (FIX-003)
      - Contract: run() throws for empty prompt
      - Usage Notes: Validate before spawn to fail fast
      - Quality Contribution: Clear error messages for invalid input
      - Worked Example: prompt='' → throws 'cannot be empty'
      */
      await expect(adapter.run({ prompt: '' })).rejects.toThrow(
        'Prompt cannot be empty or whitespace-only'
      );
    });

    it('should throw when prompt is whitespace only', async () => {
      /*
      Test Doc:
      - Why: Whitespace-only prompts are effectively empty (FIX-003)
      - Contract: run() throws for whitespace-only prompt
      - Usage Notes: Trims before checking
      - Quality Contribution: Prevents silent failures
      - Worked Example: prompt='   ' → throws 'cannot be empty'
      */
      await expect(adapter.run({ prompt: '   \n\t  ' })).rejects.toThrow(
        'Prompt cannot be empty or whitespace-only'
      );
    });

    it('should throw when prompt contains null bytes', async () => {
      /*
      Test Doc:
      - Why: Prevent command injection via control characters (FIX-005)
      - Contract: run() throws for prompts with null bytes
      - Usage Notes: Security hardening against injection attacks
      - Quality Contribution: Input sanitization
      - Worked Example: prompt with \x00 → throws 'invalid control characters'
      */
      await expect(adapter.run({ prompt: 'test\x00malicious' })).rejects.toThrow(
        'Prompt contains invalid control characters'
      );
    });

    it('should throw when prompt exceeds max length', async () => {
      /*
      Test Doc:
      - Why: Prevent memory/resource exhaustion (FIX-005)
      - Contract: run() throws for prompts > 100k chars
      - Usage Notes: Configurable limit via MAX_PROMPT_LENGTH
      - Quality Contribution: Resource protection
      - Worked Example: prompt > 100k chars → throws 'exceeds maximum length'
      */
      const longPrompt = 'x'.repeat(100_001);
      await expect(adapter.run({ prompt: longPrompt })).rejects.toThrow(
        'Prompt exceeds maximum length'
      );
    });

    it('should allow newlines and tabs in prompts', async () => {
      /*
      Test Doc:
      - Why: Newlines/tabs are valid in multiline prompts (FIX-005)
      - Contract: run() accepts prompts with \\n, \\t, \\r
      - Usage Notes: Only dangerous control chars rejected
      - Quality Contribution: Allows valid use cases
      - Worked Example: prompt='Line1\\nLine2' → accepted
      */
      configureNextProcess(sampleOutput, 0);
      await adapter.run({ prompt: 'Line 1\nLine 2\tTabbed' });

      const history = fakeProcessManager.getSpawnHistory();
      expect(history[0].args).toContain('Line 1\nLine 2\tTabbed');
    });

    it('should trim whitespace from valid prompts', async () => {
      /*
      Test Doc:
      - Why: Leading/trailing whitespace is noise (FIX-003)
      - Contract: run() trims prompts before use
      - Usage Notes: Internal cleanup for cleaner prompts
      - Quality Contribution: Consistent prompt handling
      - Worked Example: prompt='  test  ' → spawns with 'test'
      */
      configureNextProcess(sampleOutput, 0);
      await adapter.run({ prompt: '  test prompt  ' });

      const history = fakeProcessManager.getSpawnHistory();
      expect(history[0].args).toContain('test prompt');
    });
  });

  describe('error handling (FIX-002)', () => {
    it('should return failed status when spawn throws', async () => {
      /*
      Test Doc:
      - Why: CLI unavailable should not crash adapter (FIX-002)
      - Contract: spawn() errors return failed AgentResult
      - Usage Notes: Error message included in output
      - Quality Contribution: Prevents production crashes
      - Worked Example: spawn throws ENOENT → status='failed', exitCode=-1
      */
      const enoent = new Error('ENOENT: command not found') as NodeJS.ErrnoException;
      enoent.code = 'ENOENT';
      fakeProcessManager.setSpawnError(enoent);

      const result = await adapter.run({ prompt: 'test' });

      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(-1);
      expect(result.output).toContain('Failed to spawn Claude CLI');
      expect(result.output).toContain('ENOENT');
    });
  });

  describe('run() with sessionId (resume)', () => {
    it('should use --resume flag when sessionId provided', async () => {
      /*
      Test Doc:
      - Why: AC-2 requires session resumption with --resume flag
      - Contract: spawn() includes --resume <sessionId> when sessionId provided
      - Usage Notes: Session ID from prior run enables context continuity
      - Quality Contribution: Validates session resumption mechanism
      - Worked Example: run({sessionId:"abc"}) → spawn with --resume abc
      */
      configureNextProcess(sampleOutput, 0);
      await adapter.run({
        prompt: 'continue',
        sessionId: 'existing-session-456',
      });

      const history = fakeProcessManager.getSpawnHistory();
      expect(history[0].args).toContain('--resume');
      expect(history[0].args).toContain('existing-session-456');
    });

    it('should not use --resume flag when no sessionId', async () => {
      /*
      Test Doc:
      - Why: New sessions should not have --resume flag
      - Contract: spawn() without --resume when sessionId omitted
      - Usage Notes: CLI creates new session without --resume
      - Quality Contribution: Ensures new sessions start fresh
      - Worked Example: run({prompt:"hi"}) → spawn without --resume
      */
      configureNextProcess(sampleOutput, 0);
      await adapter.run({ prompt: 'start new' });

      const history = fakeProcessManager.getSpawnHistory();
      expect(history[0].args).not.toContain('--resume');
    });

    it('should preserve sessionId in result when resuming', async () => {
      /*
      Test Doc:
      - Why: Resumed session should keep same ID
      - Contract: Result.sessionId matches provided sessionId
      - Usage Notes: CLI returns same session_id on resume
      - Quality Contribution: Ensures session continuity works
      - Worked Example: run({sessionId:"abc"}) → result.sessionId="abc"
      */
      const resumeOutput = [
        '{"type":"message","session_id":"existing-session-456"}',
        '{"type":"result","result":"Done","usage":{"input_tokens":50,"output_tokens":25},"context_window":200000}',
      ].join('\n');

      configureNextProcess(resumeOutput, 0);
      const result = await adapter.run({
        prompt: 'continue',
        sessionId: 'existing-session-456',
      });

      expect(result.sessionId).toBe('existing-session-456');
    });
  });

  describe('compact()', () => {
    it('should delegate to run() with /compact prompt (DYK-09)', async () => {
      /*
      Test Doc:
      - Why: AC-12 requires /compact command to reduce context
      - Contract: compact() calls run() with "/compact" prompt and sessionId
      - Usage Notes: Per DYK-09: Claude Code uses -p "/compact" approach
      - Quality Contribution: Validates compact mechanism
      - Worked Example: compact("abc") → run({prompt:"/compact",sessionId:"abc"})
      */
      const compactOutput = [
        '{"type":"message","session_id":"session-to-compact"}',
        '{"type":"result","result":"Context compacted","usage":{"input_tokens":50,"output_tokens":10},"context_window":200000}',
      ].join('\n');

      configureNextProcess(compactOutput, 0);
      const result = await adapter.compact('session-to-compact');

      // Verify spawn was called with /compact prompt
      const history = fakeProcessManager.getSpawnHistory();
      expect(history[0].args).toContain('-p');
      expect(history[0].args).toContain('/compact');
      expect(history[0].args).toContain('--resume');
      expect(history[0].args).toContain('session-to-compact');

      expect(result.sessionId).toBe('session-to-compact');
      expect(result.status).toBe('completed');
    });
  });

  describe('terminate()', () => {
    it('should call processManager.terminate()', async () => {
      /*
      Test Doc:
      - Why: AC-14 requires agent termination within 10 seconds
      - Contract: terminate() calls processManager.terminate()
      - Usage Notes: Signal escalation handled by ProcessManager
      - Quality Contribution: Validates termination delegation
      - Worked Example: terminate(sessionId) → processManager.terminate(pid)
      */
      // First start a session to register the PID
      configureNextProcess(sampleOutput, 0);
      await adapter.run({ prompt: 'test' });

      // Now terminate the session - should call processManager.terminate()
      const result = await adapter.terminate('test-session-123');

      expect(result.status).toBe('killed');
      // Note: The PID was already exited by configureNextProcess, but terminate() still works
    });

    it('should return killed status', async () => {
      /*
      Test Doc:
      - Why: AC-7 requires status='killed' on termination
      - Contract: terminate() returns AgentResult with status='killed'
      - Usage Notes: Session can still be resumed after kill
      - Quality Contribution: Ensures termination status is correct
      - Worked Example: terminate() → {status:'killed'}
      */
      const result = await adapter.terminate('any-session');

      expect(result.status).toBe('killed');
    });
  });

  describe('cwd option', () => {
    it('should pass cwd to spawn options', async () => {
      /*
      Test Doc:
      - Why: Agent may need to run in specific directory
      - Contract: run() with cwd passes it to spawn()
      - Usage Notes: Useful for project-specific context
      - Quality Contribution: Ensures working directory is configurable
      - Worked Example: run({cwd:"/project"}) → spawn({cwd:"/project"})
      */
      // Create adapter with workspaceRoot that includes the test path
      const adapterWithWorkspace = new ClaudeCodeAdapter(fakeProcessManager, {
        workspaceRoot: '/some/project',
      });
      configureNextProcess(sampleOutput, 0);
      await adapterWithWorkspace.run({
        prompt: 'test',
        cwd: '/some/project/path',
      });

      const history = fakeProcessManager.getSpawnHistory();
      expect(history[0].cwd).toBe('/some/project/path');
    });

    it('should allow cwd outside workspace root with warning (DYK-07)', async () => {
      /*
      Test Doc:
      - Why: Allow .chainglass/ runs directory outside workspace (DYK-07)
      - Contract: cwd outside workspaceRoot logs warning but proceeds
      - Usage Notes: Relaxed security to support workflow run directories
      - Quality Contribution: Validates warning-only behavior
      - Worked Example: workspaceRoot=/home/user, cwd=/etc → logs warning, proceeds
      */
      const adapterWithWorkspace = new ClaudeCodeAdapter(fakeProcessManager, {
        workspaceRoot: '/home/user/workspace',
      });

      // Configure process to complete successfully
      configureNextProcess(sampleOutput, 0);

      // Should not throw - just log warning and proceed
      const result = await adapterWithWorkspace.run({
        prompt: 'test',
        cwd: '/etc/passwd',
      });

      // Should complete (fake process manager returns success)
      expect(result.status).toBe('completed');
    });

    it('should allow path traversal with warning (DYK-07)', async () => {
      /*
      Test Doc:
      - Why: Allow paths that resolve outside workspace (DYK-07)
      - Contract: cwd with ../ resolving outside workspace logs warning but proceeds
      - Usage Notes: Relaxed security to support workflow run directories
      - Quality Contribution: Validates warning-only behavior
      - Worked Example: cwd=../../etc → logs warning, proceeds
      */
      const adapterWithWorkspace = new ClaudeCodeAdapter(fakeProcessManager, {
        workspaceRoot: '/home/user/workspace',
      });

      // Configure process to complete successfully
      configureNextProcess(sampleOutput, 0);

      // Should not throw - just log warning and proceed
      const result = await adapterWithWorkspace.run({
        prompt: 'test',
        cwd: '/home/user/workspace/../../etc',
      });

      // Should complete (fake process manager returns success)
      expect(result.status).toBe('completed');
    });
  });

  describe('streaming with onEvent (Subtask 002)', () => {
    // Sample stream-json lines for streaming tests
    const systemInitLine = '{"type":"system","subtype":"init","session_id":"stream-session-123"}';
    const assistantLine =
      '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello there!"}]}}';
    const resultLine = '{"type":"result","result":"Final output"}';
    const unknownLine = '{"type":"unknown_event","data":"foo"}';

    it('should call onEvent with text_delta when receiving assistant message', async () => {
      /*
      Test Doc:
      - Why: Streaming requires real-time text delivery
      - Contract: Assistant messages emit text_delta events to onEvent
      - Usage Notes: Content is extracted from message.content[].text
      - Quality Contribution: Validates streaming text extraction
      - Worked Example: assistant message → onEvent({ type: 'text_delta', data: { content: '...' } })
      */
      const events: AgentEvent[] = [];

      // Create spawn that waits for us to emit lines
      let resolveSpawn: (() => void) | undefined;
      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      // Give spawn time to register
      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      // Emit streaming lines
      fakeProcessManager.emitStdoutLines(pid, [assistantLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      expect(events.length).toBeGreaterThanOrEqual(1);
      const textEvent = events.find((e) => e.type === 'text_delta');
      expect(textEvent).toBeDefined();
      expect(textEvent.data.content).toBe('Hello there!');
    });

    it('should call onEvent with session_start when receiving system.init', async () => {
      /*
      Test Doc:
      - Why: Session ID must be available immediately
      - Contract: system.init event emits session_start
      - Usage Notes: Session ID extracted from init message
      - Quality Contribution: Validates session ID streaming
      - Worked Example: system.init → onEvent({ type: 'session_start', data: { sessionId: '...' } })
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [systemInitLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      const sessionEvent = events.find((e) => e.type === 'session_start');
      expect(sessionEvent).toBeDefined();
      expect(sessionEvent.data.sessionId).toBe('stream-session-123');
    });

    it('should call onEvent with message when receiving result', async () => {
      /*
      Test Doc:
      - Why: Final message event signals completion
      - Contract: result event emits message
      - Usage Notes: Result content becomes message content
      - Quality Contribution: Validates final message delivery
      - Worked Example: result → onEvent({ type: 'message', data: { content: '...' } })
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [resultLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      const messageEvent = events.find((e) => e.type === 'message');
      expect(messageEvent).toBeDefined();
      expect(messageEvent.data.content).toBe('Final output');
    });

    it('should call onEvent with raw for unknown event types', async () => {
      /*
      Test Doc:
      - Why: Unknown events should be passed through
      - Contract: Unrecognized event types emit raw events
      - Usage Notes: originalType and originalData preserved
      - Quality Contribution: Validates passthrough for debugging
      - Worked Example: unknown → onEvent({ type: 'raw', data: { provider: 'claude', ... } })
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [unknownLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      const rawEvent = events.find((e) => e.type === 'raw');
      expect(rawEvent).toBeDefined();
      expect(rawEvent.data.provider).toBe('claude');
      expect(rawEvent.data.originalType).toBe('unknown_event');
    });

    it('should work without onEvent (backward compatibility)', async () => {
      /*
      Test Doc:
      - Why: Existing code must continue to work
      - Contract: run() without onEvent uses buffered output
      - Usage Notes: No streaming, traditional mode
      - Quality Contribution: Validates backward compatibility
      - Worked Example: run({ prompt }) → result via buffered output
      */
      configureNextProcess(sampleOutput, 0);
      const result = await adapter.run({ prompt: 'test' });

      expect(result.sessionId).toBe('test-session-123');
      expect(result.status).toBe('completed');
    });

    it('should include timestamp in all events', async () => {
      /*
      Test Doc:
      - Why: Events must have timestamps for ordering
      - Contract: All emitted events have timestamp field
      - Usage Notes: ISO 8601 format
      - Quality Contribution: Validates event metadata
      - Worked Example: event.timestamp is ISO string
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [systemInitLine, assistantLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      expect(events.length).toBeGreaterThanOrEqual(2);
      for (const event of events) {
        expect(event.timestamp).toBeDefined();
        expect(typeof event.timestamp).toBe('string');
        expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    });

    it('should still return final AgentResult when streaming', async () => {
      /*
      Test Doc:
      - Why: Streaming doesn't change final result contract
      - Contract: run() returns AgentResult after streaming completes
      - Usage Notes: Output accumulated from streamed events
      - Quality Contribution: Validates result contract preservation
      - Worked Example: streaming + onEvent → still returns AgentResult
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [systemInitLine, assistantLine, resultLine]);
      fakeProcessManager.exitProcess(pid, 0);

      const result = await spawnPromise;

      expect(result.status).toBe('completed');
      expect(result.exitCode).toBe(0);
      expect(result.sessionId).toBe('stream-session-123');
      expect(result.output).toBe('Final output');
    });

    it('should handle malformed JSON lines gracefully', async () => {
      /*
      Test Doc:
      - Why: CLI may emit non-JSON lines (debug info, etc.)
      - Contract: Malformed JSON is silently ignored
      - Usage Notes: No crashes, no error events
      - Quality Contribution: Validates robustness
      - Worked Example: 'not json' → silently skipped
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      // Emit mix of valid and invalid lines
      fakeProcessManager.emitStdoutLines(pid, [
        'not json at all',
        systemInitLine,
        '{broken json',
        assistantLine,
      ]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      // Should only have events for valid JSON lines
      expect(events.length).toBe(2);
      expect(events[0].type).toBe('session_start');
      expect(events[1].type).toBe('text_delta');
    });
  });

  // ============================================================
  // Phase 2: Tool Event Parsing Tests (T001-T003)
  // ============================================================

  describe('tool_use content block parsing (T001)', () => {
    /**
     * Test Doc:
     * - Why: AC1 requires tool invocations visible in UI within 500ms
     * - Contract: tool_use content blocks in assistant messages → AgentToolCallEvent
     * - Usage Notes: Follows inline filtering pattern per Insight 1
     * - Quality Contribution: Core tool visibility feature
     */

    // Sample NDJSON lines with tool_use content blocks
    const toolUseLine = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'toolu_abc123',
            name: 'Bash',
            input: { command: 'ls -la' },
          },
        ],
      },
    });

    const multiToolLine = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'toolu_first',
            name: 'Read',
            input: { file_path: '/etc/hosts' },
          },
          {
            type: 'tool_use',
            id: 'toolu_second',
            name: 'Write',
            input: { file_path: '/tmp/out.txt', content: 'hello' },
          },
        ],
      },
    });

    const mixedContentLine = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Let me check that for you.' },
          {
            type: 'tool_use',
            id: 'toolu_mixed',
            name: 'Bash',
            input: { command: 'pwd' },
          },
        ],
      },
    });

    it('should emit tool_call event for tool_use content block', async () => {
      /*
      Test Doc:
      - Why: AC1 requires tool visibility in UI
      - Contract: tool_use block → AgentToolCallEvent with toolName, input, toolCallId
      - Usage Notes: tool_use appears in assistant message content array
      - Quality Contribution: Core tool visibility pipeline
      - Worked Example: { type: 'tool_use', name: 'Bash', input: { command: 'ls' }, id: 'toolu_123' }
        → { type: 'tool_call', data: { toolName: 'Bash', input: { command: 'ls' }, toolCallId: 'toolu_123' } }
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [toolUseLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      const toolCallEvent = events.find((e) => e.type === 'tool_call') as
        | AgentToolCallEvent
        | undefined;
      expect(toolCallEvent).toBeDefined();
      expect(toolCallEvent?.data.toolName).toBe('Bash');
      expect(toolCallEvent?.data.input).toEqual({ command: 'ls -la' });
      expect(toolCallEvent?.data.toolCallId).toBe('toolu_abc123');
    });

    it('should emit multiple tool_call events for multiple tool_use blocks', async () => {
      /*
      Test Doc:
      - Why: Agents may invoke multiple tools in one message
      - Contract: Each tool_use block → separate AgentToolCallEvent
      - Usage Notes: Events emitted in content array order
      - Quality Contribution: Validates multi-tool parsing
      - Worked Example: [tool_use_1, tool_use_2] → [tool_call_1, tool_call_2]
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [multiToolLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      const toolCallEvents = events.filter((e) => e.type === 'tool_call') as AgentToolCallEvent[];
      expect(toolCallEvents).toHaveLength(2);
      expect(toolCallEvents[0].data.toolName).toBe('Read');
      expect(toolCallEvents[0].data.toolCallId).toBe('toolu_first');
      expect(toolCallEvents[1].data.toolName).toBe('Write');
      expect(toolCallEvents[1].data.toolCallId).toBe('toolu_second');
    });

    it('should emit both text_delta and tool_call for mixed content', async () => {
      /*
      Test Doc:
      - Why: Messages may contain text and tool_use together
      - Contract: Both text and tool_use blocks emit their respective events
      - Usage Notes: Order preserved from content array
      - Quality Contribution: Validates mixed content handling
      - Worked Example: [text, tool_use] → [text_delta, tool_call]
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [mixedContentLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      const textEvent = events.find((e) => e.type === 'text_delta');
      const toolCallEvent = events.find((e) => e.type === 'tool_call') as
        | AgentToolCallEvent
        | undefined;

      expect(textEvent).toBeDefined();
      expect(toolCallEvent).toBeDefined();
      expect(toolCallEvent?.data.toolName).toBe('Bash');
    });

    it('should include timestamp in tool_call events', async () => {
      /*
      Test Doc:
      - Why: All events need timestamps for ordering
      - Contract: tool_call events include ISO 8601 timestamp
      - Usage Notes: Follows existing event pattern
      - Quality Contribution: Validates event metadata
      - Worked Example: tool_call event.timestamp matches ISO format
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [toolUseLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      const toolCallEvent = events.find((e) => e.type === 'tool_call');
      expect(toolCallEvent?.timestamp).toBeDefined();
      expect(toolCallEvent?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('tool_result content block parsing (T002)', () => {
    /**
     * Test Doc:
     * - Why: AC2 requires tool completion with success/error status
     * - Contract: tool_result content blocks in user messages → AgentToolResultEvent
     * - Usage Notes: tool_result appears in user message following tool_use
     * - Quality Contribution: Completes tool visibility lifecycle
     */

    const toolResultSuccessLine = JSON.stringify({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_abc123',
            content: 'total 48\ndrwxr-xr-x  12 user  staff  384 Jan 15 10:30 .',
            is_error: false,
          },
        ],
      },
    });

    const toolResultErrorLine = JSON.stringify({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_def456',
            content: 'Error: ENOENT: no such file or directory',
            is_error: true,
          },
        ],
      },
    });

    const toolResultEmptyLine = JSON.stringify({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_empty',
            content: '',
            is_error: false,
          },
        ],
      },
    });

    it('should emit tool_result event for successful tool_result block', async () => {
      /*
      Test Doc:
      - Why: AC2 requires showing tool completion status
      - Contract: tool_result block → AgentToolResultEvent with output, isError=false
      - Usage Notes: Correlates with prior tool_call via toolCallId
      - Quality Contribution: Core tool completion visibility
      - Worked Example: { type: 'tool_result', content: '...', is_error: false }
        → { type: 'tool_result', data: { output: '...', isError: false, toolCallId: '...' } }
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [toolResultSuccessLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      const toolResultEvent = events.find((e) => e.type === 'tool_result') as
        | AgentToolResultEvent
        | undefined;
      expect(toolResultEvent).toBeDefined();
      expect(toolResultEvent?.data.toolCallId).toBe('toolu_abc123');
      expect(toolResultEvent?.data.output).toContain('total 48');
      expect(toolResultEvent?.data.isError).toBe(false);
    });

    it('should emit tool_result event with isError=true for error result', async () => {
      /*
      Test Doc:
      - Why: AC12a requires error visibility (auto-expand on error)
      - Contract: tool_result with is_error: true → AgentToolResultEvent with isError=true
      - Usage Notes: UI will auto-expand error tool cards
      - Quality Contribution: Error visibility for debugging
      - Worked Example: { is_error: true } → { isError: true }
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [toolResultErrorLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      const toolResultEvent = events.find((e) => e.type === 'tool_result') as
        | AgentToolResultEvent
        | undefined;
      expect(toolResultEvent).toBeDefined();
      expect(toolResultEvent?.data.toolCallId).toBe('toolu_def456');
      expect(toolResultEvent?.data.isError).toBe(true);
      expect(toolResultEvent?.data.output).toContain('ENOENT');
    });

    it('should handle empty tool_result output', async () => {
      /*
      Test Doc:
      - Why: Some tools return no output (mkdir, touch, etc.)
      - Contract: Empty content string → output='' (not undefined)
      - Usage Notes: Empty output is valid, not an error
      - Quality Contribution: Edge case handling
      - Worked Example: { content: '' } → { output: '' }
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [toolResultEmptyLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      const toolResultEvent = events.find((e) => e.type === 'tool_result') as
        | AgentToolResultEvent
        | undefined;
      expect(toolResultEvent).toBeDefined();
      expect(toolResultEvent?.data.output).toBe('');
      expect(toolResultEvent?.data.isError).toBe(false);
    });
  });

  describe('thinking content block parsing (T003)', () => {
    /**
     * Test Doc:
     * - Why: AC5 requires thinking blocks visible as collapsible sections
     * - Contract: thinking content blocks in assistant messages → AgentThinkingEvent
     * - Usage Notes: Signature field is optional (Claude extended thinking only)
     * - Quality Contribution: Agent reasoning visibility
     */

    const thinkingLine = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'thinking',
            thinking:
              'Let me analyze this step by step. First, I need to check the file structure...',
          },
        ],
      },
    });

    const thinkingWithSignatureLine = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'thinking',
            thinking: 'Considering the options carefully...',
            signature: 'sig_xyz789abc',
          },
        ],
      },
    });

    const thinkingWithTextLine = JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'thinking',
            thinking: 'Planning the approach...',
          },
          {
            type: 'text',
            text: 'Here is my analysis:',
          },
        ],
      },
    });

    it('should emit thinking event for thinking content block', async () => {
      /*
      Test Doc:
      - Why: AC5 requires thinking block visibility
      - Contract: thinking block → AgentThinkingEvent with content
      - Usage Notes: Content may be long reasoning text
      - Quality Contribution: Core reasoning visibility
      - Worked Example: { type: 'thinking', thinking: '...' }
        → { type: 'thinking', data: { content: '...' } }
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [thinkingLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      const thinkingEvent = events.find((e) => e.type === 'thinking') as
        | AgentThinkingEvent
        | undefined;
      expect(thinkingEvent).toBeDefined();
      expect(thinkingEvent?.data.content).toContain('step by step');
    });

    it('should include signature when present in thinking block', async () => {
      /*
      Test Doc:
      - Why: Claude extended thinking includes cryptographic signature
      - Contract: signature field preserved in AgentThinkingEvent
      - Usage Notes: Signature is optional, only on Claude extended thinking
      - Quality Contribution: Preserves full thinking block data
      - Worked Example: { signature: 'sig_xyz' } → { signature: 'sig_xyz' }
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [thinkingWithSignatureLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      const thinkingEvent = events.find((e) => e.type === 'thinking') as
        | AgentThinkingEvent
        | undefined;
      expect(thinkingEvent).toBeDefined();
      expect(thinkingEvent?.data.signature).toBe('sig_xyz789abc');
    });

    it('should handle thinking without signature', async () => {
      /*
      Test Doc:
      - Why: Not all thinking blocks have signatures
      - Contract: Missing signature → signature field undefined
      - Usage Notes: Signature is optional per schema
      - Quality Contribution: Validates optional field handling
      - Worked Example: { thinking: '...' } (no signature) → { signature: undefined }
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [thinkingLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      const thinkingEvent = events.find((e) => e.type === 'thinking') as
        | AgentThinkingEvent
        | undefined;
      expect(thinkingEvent).toBeDefined();
      expect(thinkingEvent?.data.signature).toBeUndefined();
    });

    it('should emit both thinking and text_delta for mixed content', async () => {
      /*
      Test Doc:
      - Why: Thinking blocks may appear alongside text
      - Contract: Both thinking and text blocks emit respective events
      - Usage Notes: Order preserved from content array
      - Quality Contribution: Validates mixed content handling
      - Worked Example: [thinking, text] → [thinking, text_delta]
      */
      const events: AgentEvent[] = [];

      const spawnPromise = adapter.run({
        prompt: 'test',
        onEvent: (e) => events.push(e),
      });

      await new Promise((resolve) => setTimeout(resolve, 5));
      const pid = 1001 + fakeProcessManager.getSpawnHistory().length - 1;

      fakeProcessManager.emitStdoutLines(pid, [thinkingWithTextLine]);
      fakeProcessManager.exitProcess(pid, 0);

      await spawnPromise;

      const thinkingEvent = events.find((e) => e.type === 'thinking');
      const textEvent = events.find((e) => e.type === 'text_delta');

      expect(thinkingEvent).toBeDefined();
      expect(textEvent).toBeDefined();
    });
  });
});
