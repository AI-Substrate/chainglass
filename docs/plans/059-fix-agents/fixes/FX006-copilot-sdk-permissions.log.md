# Execution Log: Fix FX006 — Copilot SDK Permissions + Upgrade

## FX006-1: Upgrade SDK (DONE)
- Bumped `@github/copilot-sdk` from `^0.1.26` to `^0.1.30` in `packages/shared/package.json`
- `pnpm install` clean, 3 new sub-packages

## FX006-2: Add cliArgs (DONE)
- Changed `registerSingleton(token, CopilotClient)` → `registerInstance(token, new CopilotClient({ cliArgs: ['--allow-all-tools', '--allow-all-paths'] }))`
- `registerSingleton` doesn't support constructor args — `registerInstance` is correct DI pattern

## FX006-3: Add onPermissionRequest: approveAll (DONE)
- SDK 0.1.30 requires `onPermissionRequest` handler on `createSession` and `resumeSession`
- Without it: "An onPermissionRequest handler is required when resuming a session"
- Added `approveAll` handler to all 3 session call sites (run, compact, terminate)
- Updated `ICopilotClient` interfaces with `onPermissionRequest` field
- Validated with `scratch/test-copilot-permissions.ts` — bash tool execution works

## FX006-4: Defensive JSON parsing (DONE)
- `AgentManagerService.initialize()` now catches per-agent hydration errors
- Corrupt `instance.json` (double `}}`) skipped with `console.warn` instead of crashing all agents
- Fixed corrupt `agent-mmb8ra22-j2efwx/instance.json` data file

## FX006-5: report_intent as first-class intent source (DONE)
- `report_intent` tool calls set `_intentIsExplicit = true` UNCONDITIONALLY (before value check)
- Other tool_call events (bash, read, edit) only set intent when `_intentIsExplicit` is false
- Flag resets at start of each `run()` call
- Root cause of bug: flag was inside `intentText !== this._intent` guard — same-text report_intent never latched
- Removed prompt-as-intent fallback (user prompt text was leaking into intent display)
- Removed `thinking` events from intent extraction — only `report_intent` and tool calls set intent
- `extractIntent()` returns `null` for `report_intent` (AgentInstance is sole authority)
- Tool name normalized to lowercase for robustness

## FX006-6: Thinking block ordering (DONE)
- Thinking blocks now render BEFORE response text in chat view
- Swapped flush order in `mergeAgentEvents()` — thinking before text at all 3 flush points

## FX006-7: Chat input keybindings (DONE)
- Enter to submit (was Cmd+Enter)
- Shift+Enter for newline (was plain Enter)
- Updated hint text below input

## FX006-8: Intent display above chat input (DONE)
- Added `Intent: <text>` bar between messages and text input in `agent-chat-view.tsx`

## Key Finding (from GPT-5.3-Codex research)
- `_intentIsExplicit = true` was gated by `intentText !== this._intent` — if same intent text repeated across turns, flag never latched and bash overwrote
- Fix: set flag unconditionally when report_intent arrives, only gate `setIntent()` on value change

## Test Results
- 344 test files passed, 4898 tests, 0 failures throughout all changes
