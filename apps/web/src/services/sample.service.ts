/**
 * REFERENCE IMPLEMENTATION - DO NOT MODIFY FOR FEATURES
 *
 * SampleService demonstrates the clean architecture pattern for services.
 * This is a pedagogical example showing how services should:
 *
 * 1. Receive dependencies (ILogger) via constructor injection
 * 2. Depend only on interfaces, never concrete adapters
 * 3. Be testable with FakeLogger for deterministic assertions
 *
 * When adding new services to Chainglass, use this as your template.
 * Copy the pattern, then implement your actual business logic.
 *
 * @see /docs/rules/architecture.md for full clean architecture guidelines
 * @see /test/unit/web/sample-service.test.ts for test pattern examples
 */

import type { ILogger } from '@chainglass/shared';

/**
 * Reference implementation of a service with DI.
 *
 * Services are the business logic layer. They:
 * - Orchestrate operations using injected adapters
 * - Are framework-agnostic (can work in CLI, web, or MCP)
 * - Are testable by injecting fakes
 */
export class SampleService {
  constructor(private readonly logger: ILogger) {}

  /**
   * Example method demonstrating service patterns.
   *
   * A real service method would:
   * - Validate inputs
   * - Orchestrate operations across adapters
   * - Handle errors gracefully
   * - Log at appropriate levels for observability
   *
   * @param input - The input to process
   * @returns Processed result string
   */
  async doSomething(input: string): Promise<string> {
    this.logger.info('Processing input', { input });

    // Business logic would go here
    // This is intentionally trivial to focus on the pattern
    const result = `Processed: ${input}`;

    this.logger.info('Processing complete', { input, result });

    return result;
  }
}
