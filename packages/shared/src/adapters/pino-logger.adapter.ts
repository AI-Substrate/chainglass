import pino, { type Logger } from 'pino';
import type { ILogger } from '../interfaces/logger.interface.js';

/**
 * Production logging adapter using pino.
 *
 * Per Critical Discovery 08: This is the "real adapter" created last,
 * after the interface (ILogger) and fake (FakeLogger) were established.
 */
export class PinoLoggerAdapter implements ILogger {
  private readonly logger: Logger;

  constructor(pinoInstance?: Logger) {
    this.logger =
      pinoInstance ??
      pino({
        serializers: { err: pino.stdSerializers.err },
      });
  }

  trace(message: string, data?: Record<string, unknown>): void {
    if (data) {
      this.logger.trace(data, message);
    } else {
      this.logger.trace(message);
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (data) {
      this.logger.debug(data, message);
    } else {
      this.logger.debug(message);
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    if (data) {
      this.logger.info(data, message);
    } else {
      this.logger.info(message);
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (data) {
      this.logger.warn(data, message);
    } else {
      this.logger.warn(message);
    }
  }

  error(message: string, error?: Error, data?: Record<string, unknown>): void {
    const mergedData = error ? { ...data, err: error } : data;
    if (mergedData) {
      this.logger.error(mergedData, message);
    } else {
      this.logger.error(message);
    }
  }

  fatal(message: string, error?: Error, data?: Record<string, unknown>): void {
    const mergedData = error ? { ...data, err: error } : data;
    if (mergedData) {
      this.logger.fatal(mergedData, message);
    } else {
      this.logger.fatal(message);
    }
  }

  child(metadata: Record<string, unknown>): ILogger {
    return new PinoLoggerAdapter(this.logger.child(metadata));
  }
}
