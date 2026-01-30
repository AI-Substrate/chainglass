import { execSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Check if GitHub Copilot SDK is installed and usable.
 *
 * Per Phase 3 T008: Integration tests use real SDK with skip-if-unavailable guard.
 */
function hasCopilotSdk(): boolean {
  try {
    // Check if @github/copilot-sdk is importable (ESM-only package)
    execSync('node --input-type=module -e "await import(\'@github/copilot-sdk\')"', {
      stdio: 'ignore',
      timeout: 10000,
      cwd: process.cwd(),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if running in CI environment.
 * Per ADR guidance: Integration tests should be skipped in CI.
 */
function isCI(): boolean {
  return Boolean(
    process.env.CI ||
      process.env.GITHUB_ACTIONS ||
      process.env.GITLAB_CI ||
      process.env.CIRCLECI ||
      process.env.JENKINS_URL
  );
}

/**
 * Get SDK version for logging.
 */
function getSdkVersion(): string | null {
  try {
    const output = execSync(
      'node -e "console.log(require(\'@github/copilot-sdk/package.json\').version)"',
      {
        encoding: 'utf-8',
        timeout: 10000,
        cwd: process.cwd(),
      }
    );
    return output.trim();
  } catch {
    return null;
  }
}

/**
 * Integration tests for SdkCopilotAdapter with real SDK.
 *
 * Per Phase 3 T008: Tests verify real SDK integration.
 * Per ADR-0002: Uses fakes in unit tests; this file tests real SDK behavior.
 *
 * These tests require:
 * 1. @github/copilot-sdk package installed
 * 2. Valid GitHub authentication (for real API calls)
 * 3. NOT running in CI (per spec: skipIf(isCI))
 *
 * Tests will be skipped if SDK is not available or in CI environment.
 *
 * NOTE: These tests may incur API costs and are intended for local validation.
 */
describe.skipIf(!hasCopilotSdk() || isCI())('SdkCopilotAdapter Integration', () => {
  beforeAll(() => {
    // Log SDK version for debugging
    const version = getSdkVersion();
    console.log(`GitHub Copilot SDK version: ${version}`);
  });

  it('should emit events in logical order (thinking before message)', async () => {
    /*
    Test Doc:
    - Why: Copilot SDK may emit message before thinking — need to verify raw SDK ordering
    - Contract: Captures all raw SDK events AND translated AgentEvents to compare ordering
    - Quality Contribution: Identifies if misordering is SDK-level or adapter-level
    */
    const { CopilotClient } = await import('@github/copilot-sdk');
    const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');

    const realClient = new CopilotClient();
    const adapter = new SdkCopilotAdapter(realClient);

    const translatedEvents: Array<{ type: string; seq: number; contentPreview: string }> = [];
    let seq = 0;

    try {
      const result = await adapter.run({
        prompt: 'Say "hello world" in one sentence',
        onEvent: (event) => {
          const preview = ('content' in event.data ? (event.data as {content?: string}).content : '') ?? '';
          translatedEvents.push({ type: event.type, seq: seq++, contentPreview: preview.substring(0, 60) });
        },
      });

      console.log('\n=== TRANSLATED EVENT ORDER ===');
      for (const e of translatedEvents) {
        console.log(`  [${e.seq}] ${e.type}${e.contentPreview ? ` — "${e.contentPreview}"` : ''}`);
      }

      // With streaming, thinking deltas should come before text deltas.
      // Consolidated message/thinking events should be suppressed (they're duplicates).
      const firstThinkingIdx = translatedEvents.findIndex((e) => e.type === 'thinking');
      const firstTextIdx = translatedEvents.findIndex((e) => e.type === 'text_delta');
      const messageIdx = translatedEvents.findIndex((e) => e.type === 'message');

      if (firstThinkingIdx >= 0 && firstTextIdx >= 0) {
        console.log(`\n  first thinking at index ${firstThinkingIdx}, first text_delta at index ${firstTextIdx}`);
        expect(firstThinkingIdx).toBeLessThan(firstTextIdx);
      }

      // Consolidated message should be suppressed when text_delta was streamed
      console.log(`  consolidated message event: ${messageIdx >= 0 ? 'PRESENT (unexpected)' : 'SUPPRESSED (correct)'}`);
      expect(messageIdx).toBe(-1);

      expect(result.status).toBe('completed');
    } finally {
      await realClient.stop();
    }
  }, 60000);

  it('should create session with real SDK and return valid sessionId', async () => {
    /*
    Test Doc:
    - Why: Validates real SDK creates sessions with proper IDs
    - Contract: Real SDK session.sessionId is available immediately
    - Usage Notes: Requires GitHub authentication
    - Quality Contribution: Proves SDK integration works end-to-end
    - Worked Example: CopilotClient.createSession() → session.sessionId defined
    */
    // Import real SDK - dynamic import to avoid load-time failures
    const { CopilotClient } = await import('@github/copilot-sdk');
    const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');

    const realClient = new CopilotClient();
    const adapter = new SdkCopilotAdapter(realClient);

    try {
      const result = await adapter.run({ prompt: 'Say "hello" in one word' });

      expect(result.sessionId).toBeDefined();
      expect(result.sessionId.length).toBeGreaterThan(0);
      expect(result.status).toBe('completed');
    } finally {
      // Cleanup
      await realClient.stop();
    }
  }, 60000); // 60s timeout for real API calls

  it('should compact session with real SDK', async () => {
    /*
    Test Doc:
    - Why: Validates compact() works with real SDK
    - Contract: compact() sends /compact and returns result
    - Usage Notes: Per DYK-01: /compact is CLI command not SDK native method
    - Quality Contribution: Proves compact integration works
    - Worked Example: adapter.compact(sessionId) → status completed
    */
    const { CopilotClient } = await import('@github/copilot-sdk');
    const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');

    const realClient = new CopilotClient();
    const adapter = new SdkCopilotAdapter(realClient);

    try {
      // First create a session
      const runResult = await adapter.run({ prompt: 'Remember: test value = 42' });
      const sessionId = runResult.sessionId;

      // Then compact it
      const compactResult = await adapter.compact(sessionId);

      expect(compactResult.sessionId).toBe(sessionId);
      expect(compactResult.status).toBe('completed');
    } finally {
      await realClient.stop();
    }
  }, 90000); // 90s timeout for multiple API calls

  it('should terminate session with real SDK', async () => {
    /*
    Test Doc:
    - Why: Validates terminate() properly cleans up real SDK sessions
    - Contract: terminate() returns killed status
    - Usage Notes: Session should be properly destroyed
    - Quality Contribution: Proves termination integration works
    - Worked Example: adapter.terminate(sessionId) → status killed, exitCode 137
    */
    const { CopilotClient } = await import('@github/copilot-sdk');
    const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');

    const realClient = new CopilotClient();
    const adapter = new SdkCopilotAdapter(realClient);

    try {
      // First create a session
      const runResult = await adapter.run({ prompt: 'Hello' });
      const sessionId = runResult.sessionId;

      // Then terminate it
      const terminateResult = await adapter.terminate(sessionId);

      expect(terminateResult.sessionId).toBe(sessionId);
      expect(terminateResult.status).toBe('killed');
      expect(terminateResult.exitCode).toBe(137);
    } finally {
      await realClient.stop();
    }
  }, 60000);

  it('should resume session with real SDK', async () => {
    /*
    Test Doc:
    - Why: Validates session resumption works with real SDK
    - Contract: Same sessionId across multiple run() calls
    - Usage Notes: Per CF-02: resumeSession() for session continuity
    - Quality Contribution: Proves multi-turn conversations work
    - Worked Example: run() → sessionId → run(sessionId) → same session
    */
    const { CopilotClient } = await import('@github/copilot-sdk');
    const { SdkCopilotAdapter } = await import('@chainglass/shared/adapters');

    const realClient = new CopilotClient();
    const adapter = new SdkCopilotAdapter(realClient);

    try {
      // First turn
      const result1 = await adapter.run({ prompt: 'Remember: magic number is 7' });
      const sessionId = result1.sessionId;

      // Second turn with same session
      const result2 = await adapter.run({
        prompt: 'What is the magic number?',
        sessionId,
      });

      expect(result2.sessionId).toBe(sessionId);
      expect(result2.status).toBe('completed');
      // Response should contain "7" if context was preserved
      // (not asserting exact content since LLM responses vary)
    } finally {
      await realClient.stop();
    }
  }, 90000);
});
