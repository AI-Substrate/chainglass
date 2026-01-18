/**
 * SampleService Tests for @chainglass/web
 *
 * Tests the reference implementation of a service with DI.
 * SampleService demonstrates the pattern for all future services:
 * - Receives ILogger via constructor (not decorators)
 * - Uses the injected logger for operations
 * - Can be tested with FakeLogger for assertions
 */

// Must import reflect-metadata before tsyringe
import 'reflect-metadata';
import { FakeLogger, type ILogger, LogLevel } from '@chainglass/shared';
import { SampleService } from '@chainglass/web/services/sample.service';
import { beforeEach, describe, expect, it } from 'vitest';

describe('SampleService', () => {
  let service: SampleService;
  let fakeLogger: FakeLogger;

  beforeEach(() => {
    fakeLogger = new FakeLogger();
    service = new SampleService(fakeLogger);
  });

  it('should process input and return result', async () => {
    /*
    Test Doc:
    - Why: Core business logic must transform input correctly; this is the primary happy path
    - Contract: doSomething(input) returns 'Processed: {input}' string
    - Usage Notes: Pass any string; async method returns Promise<string>
    - Quality Contribution: Catches transformation logic bugs; ensures service does its primary job
    - Worked Example: doSomething('test-input') returns 'Processed: test-input'
    */
    const result = await service.doSomething('test-input');

    expect(result).toBe('Processed: test-input');
  });

  it('should log processing operations', async () => {
    /*
    Test Doc:
    - Why: Operations must be observable for debugging and monitoring; silent services are hard to troubleshoot
    - Contract: doSomething() logs INFO 'Processing input' at start and 'Processing complete' at end
    - Usage Notes: Use FakeLogger.assertLoggedAtLevel() to verify; checks substring match
    - Quality Contribution: Catches missing log statements; ensures observability contract is maintained
    - Worked Example: After doSomething('x'), fakeLogger contains INFO entries for start and complete
    */
    await service.doSomething('test');

    fakeLogger.assertLoggedAtLevel(LogLevel.INFO, 'Processing input');
    fakeLogger.assertLoggedAtLevel(LogLevel.INFO, 'Processing complete');
  });

  it('should include input in log metadata', async () => {
    /*
    Test Doc:
    - Why: Structured logging with context enables filtering and correlation in production log systems
    - Contract: 'Processing input' log entry includes {input: <value>} in metadata
    - Usage Notes: Access entry.data to inspect structured metadata; data is optional object
    - Quality Contribution: Catches missing context in logs; ensures production debugging is possible
    - Worked Example: After doSomething('my-value'), log entry has data.input === 'my-value'
    */
    await service.doSomething('my-value');

    const entries = fakeLogger.getEntriesByLevel(LogLevel.INFO);
    const inputEntry = entries.find((e) => e.message.includes('Processing input'));

    expect(inputEntry?.data?.input).toBe('my-value');
  });
});
