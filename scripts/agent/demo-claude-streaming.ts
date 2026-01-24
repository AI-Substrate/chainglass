#!/usr/bin/env npx tsx
/**
 * Demo: REAL Claude CLI streaming events
 * 
 * Shows real-time event emission during ACTUAL Claude execution.
 * Uses REAL Claude CLI with --output-format=stream-json
 * 
 * Run: npx tsx scripts/agent/demo-claude-streaming.ts
 * 
 * Key learnings from Perplexity research:
 * 1. Must use `-p` flag (short form) not `--print`
 * 2. `--verbose` is REQUIRED when using `--output-format=stream-json`
 * 3. stdio must be ['inherit', 'pipe', 'pipe'] to avoid Node.js subprocess hanging
 * 4. Known bug #1920: CLI sometimes doesn't send final 'result' event
 */

import { spawn } from 'node:child_process';
import * as readline from 'node:readline';
import type { AgentEvent, AgentEventHandler } from '@chainglass/shared';

// Color helpers for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function formatEvent(event: AgentEvent): string {
  const timestamp = event.timestamp.split('T')[1].slice(0, 12);
  
  switch (event.type) {
    case 'text_delta':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.green}text_delta${colors.reset}: "${event.data.content}"`;
    case 'message':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.blue}message${colors.reset}: "${event.data.content.slice(0, 80)}${event.data.content.length > 80 ? '...' : ''}"`;
    case 'usage':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.yellow}usage${colors.reset}: in=${event.data.inputTokens}, out=${event.data.outputTokens}`;
    case 'session_start':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.blue}session_start${colors.reset}: ${event.data.sessionId}`;
    case 'session_idle':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.dim}session_idle${colors.reset}`;
    case 'session_error':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.red}session_error${colors.reset}: ${event.data.errorType} - ${event.data.message}`;
    case 'raw':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.magenta}raw${colors.reset}: ${event.data.originalType}`;
    default:
      return `${colors.cyan}[${timestamp}]${colors.reset} unknown: ${JSON.stringify(event)}`;
  }
}

/**
 * Parse Claude stream-json line and translate to AgentEvent
 * 
 * Claude CLI stream-json event types:
 * - {"type":"system","subtype":"init","session_id":"...","tools":[...]}
 * - {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
 * - {"type":"result","subtype":"success","result":"...","total_cost_usd":...,"usage":{...}}
 */
function translateClaudeToAgentEvent(line: string): AgentEvent | null {
  const timestamp = new Date().toISOString();
  
  try {
    const msg = JSON.parse(line);

    // System init → session_start
    if (msg.type === 'system' && msg.subtype === 'init') {
      return {
        type: 'session_start',
        timestamp,
        data: { sessionId: msg.session_id },
      };
    }

    // Assistant message → text_delta (streaming text content)
    if (msg.type === 'assistant' && msg.message?.content) {
      const textBlocks = Array.isArray(msg.message.content) 
        ? msg.message.content.filter((c: any) => c.type === 'text')
        : [];
      const text = textBlocks.map((c: any) => c.text || '').join('');
      if (text) {
        return {
          type: 'text_delta',
          timestamp,
          data: { content: text },
        };
      }
    }

    // Result → message (final output) + usage
    if (msg.type === 'result') {
      // First emit usage if available
      if (msg.usage) {
        // We can only return one event, so we'll embed usage in the message
        // In a real implementation, you'd want to emit both
      }
      return {
        type: 'message',
        timestamp,
        data: { 
          content: msg.result ?? '',
          // Include cost info for visibility
          cost: msg.total_cost_usd,
        },
      };
    }

    // Fallback: raw passthrough for other events
    return {
      type: 'raw',
      timestamp,
      data: {
        provider: 'claude',
        originalType: msg.type || 'unknown',
        originalData: msg,
      },
    };
  } catch {
    // Not JSON, skip
    return null;
  }
}

async function runClaudeWithStreaming(
  prompt: string,
  onEvent: AgentEventHandler,
  timeoutMs = 60000 // Default 60s timeout - workaround for Claude CLI bug #1920
): Promise<{ output: string; sessionId: string }> {
  return new Promise((resolve, reject) => {
    // CRITICAL: Correct flag order for Claude CLI stream-json mode
    // - `-p` flag (short form required, not --print)
    // - `--verbose` is REQUIRED with stream-json
    // - Prompt must come AFTER all flags
    const args = [
      '-p',
      '--verbose',
      '--output-format', 'stream-json',
      prompt,
    ];

    console.log(`${colors.dim}$ claude ${args.join(' ')}${colors.reset}\n`);

    // CRITICAL for Node.js: stdin must be 'inherit' not 'pipe' to avoid hanging
    // See: https://github.com/anthropics/claude-code/issues/1920
    const proc = spawn('claude', args, {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let output = '';
    let sessionId = '';
    let gotResult = false;
    let lastEventTime = Date.now();

    // Timeout: Claude CLI sometimes hangs without sending final 'result' event (bug #1920)
    // See: https://github.com/anthropics/claude-code/issues/1920
    const idleCheckInterval = setInterval(() => {
      const idleTime = Date.now() - lastEventTime;
      if (idleTime > 5000 && output) {
        // No events for 5s and we have output - likely hung
        console.log(`\n${colors.yellow}⚠ No events for ${Math.round(idleTime/1000)}s - resolving (Claude CLI bug #1920)${colors.reset}`);
        clearInterval(idleCheckInterval);
        clearTimeout(absoluteTimeout);
        proc.kill();
        resolve({ output, sessionId });
      }
    }, 1000);

    const absoluteTimeout = setTimeout(() => {
      if (!gotResult) {
        console.log(`\n${colors.yellow}⚠ Timeout after ${timeoutMs/1000}s - resolving (Claude CLI bug #1920)${colors.reset}`);
        clearInterval(idleCheckInterval);
        proc.kill();
        resolve({ output, sessionId });
      }
    }, timeoutMs);

    // Parse stdout line by line
    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      lastEventTime = Date.now();
      const event = translateClaudeToAgentEvent(line);
      if (event) {
        onEvent(event);
        
        if (event.type === 'text_delta') {
          output += event.data.content;
        }
        if (event.type === 'message') {
          output = event.data.content;
          gotResult = true;
        }
        if (event.type === 'session_start' && event.data.sessionId) {
          sessionId = event.data.sessionId;
        }
      }
    });

    proc.stderr.on('data', (data) => {
      console.error(`${colors.red}stderr:${colors.reset}`, data.toString());
    });

    proc.on('close', (code) => {
      clearInterval(idleCheckInterval);
      clearTimeout(absoluteTimeout);
      if (code === 0 || output) {
        resolve({ output, sessionId });
      } else {
        reject(new Error(`Claude exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      clearInterval(idleCheckInterval);
      clearTimeout(absoluteTimeout);
      reject(err);
    });
  });
}

async function main() {
  console.log(`${colors.bright}🤖 REAL Claude CLI Streaming Events Demo${colors.reset}\n`);
  console.log(`${colors.dim}Using actual Claude CLI with --output-format=stream-json${colors.reset}\n`);

  const prompt = 'Say "Hello, I am Claude!" in exactly those words and nothing else.';
  console.log(`${colors.dim}Prompt: "${prompt}"${colors.reset}\n`);
  console.log(`${colors.bright}Events:${colors.reset}`);

  // Collect streaming content
  let streamedContent = '';

  try {
    const result = await runClaudeWithStreaming(prompt, (event) => {
      console.log(formatEvent(event));
      
      if (event.type === 'text_delta') {
        streamedContent += event.data.content;
        process.stdout.write(`${colors.dim}  → Accumulated: "${streamedContent}"${colors.reset}\n`);
      }
    });

    console.log(`\n${colors.bright}Final Result:${colors.reset}`);
    console.log(`  Session ID: ${result.sessionId}`);
    console.log(`  Output: "${result.output}"`);
    console.log(`  Streamed: "${streamedContent}"`);
    process.exit(0);

  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.error(`\n${colors.red}✗ Claude CLI not found${colors.reset}`);
      console.log(`\n${colors.yellow}Install Claude CLI:${colors.reset}`);
      console.log(`  npm install -g @anthropic-ai/claude-code`);
    } else {
      console.error(`\n${colors.red}Error:${colors.reset}`, error.message);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
