import { FakeLogger, PinoLoggerAdapter } from '@chainglass/shared';
import { loggerContractTests } from './logger.contract.js';

// Run contract tests for FakeLogger
loggerContractTests('FakeLogger', () => new FakeLogger());

// Run contract tests for PinoLoggerAdapter
loggerContractTests('PinoLoggerAdapter', () => new PinoLoggerAdapter());
