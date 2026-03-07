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
      const result = formatSuccess('health', { app: 'up' });
      expect(result).toMatchObject({
        command: 'health',
        status: 'ok',
        data: { app: 'up' },
      });
      expect(result.error).toBeUndefined();
    });

    it('supports degraded status', () => {
      const result = formatSuccess('health', { app: 'up', cdp: 'down' }, 'degraded');
      expect(result.status).toBe('degraded');
      expect(result.data).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('includes a timestamp', () => {
      const result = formatSuccess('build', {});
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('formatError', () => {
    it('produces a valid error envelope', () => {
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
      const result = formatError('health', 'E103', 'Health check failed', {
        app: 'down',
        cdp: 'down',
      });
      expect(result.error?.details).toEqual({ app: 'down', cdp: 'down' });
    });
  });

  describe('parseEnvelope', () => {
    it('parses a valid success JSON string', () => {
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
      expect(() => parseEnvelope('not json')).toThrow();
    });

    it('throws on missing command field', () => {
      expect(() =>
        parseEnvelope(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() })),
      ).toThrow();
    });
  });

  describe('ErrorCodes', () => {
    it('defines codes in the E100-E110 range', () => {
      const codes = Object.values(ErrorCodes);
      expect(codes.length).toBeGreaterThanOrEqual(5);
      for (const code of codes) {
        const num = Number.parseInt(code.replace('E', ''), 10);
        expect(num).toBeGreaterThanOrEqual(100);
        expect(num).toBeLessThanOrEqual(110);
      }
    });

    it('has distinct codes for container, build, health, cdp, test, screenshot, args, timeout, docker', () => {
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
