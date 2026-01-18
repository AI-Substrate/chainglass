import type { ILogger } from '@chainglass/shared';
import { describe, expect, it } from 'vitest';

/**
 * Contract tests for ILogger implementations.
 *
 * Per Critical Discovery 09: Contract tests prevent fake drift by ensuring
 * both FakeLogger and PinoLoggerAdapter pass the same behavioral tests.
 *
 * Usage:
 * ```typescript
 * import { loggerContractTests } from '@test/contracts/logger.contract';
 *
 * loggerContractTests('FakeLogger', () => new FakeLogger());
 * loggerContractTests('PinoLoggerAdapter', () => new PinoLoggerAdapter());
 * ```
 */
export function loggerContractTests(name: string, createLogger: () => ILogger) {
  describe(`${name} implements ILogger contract`, () => {
    it('should not throw when logging at any level', () => {
      /*
      Test Doc:
      - Why: Contract tests ensure FakeLogger and PinoLoggerAdapter behave identically; prevents fake drift
      - Contract: All ILogger implementations must accept log calls at every level without throwing
      - Usage Notes: Run this test suite for both FakeLogger and real adapters via parameterized factory
      - Quality Contribution: Catches breaking changes in either implementation; ensures test doubles are trustworthy
      - Worked Example: createLogger().info('test') must not throw for both FakeLogger and PinoLoggerAdapter
      */
      const logger = createLogger();
      expect(() => logger.trace('trace')).not.toThrow();
      expect(() => logger.debug('debug')).not.toThrow();
      expect(() => logger.info('info')).not.toThrow();
      expect(() => logger.warn('warn')).not.toThrow();
      expect(() => logger.error('error', new Error('e'))).not.toThrow();
      expect(() => logger.fatal('fatal', new Error('f'))).not.toThrow();
    });

    it('should create child logger with metadata', () => {
      /*
      Test Doc:
      - Why: Child loggers enable request-scoped context; both fake and real must support this
      - Contract: child(metadata) returns a valid ILogger that can log without throwing
      - Usage Notes: Pass object with context fields; child inherits parent config plus new metadata
      - Quality Contribution: Catches child logger creation failures; ensures structured logging context works
      - Worked Example: createLogger().child({requestId: '123'}).info('msg') must not throw
      */
      const logger = createLogger();
      const child = logger.child({ requestId: '123' });
      expect(child).toBeDefined();
      expect(() => child.info('child log')).not.toThrow();
    });

    it('should accept error objects in error/fatal', () => {
      /*
      Test Doc:
      - Why: Error objects need special handling in logging; both implementations must accept them
      - Contract: error() and fatal() accept Error as second parameter without throwing
      - Usage Notes: Error is optional; passing undefined should also work
      - Quality Contribution: Catches error object handling bugs; ensures stack traces can be logged
      - Worked Example: createLogger().error('failed', new Error('boom')) must not throw
      */
      const logger = createLogger();
      const error = new Error('Test error');
      expect(() => logger.error('error occurred', error)).not.toThrow();
      expect(() => logger.fatal('fatal error', error)).not.toThrow();
    });

    it('should accept optional data parameter', () => {
      /*
      Test Doc:
      - Why: Structured logging data enriches logs; all implementations must accept data objects
      - Contract: All log methods accept optional data object without throwing
      - Usage Notes: data is Record<string, unknown>; any serializable object should work
      - Quality Contribution: Catches data handling bugs; ensures structured logging works
      - Worked Example: createLogger().info('msg', { userId: '42' }) must not throw
      */
      const logger = createLogger();
      const data = { userId: '42', action: 'test' };
      expect(() => logger.trace('trace', data)).not.toThrow();
      expect(() => logger.debug('debug', data)).not.toThrow();
      expect(() => logger.info('info', data)).not.toThrow();
      expect(() => logger.warn('warn', data)).not.toThrow();
      expect(() => logger.error('error', new Error('e'), data)).not.toThrow();
      expect(() => logger.fatal('fatal', new Error('f'), data)).not.toThrow();
    });

    it('should handle nested child loggers', () => {
      /*
      Test Doc:
      - Why: Deep context chains (request -> operation -> sub-operation) are common; must work
      - Contract: child().child() returns valid ILogger that can log without throwing
      - Usage Notes: Each child should accumulate context from parents
      - Quality Contribution: Catches nested child creation bugs; ensures deep context works
      - Worked Example: createLogger().child({a:'1'}).child({b:'2'}).info('msg') must not throw
      */
      const logger = createLogger();
      const child = logger.child({ requestId: '123' });
      const grandchild = child.child({ operationId: '456' });
      expect(grandchild).toBeDefined();
      expect(() => grandchild.info('grandchild log')).not.toThrow();
    });
  });
}
