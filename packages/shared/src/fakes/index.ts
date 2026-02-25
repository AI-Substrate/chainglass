export { FakeAgentAdapter } from './fake-agent-adapter.js';
export type { FakeAgentAdapterOptions } from './fake-agent-adapter.js';
export { FakeConfigService } from './fake-config.service.js';
export { FakeCopilotClient } from './fake-copilot-client.js';
export type { FakeCopilotClientOptions } from './fake-copilot-client.js';
export { FakeCopilotSession } from './fake-copilot-session.js';
export type { FakeCopilotSessionOptions } from './fake-copilot-session.js';
export { FakeLogger } from './fake-logger.js';
export { FakeFileSystem } from './fake-filesystem.js';
export { FakePathResolver } from './fake-path-resolver.js';
export { FakeOutputAdapter } from './fake-output.adapter.js';
export type { FormattedResult } from './fake-output.adapter.js';
export { FakeDiffAction } from './fake-diff-action.js';
export { FakeHashGenerator } from './fake-hash-generator.js';
export { FakeProcessManager } from './fake-process-manager.js';
// YAML parser fake (Phase 2: extracted from workflow for shared use)
export { FakeYamlParser } from './fake-yaml-parser.js';
// SDK fake (Plan 047: USDK)
export {
  createFakeUSDK,
  FakeCommandRegistry,
  FakeSettingsStore,
  FakeContextKeyService,
  FakeKeybindingService,
} from './fake-usdk.js';
export type { FakeUSDKInstance } from './fake-usdk.js';
