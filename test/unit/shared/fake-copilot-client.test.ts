import { beforeEach, describe, expect, it } from 'vitest';

import type { ICopilotClient, ICopilotSession } from '@chainglass/shared';
// Note: FakeCopilotClient will be imported once T006 creates it
// For now, we reference the interface to ensure tests are ready for implementation

describe('FakeCopilotClient', () => {
  /**
   * Purpose: Validate FakeCopilotClient implements ICopilotClient contract
   * Quality Contribution: Ensures test double is contract-compliant for unit testing
   * Acceptance Criteria: All ICopilotClient methods work with configurable behavior
   */

  // Placeholder for fake - will fail until T006 implements it
  let fake: ICopilotClient;

  beforeEach(() => {
    // T006 will implement FakeCopilotClient
    // For now, tests will fail because FakeCopilotClient doesn't exist
    // This is the TDD RED phase
    fake = undefined as unknown as ICopilotClient;
  });

  describe('createSession()', () => {
    it('should return a session with immediately available sessionId', async () => {
      /*
      Test Doc:
      - Why: SDK provides sessionId immediately (no polling needed)
      - Contract: createSession() returns ICopilotSession with non-empty sessionId
      - Usage Notes: sessionId available on session.sessionId property
      - Quality Contribution: Verifies immediate session ID availability
      - Worked Example: createSession() → session.sessionId is defined and non-empty
      */
      // This will fail until FakeCopilotClient is implemented (T006)
      const { FakeCopilotClient } = await import('@chainglass/shared/fakes');
      fake = new FakeCopilotClient();

      const session = await fake.createSession();

      expect(session).toBeDefined();
      expect(session.sessionId).toBeDefined();
      expect(session.sessionId).not.toBe('');
    });

    it('should use provided sessionId when specified in config', async () => {
      /*
      Test Doc:
      - Why: Callers may want to specify their own session IDs
      - Contract: createSession({sessionId}) uses that ID
      - Usage Notes: If not provided, fake generates one
      - Quality Contribution: Enables deterministic session IDs in tests
      - Worked Example: createSession({sessionId:'my-id'}) → session.sessionId === 'my-id'
      */
      const { FakeCopilotClient } = await import('@chainglass/shared/fakes');
      fake = new FakeCopilotClient();

      const session = await fake.createSession({ sessionId: 'custom-session-123' });

      expect(session.sessionId).toBe('custom-session-123');
    });

    it('should track created sessions for verification', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify what sessions were created
      - Contract: getSessionHistory() returns all created session IDs
      - Usage Notes: Tracks createSession and resumeSession calls
      - Quality Contribution: Enables call verification in tests
      - Worked Example: createSession(), createSession() → history has 2 entries
      */
      const { FakeCopilotClient } = await import('@chainglass/shared/fakes');
      fake = new FakeCopilotClient();

      await fake.createSession();
      await fake.createSession({ sessionId: 'second-session' });

      const clientWithHistory = fake as ICopilotClient & { getSessionHistory(): string[] };
      expect(clientWithHistory.getSessionHistory).toBeDefined();
      const history = clientWithHistory.getSessionHistory();
      expect(history).toHaveLength(2);
      expect(history[1]).toBe('second-session');
    });
  });

  describe('resumeSession()', () => {
    it('should return a session with the provided sessionId', async () => {
      /*
      Test Doc:
      - Why: Session resumption is critical for conversation continuity
      - Contract: resumeSession(id) returns session with that sessionId
      - Usage Notes: Session must have been previously created (in real SDK)
      - Quality Contribution: Verifies session resumption behavior
      - Worked Example: resumeSession('abc') → session.sessionId === 'abc'
      */
      const { FakeCopilotClient } = await import('@chainglass/shared/fakes');
      fake = new FakeCopilotClient();

      const session = await fake.resumeSession('existing-session-456');

      expect(session.sessionId).toBe('existing-session-456');
    });

    it('should allow configuring failure for unknown sessions', async () => {
      /*
      Test Doc:
      - Why: Tests need to verify error handling for invalid sessions
      - Contract: Configurable to throw on unknown session IDs
      - Usage Notes: Use config to enable strict mode
      - Quality Contribution: Enables error path testing
      - Worked Example: FakeCopilotClient({strictSessions:true}); resumeSession('unknown') → throw
      */
      const { FakeCopilotClient } = await import('@chainglass/shared/fakes');
      const strictFake = new FakeCopilotClient({ strictSessions: true });

      await expect(strictFake.resumeSession('unknown-session')).rejects.toThrow();
    });
  });

  describe('stop()', () => {
    it('should return empty array on clean shutdown', async () => {
      /*
      Test Doc:
      - Why: stop() signals client shutdown; errors returned if issues
      - Contract: stop() returns Error[] (empty = success)
      - Usage Notes: Called during cleanup
      - Quality Contribution: Verifies shutdown behavior
      - Worked Example: stop() → []
      */
      const { FakeCopilotClient } = await import('@chainglass/shared/fakes');
      fake = new FakeCopilotClient();

      const errors = await fake.stop();

      expect(errors).toEqual([]);
    });

    it('should allow configuring shutdown errors', async () => {
      /*
      Test Doc:
      - Why: Tests may need to verify error handling during shutdown
      - Contract: Configurable to return errors on stop()
      - Usage Notes: Use config to specify errors
      - Quality Contribution: Enables error path testing
      - Worked Example: FakeCopilotClient({stopErrors:[new Error('x')]}); stop() → [Error('x')]
      */
      const { FakeCopilotClient } = await import('@chainglass/shared/fakes');
      const errorFake = new FakeCopilotClient({
        stopErrors: [new Error('Shutdown failed')],
      });

      const errors = await errorFake.stop();

      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toBe('Shutdown failed');
    });
  });

  describe('getStatus()', () => {
    it('should return version and protocol information', async () => {
      /*
      Test Doc:
      - Why: getStatus() provides client health/version info
      - Contract: Returns {version: string, protocolVersion: number}
      - Usage Notes: Used for diagnostics
      - Quality Contribution: Verifies status reporting
      - Worked Example: getStatus() → {version:'1.0.0', protocolVersion:1}
      */
      const { FakeCopilotClient } = await import('@chainglass/shared/fakes');
      fake = new FakeCopilotClient();

      const status = await fake.getStatus();

      expect(status.version).toBeDefined();
      expect(typeof status.version).toBe('string');
      expect(status.protocolVersion).toBeDefined();
      expect(typeof status.protocolVersion).toBe('number');
    });

    it('should allow configuring status response', async () => {
      /*
      Test Doc:
      - Why: Tests may need specific version info
      - Contract: Configurable status response
      - Usage Notes: Use config to specify version
      - Quality Contribution: Enables version-specific testing
      - Worked Example: FakeCopilotClient({status:{version:'2.0.0'}}) → getStatus().version === '2.0.0'
      */
      const { FakeCopilotClient } = await import('@chainglass/shared/fakes');
      const versionedFake = new FakeCopilotClient({
        status: { version: '0.1.16', protocolVersion: 2 },
      });

      const status = await versionedFake.getStatus();

      expect(status.version).toBe('0.1.16');
      expect(status.protocolVersion).toBe(2);
    });
  });

  describe('session event configuration', () => {
    it('should allow configuring events that sessions will emit', async () => {
      /*
      Test Doc:
      - Why: Unit tests need to simulate various event scenarios
      - Contract: Sessions emit pre-configured events during sendAndWait()
      - Usage Notes: Events configured at client level, applied to created sessions
      - Quality Contribution: Enables event-driven testing
      - Worked Example: FakeCopilotClient({events:[{type:'assistant.message', data:{content:'Hi'}}]})
      */
      const { FakeCopilotClient } = await import('@chainglass/shared/fakes');
      const configuredFake = new FakeCopilotClient({
        events: [
          { type: 'assistant.message', data: { content: 'Test response' } },
          { type: 'session.idle', data: {} },
        ],
      });

      const session = await configuredFake.createSession();

      // Session should have access to configured events
      expect(session).toBeDefined();
    });
  });
});
