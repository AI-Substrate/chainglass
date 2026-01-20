import { FakeLogger, LogLevel } from '@chainglass/shared';
import { beforeEach, describe, expect, it } from 'vitest';

describe('FakeLogger', () => {
  let logger: FakeLogger;

  beforeEach(() => {
    logger = new FakeLogger();
  });

  it('should capture log entries at all levels', () => {
    /*
    Test Doc:
    - Why: FakeLogger is the primary test double for logging; must capture all levels to enable assertions
    - Contract: Every log method call is recorded with level, message, and optional data intact
    - Usage Notes: Call any log method (trace/debug/info/warn/error/fatal), then use getEntries() to inspect
    - Quality Contribution: Catches missing log level implementations, ensures services can be tested for logging behavior
    - Worked Example: logger.info('msg') -> getEntries() returns [{level: INFO, message: 'msg', data: undefined}]
    */
    logger.trace('trace msg');
    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg', new Error('test'));
    logger.fatal('fatal msg', new Error('critical'));

    const entries = logger.getEntries();
    expect(entries).toHaveLength(6);
    expect(entries.map((e) => e.level)).toEqual([
      LogLevel.TRACE,
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
      LogLevel.FATAL,
    ]);
  });

  it('should filter entries by level', () => {
    /*
    Test Doc:
    - Why: Tests often need to assert on specific log levels without noise from other levels
    - Contract: getEntriesByLevel(level) returns only entries matching that exact level
    - Usage Notes: Pass a LogLevel enum value; returns empty array if no matches
    - Quality Contribution: Catches filtering bugs that could cause false-positive test assertions
    - Worked Example: After info('a'), error('b'), info('c') -> getEntriesByLevel(INFO) returns 2 entries
    */
    logger.info('info 1');
    logger.error('error 1', new Error('e1'));
    logger.info('info 2');

    const infoEntries = logger.getEntriesByLevel(LogLevel.INFO);
    expect(infoEntries).toHaveLength(2);
  });

  it('should assert message was logged', () => {
    /*
    Test Doc:
    - Why: Manual inspection of log entries is verbose; need a one-liner assertion method
    - Contract: assertLoggedAtLevel throws if no entry matches level+message substring, otherwise succeeds
    - Usage Notes: Uses substring matching for message; throws descriptive error on failure
    - Quality Contribution: Catches missing or incorrect log calls in services; improves test readability
    - Worked Example: After info('Processing request'), assertLoggedAtLevel(INFO, 'Processing') succeeds
    */
    logger.info('Processing request', { requestId: '123' });

    // Should not throw
    logger.assertLoggedAtLevel(LogLevel.INFO, 'Processing request');

    // Should throw for non-existent message
    expect(() => {
      logger.assertLoggedAtLevel(LogLevel.INFO, 'Non-existent');
    }).toThrow();
  });

  it('should clear all entries', () => {
    /*
    Test Doc:
    - Why: Tests need isolation; clearing entries prevents pollution between test cases
    - Contract: After clear(), getEntries() returns empty array
    - Usage Notes: Call clear() in beforeEach or when testing multiple operations in sequence
    - Quality Contribution: Catches bugs where clear() doesn't actually reset state
    - Worked Example: log 3 entries, clear(), getEntries().length === 0
    */
    logger.info('msg 1');
    logger.info('msg 2');
    logger.info('msg 3');

    expect(logger.getEntries()).toHaveLength(3);

    logger.clear();

    expect(logger.getEntries()).toHaveLength(0);
  });

  it('should capture log data/context', () => {
    /*
    Test Doc:
    - Why: Structured logging with context is essential for production debugging
    - Contract: data parameter is stored in entry.data and accessible for assertions
    - Usage Notes: Pass object as second parameter to any log method; entry.data will contain it
    - Quality Contribution: Catches missing context capture; ensures structured logging works
    - Worked Example: logger.info('msg', { userId: '42' }) -> entry.data.userId === '42'
    */
    logger.info('User action', { userId: '42', action: 'login' });

    const entries = logger.getEntriesByLevel(LogLevel.INFO);
    expect(entries[0].data).toEqual({ userId: '42', action: 'login' });
  });

  it('should create child logger with metadata', () => {
    /*
    Test Doc:
    - Why: Child loggers enable request-scoped context; parent must see child's logs for testing
    - Contract: child(metadata) returns ILogger that shares entries with parent and merges metadata
    - Usage Notes: Child logs are visible via parent's getEntries(); metadata is merged into data
    - Quality Contribution: Catches child logger isolation bugs; ensures context inheritance works
    - Worked Example: child({requestId:'x'}).info('msg') -> parent.getEntries() contains entry with requestId
    */
    const childLogger = logger.child({ requestId: '123' });
    childLogger.info('Child log message', { extra: 'data' });

    // Parent should see child's logs (shared entries array)
    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe('Child log message');
    expect(entries[0].data).toEqual({ requestId: '123', extra: 'data' });
  });

  it('should capture error objects in error/fatal', () => {
    /*
    Test Doc:
    - Why: Error objects need special handling; must be captured for stack trace debugging
    - Contract: Error passed to error()/fatal() is stored in entry.error
    - Usage Notes: Access entry.error to inspect the Error object; error is optional
    - Quality Contribution: Catches missing error capture; ensures stack traces are available
    - Worked Example: logger.error('failed', new Error('boom')) -> entry.error.message === 'boom'
    */
    const testError = new Error('Something went wrong');
    logger.error('Operation failed', testError, { context: 'test' });

    const entries = logger.getEntriesByLevel(LogLevel.ERROR);
    expect(entries[0].error).toBe(testError);
    expect(entries[0].error?.message).toBe('Something went wrong');
  });

  it('should include timestamp in entries', () => {
    /*
    Test Doc:
    - Why: Timestamps are essential for debugging timing issues and log ordering
    - Contract: Every log entry has a timestamp property that is a Date object
    - Usage Notes: timestamp is set at log time; useful for verifying operation timing
    - Quality Contribution: Catches missing timestamp capture; ensures audit trail works
    - Worked Example: logger.info('msg') -> entry.timestamp instanceof Date
    */
    const before = new Date();
    logger.info('timed message');
    const after = new Date();

    const entries = logger.getEntries();
    expect(entries[0].timestamp).toBeInstanceOf(Date);
    expect(entries[0].timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(entries[0].timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
