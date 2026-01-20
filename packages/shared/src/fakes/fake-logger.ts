import type { ILogger, LogEntry } from '../interfaces/logger.interface.js';
import { LogLevel } from '../interfaces/logger.interface.js';

/**
 * FakeLogger is a test double for ILogger that captures all log entries
 * and provides assertion helpers for testing.
 *
 * Design: child() shares the parent's entries array so tests can verify
 * child logs from the parent reference (KISS approach per Critical Discovery 08).
 */
export class FakeLogger implements ILogger {
  private readonly entries: LogEntry[];
  private readonly metadata: Record<string, unknown>;

  constructor(entries?: LogEntry[], metadata?: Record<string, unknown>) {
    // Share entries array with parent if provided, otherwise create new
    this.entries = entries ?? [];
    this.metadata = metadata ?? {};
  }

  trace(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, data, error);
  }

  fatal(message: string, error?: Error, data?: Record<string, unknown>): void {
    this.log(LogLevel.FATAL, message, data, error);
  }

  child(metadata: Record<string, unknown>): ILogger {
    // Child shares parent's entries array, merges metadata
    return new FakeLogger(this.entries, { ...this.metadata, ...metadata });
  }

  // Test helper methods

  /**
   * Get all captured log entries.
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Get log entries filtered by level.
   */
  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter((e) => e.level === level);
  }

  /**
   * Assert that a message was logged at a specific level.
   * Uses substring matching for the message.
   * @throws Error if no matching entry found
   */
  assertLoggedAtLevel(level: LogLevel, messageSubstring: string): void {
    const found = this.entries.some(
      (e) => e.level === level && e.message.includes(messageSubstring)
    );
    if (!found) {
      const entriesAtLevel = this.getEntriesByLevel(level);
      const messages = entriesAtLevel.map((e) => `  - "${e.message}"`).join('\n');
      throw new Error(
        `Expected log at ${level} containing "${messageSubstring}" but none found.\n` +
          `Entries at ${level}:\n${messages || '  (none)'}`
      );
    }
  }

  /**
   * Clear all captured log entries.
   */
  clear(): void {
    this.entries.length = 0;
  }

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: Error
  ): void {
    this.entries.push({
      level,
      message,
      data: data ? { ...this.metadata, ...data } : this.metadata,
      error,
      timestamp: new Date(),
    });
  }
}
