/**
 * Seed global hooks to ~/.chainglass/hooks/
 *
 * Called once on server startup from instrumentation.ts.
 * Writes hook scripts that external tools (Claude Code, etc.) can call
 * to notify the Chainglass server of events.
 *
 * Plan 080: tmux Eventing System
 */

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BELL_SCRIPT = (port: number) => `#!/bin/bash
# chainglass-bell.sh — Notify Chainglass server of a bell event
# Auto-seeded by Chainglass server on startup. Do not edit manually.
# Plan 080: tmux Eventing System

PORT=${port}

curl -s -X POST "http://localhost:\${PORT}/api/tmux/events" \\
  -H 'Content-Type: application/json' \\
  -d '{"session":"claude-code","pane":"hook","event":"BELL","data":{}}' \\
  >/dev/null 2>&1 || true
`;

export function seedGlobalHooks(port: number): void {
  const hooksDir = join(homedir(), '.chainglass', 'hooks');
  mkdirSync(hooksDir, { recursive: true });

  const bellPath = join(hooksDir, 'chainglass-bell.sh');
  writeFileSync(bellPath, BELL_SCRIPT(port), 'utf-8');
  chmodSync(bellPath, 0o755);

  console.log(`[hooks] Seeded ~/.chainglass/hooks/chainglass-bell.sh (port: ${port})`);
}
