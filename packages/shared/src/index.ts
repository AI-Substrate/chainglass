// @chainglass/shared entry point
// Exports all shared interfaces, fakes, and adapters

// Interfaces
export { LogLevel } from './interfaces/index.js';
export type { ILogger, LogEntry } from './interfaces/index.js';

// Fakes
export { FakeLogger } from './fakes/index.js';

// Adapters
export { PinoLoggerAdapter } from './adapters/index.js';
