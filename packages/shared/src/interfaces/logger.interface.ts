/**
 * Log levels supported by ILogger.
 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

/**
 * Structured log entry captured by FakeLogger.
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  error?: Error;
  timestamp: Date;
}

/**
 * Logging interface for the Chainglass application.
 *
 * All adapters (FakeLogger, PinoLoggerAdapter) implement this interface
 * to ensure consistent logging behavior across production and tests.
 */
export interface ILogger {
  /**
   * Log at TRACE level (most verbose).
   */
  trace(message: string, data?: Record<string, unknown>): void;

  /**
   * Log at DEBUG level.
   */
  debug(message: string, data?: Record<string, unknown>): void;

  /**
   * Log at INFO level.
   */
  info(message: string, data?: Record<string, unknown>): void;

  /**
   * Log at WARN level.
   */
  warn(message: string, data?: Record<string, unknown>): void;

  /**
   * Log at ERROR level.
   */
  error(message: string, error?: Error, data?: Record<string, unknown>): void;

  /**
   * Log at FATAL level (most severe).
   */
  fatal(message: string, error?: Error, data?: Record<string, unknown>): void;

  /**
   * Create a child logger with additional metadata.
   * Child loggers inherit the parent's configuration and add context.
   */
  child(metadata: Record<string, unknown>): ILogger;
}
