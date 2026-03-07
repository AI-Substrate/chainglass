/**
 * @test-doc
 * @id T001-output-schema
 * @title CLI output envelope schema tests
 * @phase Phase 3: Harness CLI SDK
 * @verifies AC-11 (structured JSON), AC-12 (error codes E100-E110)
 */

import { describe, expect, it } from 'vitest';

// These imports will fail until T002 implements them — that's the RED in TDD
import {
  type HarnessEnvelope,
  type HarnessErrorCode,
  ErrorCodes,
  formatSuccess,
  formatError,
  parseEnvelope,
} from '../../../src/cli/output.js';

describe('CLI output envelope', () => {
  describe('formatSuccess', () => {
    it('produces a valid success envelope', () => {
      /*
      Test Doc:
      - Why: Core contract — every CLI command must produce this shape.
      - Contract: formatSuccess(cmd, data) → {command, status:"ok", data, no error}.
      - Usage Notes: Pure function, no side effects.
      - Quality Contribution: Catches envelope shape regressions before any command ships.
      - Worked Example: formatSuccess('health', {app:'up'}) → {command:'health', status:'ok', data:{app:'up'}}
      */
      const result = formatSuccess('health', { app: 'up' });
      expect(result).toMatchObject({
        command: 'health',
        status: 'ok',
        data: { app: 'up' },
      });
      expect(result.error).toBeUndefined();
    });

    it('supports degraded status', () => {
      /*
      Test Doc:
      - Why: DYK #1 — degraded is distinct from ok and error; agents parse the status field.
      - Contract: formatSuccess(cmd, data, 'degraded') → status:"degraded", exit 0.
      - Usage Notes: Used by health command when some services are down.
      - Quality Contribution: Validates the three-state status model.
      - Worked Example: formatSuccess('health', {...}, 'degraded').status === 'degraded'
      */
      const result = formatSuccess('health', { app: 'up', cdp: 'down' }, 'degraded');
      expect(result.status).toBe('degraded');
      expect(result.data).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('includes a timestamp', () => {
      /*
      Test Doc:
      - Why: Agents need timestamps for ordering and staleness detection.
      - Contract: Every envelope has an ISO 8601 timestamp.
      - Usage Notes: Timestamp is set at format time, not at command start.
      - Quality Contribution: Prevents missing timestamps breaking Zod parse.
      - Worked Example: formatSuccess('build', {}).timestamp matches ISO pattern.
      */
      const result = formatSuccess('build', {});
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('formatError', () => {
    it('produces a valid error envelope', () => {
      /*
      Test Doc:
      - Why: Error envelopes are the agent's primary failure signal.
      - Contract: formatError(cmd, code, msg) → {status:"error", error:{code, message}, no data}.
      - Usage Notes: Error code must be in E100-E110 range.
      - Quality Contribution: Ensures structured errors, not raw strings.
      - Worked Example: formatError('build','E102','Docker build failed') → envelope with error.code='E102'.
      */
      const result = formatError('build', 'E102', 'Docker build failed');
      expect(result).toMatchObject({
        command: 'build',
        status: 'error',
        error: {
          code: 'E102',
          message: 'Docker build failed',
        },
      });
      expect(result.data).toBeUndefined();
    });

    it('includes optional details', () => {
      /*
      Test Doc:
      - Why: Some errors carry diagnostic context (e.g., which services are down).
      - Contract: formatError with details → error.details populated.
      - Usage Notes: Details is free-form; agents may inspect for debugging.
      - Quality Contribution: Validates the details passthrough path.
      - Worked Example: formatError(..., {app:'down'}).error.details → {app:'down'}.
      */
      const result = formatError('health', 'E103', 'Health check failed', {
        app: 'down',
        cdp: 'down',
      });
      expect(result.error?.details).toEqual({ app: 'down', cdp: 'down' });
    });
  });

  describe('parseEnvelope', () => {
    it('parses a valid success JSON string', () => {
      /*
      Test Doc:
      - Why: Agents receive JSON strings from stdout and must parse them.
      - Contract: parseEnvelope(json) → validated HarnessEnvelope.
      - Usage Notes: Uses Zod schema validation under the hood.
      - Quality Contribution: Catches schema drift between producer and consumer.
      - Worked Example: parseEnvelope('{"command":"health","status":"ok",...}') → typed envelope.
      */
      const json = JSON.stringify({
        command: 'health',
        status: 'ok',
        timestamp: new Date().toISOString(),
        data: { app: 'up' },
      });
      const parsed = parseEnvelope(json);
      expect(parsed.command).toBe('health');
      expect(parsed.status).toBe('ok');
    });

    it('parses a valid error JSON string', () => {
      /*
      Test Doc:
      - Why: Error envelopes must also round-trip through parse.
      - Contract: parseEnvelope(errorJson) → envelope with error.code.
      - Usage Notes: Same parser handles both success and error shapes.
      - Quality Contribution: Ensures error envelopes pass Zod validation.
      - Worked Example: parseEnvelope('{"status":"error",...}').error.code → 'E102'.
      */
      const json = JSON.stringify({
        command: 'build',
        status: 'error',
        timestamp: new Date().toISOString(),
        error: { code: 'E102', message: 'Build failed' },
      });
      const parsed = parseEnvelope(json);
      expect(parsed.status).toBe('error');
      expect(parsed.error?.code).toBe('E102');
    });

    it('throws on invalid JSON', () => {
      /*
      Test Doc:
      - Why: Corrupted output must fail loudly, not silently.
      - Contract: parseEnvelope(garbage) throws.
      - Usage Notes: Agents should catch and report parse failures.
      - Quality Contribution: Prevents silent data corruption.
      - Worked Example: parseEnvelope('not json') → throws.
      */
      expect(() => parseEnvelope('not json')).toThrow();
    });

    it('throws on missing command field', () => {
      /*
      Test Doc:
      - Why: The command field is required — without it agents can't route responses.
      - Contract: parseEnvelope without command → throws ZodError.
      - Usage Notes: Tests Zod schema enforcement.
      - Quality Contribution: Catches accidental omission of required fields.
      - Worked Example: parseEnvelope('{"status":"ok"}') → throws.
      */
      expect(() =>
        parseEnvelope(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() })),
      ).toThrow();
    });
  });

  describe('ErrorCodes', () => {
    it('defines codes in the E100-E110 range', () => {
      /*
      Test Doc:
      - Why: Error codes must stay in the documented range for agent compatibility.
      - Contract: All ErrorCodes values are E100-E110.
      - Usage Notes: Adding new codes outside this range would break the contract.
      - Quality Contribution: Prevents accidental code range expansion.
      - Worked Example: Object.values(ErrorCodes).every(c => 100 <= parseInt(c.slice(1)) <= 110).
      */
      const codes = Object.values(ErrorCodes);
      expect(codes.length).toBeGreaterThanOrEqual(5);
      for (const code of codes) {
        const num = Number.parseInt(code.replace('E', ''), 10);
        expect(num).toBeGreaterThanOrEqual(100);
        expect(num).toBeLessThanOrEqual(110);
      }
    });

    it('has distinct codes for container, build, health, cdp, test, screenshot, args, timeout, docker', () => {
      /*
      Test Doc:
      - Why: Each failure mode needs a unique code so agents can branch on it.
      - Contract: ErrorCodes maps names to E100-E110 with no duplicates.
      - Usage Notes: The exact mapping is part of the public API contract.
      - Quality Contribution: Catches accidental code reuse or renaming.
      - Worked Example: ErrorCodes.BUILD_FAILED === 'E102'.
      */
      expect(ErrorCodes.UNKNOWN).toBe('E100');
      expect(ErrorCodes.CONTAINER_NOT_RUNNING).toBe('E101');
      expect(ErrorCodes.BUILD_FAILED).toBe('E102');
      expect(ErrorCodes.HEALTH_FAILED).toBe('E103');
      expect(ErrorCodes.CDP_UNAVAILABLE).toBe('E104');
      expect(ErrorCodes.TEST_FAILED).toBe('E105');
      expect(ErrorCodes.SCREENSHOT_FAILED).toBe('E106');
      expect(ErrorCodes.RESULTS_NOT_FOUND).toBe('E107');
      expect(ErrorCodes.INVALID_ARGS).toBe('E108');
      expect(ErrorCodes.TIMEOUT).toBe('E109');
      expect(ErrorCodes.DOCKER_UNAVAILABLE).toBe('E110');
    });
  });
});
