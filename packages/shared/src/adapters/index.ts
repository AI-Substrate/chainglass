export { PinoLoggerAdapter } from './pino-logger.adapter.js';
export { NodeFileSystemAdapter } from './node-filesystem.adapter.js';
export { PathResolverAdapter } from './path-resolver.adapter.js';
export { JsonOutputAdapter } from './json-output.adapter.js';
export { ConsoleOutputAdapter } from './console-output.adapter.js';
export { HashGeneratorAdapter } from './hash-generator.adapter.js';
export { StreamJsonParser } from './stream-json-parser.js';
// Phase 4: Deleted CopilotLogParser (56 LOC) - no longer needed with SDK
export { ClaudeCodeAdapter } from './claude-code.adapter.js';
export type { ClaudeCodeAdapterOptions } from './claude-code.adapter.js';
// Phase 4: Deleted old CopilotAdapter (499 LOC) - replaced by SdkCopilotAdapter
// SdkCopilotAdapter is now exported as both 'SdkCopilotAdapter' and 'CopilotAdapter' for backward compatibility
export { SdkCopilotAdapter, SdkCopilotAdapter as CopilotAdapter } from './sdk-copilot-adapter.js';
export type { SdkCopilotAdapterOptions } from './sdk-copilot-adapter.js';
export { UnixProcessManager } from './unix-process-manager.js';
export { WindowsProcessManager } from './windows-process-manager.js';
export { createProcessManager, ProcessManagerAdapter } from './process-manager.adapter.js';
