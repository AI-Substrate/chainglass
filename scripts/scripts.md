# Scripts

Index of all scripts in this directory. Keep this file updated when adding, removing, or renaming scripts.

## Top-Level Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| `drive-demo.ts` | Orchestration demo with simple-serial graph and real script execution | `npx tsx scripts/drive-demo.ts` |
| `dope-workflows.ts` | Generate 8 demo workflow scenarios covering all node status states | `npx tsx scripts/dope-workflows.ts [demo-serial\|clean]` |
| `generate-templates.ts` | Generate workflow templates from test fixtures into .chainglass/templates/workflows/ | `npx tsx scripts/generate-templates.ts [--fixture smoke\|simple-serial\|all]` |
| `graph-status-gallery.ts` | Visual reference for all formatGraphStatus() scenarios | `npx tsx scripts/graph-status-gallery.ts` |
| `test-advanced-pipeline.ts` | E2E: drives 6-node 4-line graph with real Copilot agents | `npx tsx scripts/test-advanced-pipeline.ts [--interactive]` |
| `test-copilot-cli-adapter.ts` | E2E: validates CopilotCLIAdapter against real running Copilot CLI | `npx tsx scripts/test-copilot-cli-adapter.ts <sessionId> <tmuxSession> <pane>` |
| `test-copilot-serial.ts` | E2E: drives 3-node graph with real Copilot agent, streams SDK events | `npx tsx scripts/test-copilot-serial.ts` |
| `test-watcher-events.mjs` | File watcher stress test — writes to scratch/ every 5s (update, create, delete, mkdir, rmdir) | `node scripts/test-watcher-events.mjs` |

## file-watcher/

| Script | Description | Usage |
|--------|-------------|-------|
| `file-watcher/watch.ts` | Demo: CentralWatcherService + WorkGraphWatcherAdapter on temp directory | `npx tsx scripts/file-watcher/watch.ts` |
| `file-watcher/trigger.ts` | Trigger file changes for the watch.ts demo | `npx tsx scripts/file-watcher/trigger.ts [update\|new\|burst\|non-graph]` |

## agent/

| Script | Description | Usage |
|--------|-------------|-------|
| `agent/demo-claude-streaming.ts` | Demo: real Claude CLI streaming with --output-format=stream-json | `npx tsx scripts/agent/demo-claude-streaming.ts` |
| `agent/demo-claude-adapter-streaming.ts` | Demo: ClaudeCodeAdapter streaming events with real-time emission | `npx tsx scripts/agent/demo-claude-adapter-streaming.ts [--session-id <id>]` |
| `agent/demo-claude-multi-turn.ts` | Demo: multi-turn conversation with Claude proving context survival | `npx tsx scripts/agent/demo-claude-multi-turn.ts [--password "myword"]` |
| `agent/demo-copilot-streaming.ts` | Demo: real SdkCopilotAdapter streaming during Copilot execution | `npx tsx scripts/agent/demo-copilot-streaming.ts` |
| `agent/demo-copilot-adapter-streaming.ts` | Demo: SdkCopilotAdapter streaming events with real Copilot execution | `npx tsx scripts/agent/demo-copilot-adapter-streaming.ts [--session-id <id>]` |
| `agent/demo-copilot-multi-turn.ts` | Demo: multi-turn conversation with Copilot proving context survival | `npx tsx scripts/agent/demo-copilot-multi-turn.ts [--password "myword"]` |

## agents/

| Script | Description | Usage |
|--------|-------------|-------|
| `agents/claude-code-session-demo.ts` | Demo: Claude Code CLI with streaming NDJSON and session ID extraction | `npx tsx scripts/agents/claude-code-session-demo.ts [working_dir]` |
| `agents/copilot-session-demo.ts` | Demo: Copilot CLI with streaming and session ID extraction from logs | `npx tsx scripts/agents/copilot-session-demo.ts [working_dir]` |
| `agents/test-model-tokens-claude.ts` | Test Claude Code CLI model selection and token tracking | `npx tsx scripts/agents/test-model-tokens-claude.ts` |
| `agents/test-model-tokens-copilot.ts` | Test Copilot CLI model selection and token tracking | `npx tsx scripts/agents/test-model-tokens-copilot.ts` |
| `agents/test-external-compact.ts` | Test whether /compact can be triggered externally in Claude and Copilot | `npx tsx scripts/agents/test-external-compact.ts` |
