/**
 * test-model-tokens-claude.ts
 *
 * Test Claude Code CLI capabilities for:
 * 1. Seeing the selected model
 * 2. Changing the model at CLI time
 * 3. Seeing tokens used in the session
 * 4. Seeing tokens remaining (context window)
 *
 * Run with: npx tsx scripts/agents/test-model-tokens-claude.ts
 */

import { spawn } from 'child_process';
import * as readline from 'readline';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
}

interface ModelInfo {
  model: string | null;
  contextWindow: number | null;
}

interface ClaudeResult {
  sessionId: string | null;
  model: ModelInfo;
  tokenUsage: TokenUsage;
  cost: number | null;
  rawMessages: any[];
}

async function runClaudeCode(
  prompt: string,
  options: { model?: string; sessionId?: string } = {}
): Promise<ClaudeResult> {
  const args = [
    '-p', prompt,
    '--verbose',
    '--output-format=stream-json',
    '--dangerously-skip-permissions',
  ];

  if (options.model) {
    args.push('--model', options.model);
  }

  if (options.sessionId) {
    args.push('--fork-session', '--resume', options.sessionId);
  }

  console.log(`${C.dim}[CMD] claude ${args.slice(0, 6).join(' ')}...${C.reset}`);

  return new Promise((resolve) => {
    const child = spawn('claude', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let sessionId: string | null = null;
    let model: string | null = null;
    let contextWindow: number | null = null;
    let cost: number | null = null;
    const rawMessages: any[] = [];

    // Accumulate token usage across all messages
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheCreation = 0;
    let totalCacheRead = 0;

    const rl = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });

    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        rawMessages.push(msg);

        // Extract session ID
        if (msg.session_id && !sessionId) {
          sessionId = msg.session_id;
        }

        // Extract model from init message
        if (msg.type === 'system' && msg.subtype === 'init' && msg.model) {
          model = msg.model;
          console.log(`${C.cyan}[MODEL]${C.reset} ${msg.model}`);
        }

        // Extract token usage from message_delta or result
        if (msg.usage) {
          const u = msg.usage;
          if (u.input_tokens) totalInputTokens = u.input_tokens;
          if (u.output_tokens) totalOutputTokens = u.output_tokens;
          if (u.cache_creation_input_tokens) totalCacheCreation = u.cache_creation_input_tokens;
          if (u.cache_read_input_tokens) totalCacheRead = u.cache_read_input_tokens;
        }

        // Check for model usage info (context window)
        if (msg.model_usage) {
          for (const [modelName, usage] of Object.entries(msg.model_usage as Record<string, any>)) {
            if (usage.context_window) {
              contextWindow = usage.context_window;
              console.log(`${C.blue}[CONTEXT_WINDOW]${C.reset} ${modelName}: ${usage.context_window.toLocaleString()} tokens`);
            }
          }
        }

        // Result message often has final stats
        if (msg.type === 'result') {
          if (msg.total_cost_usd) {
            cost = msg.total_cost_usd;
          }
          console.log(`${C.magenta}[RESULT]${C.reset} ${msg.subtype || ''}`);
        }

        // Show assistant text (truncated)
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              const preview = block.text.substring(0, 100);
              console.log(`${C.green}[ASSISTANT]${C.reset} ${preview}${block.text.length > 100 ? '...' : ''}`);
            }
          }
        }

      } catch {
        // Not JSON
      }
    });

    child.on('close', () => {
      rl.close();
      resolve({
        sessionId,
        model: { model, contextWindow },
        tokenUsage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheCreationInputTokens: totalCacheCreation,
          cacheReadInputTokens: totalCacheRead,
          totalTokens: totalInputTokens + totalOutputTokens,
        },
        cost,
        rawMessages,
      });
    });

    // Timeout after 2 minutes
    setTimeout(() => child.kill('SIGTERM'), 120000);
  });
}

async function main() {
  console.log(`\n${C.bold}╔════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║    Claude Code: Model Selection & Token Tracking Test      ║${C.reset}`);
  console.log(`${C.bold}╚════════════════════════════════════════════════════════════╝${C.reset}\n`);

  // Test 1: Default model
  console.log(`${C.bold}┌─ TEST 1: Default Model ─────────────────────────────────────┐${C.reset}\n`);
  const test1 = await runClaudeCode('What is 2+2? Just answer with the number.');

  console.log(`\n${C.yellow}Results:${C.reset}`);
  console.log(`  Session ID: ${test1.sessionId}`);
  console.log(`  Model: ${test1.model.model || 'NOT FOUND IN OUTPUT'}`);
  console.log(`  Context Window: ${test1.model.contextWindow?.toLocaleString() || 'NOT FOUND'}`);
  console.log(`  Input Tokens: ${test1.tokenUsage.inputTokens}`);
  console.log(`  Output Tokens: ${test1.tokenUsage.outputTokens}`);
  console.log(`  Cache Creation: ${test1.tokenUsage.cacheCreationInputTokens}`);
  console.log(`  Cache Read: ${test1.tokenUsage.cacheReadInputTokens}`);
  console.log(`  Total Tokens: ${test1.tokenUsage.totalTokens}`);
  console.log(`  Cost: $${test1.cost?.toFixed(6) || 'N/A'}`);

  // Test 2: Specify a different model (haiku for speed/cost)
  console.log(`\n${C.bold}┌─ TEST 2: Specify Model (haiku) ─────────────────────────────┐${C.reset}\n`);
  const test2 = await runClaudeCode('What is 3+3? Just answer with the number.', { model: 'haiku' });

  console.log(`\n${C.yellow}Results:${C.reset}`);
  console.log(`  Session ID: ${test2.sessionId}`);
  console.log(`  Model: ${test2.model.model || 'NOT FOUND IN OUTPUT'}`);
  console.log(`  Context Window: ${test2.model.contextWindow?.toLocaleString() || 'NOT FOUND'}`);
  console.log(`  Input Tokens: ${test2.tokenUsage.inputTokens}`);
  console.log(`  Output Tokens: ${test2.tokenUsage.outputTokens}`);
  console.log(`  Total Tokens: ${test2.tokenUsage.totalTokens}`);
  console.log(`  Cost: $${test2.cost?.toFixed(6) || 'N/A'}`);

  // Test 3: Multi-turn to see accumulated tokens
  console.log(`\n${C.bold}┌─ TEST 3: Multi-turn Token Accumulation ─────────────────────┐${C.reset}\n`);
  const turn1 = await runClaudeCode('Remember the number 42. Just say OK.', { model: 'haiku' });
  console.log(`\n${C.dim}Turn 1 tokens: ${turn1.tokenUsage.totalTokens}${C.reset}`);

  if (turn1.sessionId) {
    const turn2 = await runClaudeCode('What number did I ask you to remember?', {
      model: 'haiku',
      sessionId: turn1.sessionId,
    });
    console.log(`\n${C.yellow}Results (Turn 2):${C.reset}`);
    console.log(`  Input Tokens: ${turn2.tokenUsage.inputTokens}`);
    console.log(`  Output Tokens: ${turn2.tokenUsage.outputTokens}`);
    console.log(`  Total Tokens: ${turn2.tokenUsage.totalTokens}`);

    if (turn2.model.contextWindow) {
      const remaining = turn2.model.contextWindow - turn2.tokenUsage.inputTokens;
      console.log(`  Context Window: ${turn2.model.contextWindow.toLocaleString()}`);
      console.log(`  ${C.green}Tokens Remaining: ${remaining.toLocaleString()}${C.reset}`);
    }
  }

  // Summary
  console.log(`\n${C.bold}╔════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║                        SUMMARY                             ║${C.reset}`);
  console.log(`${C.bold}╚════════════════════════════════════════════════════════════╝${C.reset}\n`);

  console.log(`${C.cyan}Model Selection:${C.reset}`);
  console.log(`  --model flag: ${test2.model.model ? '✅ WORKS' : '❌ Model not in output'}`);
  console.log(`  Model visible in output: ${test1.model.model ? '✅ YES' : '❌ NO'}`);

  console.log(`\n${C.cyan}Token Tracking:${C.reset}`);
  console.log(`  Input tokens: ${test1.tokenUsage.inputTokens > 0 ? '✅ Available' : '❌ Not found'}`);
  console.log(`  Output tokens: ${test1.tokenUsage.outputTokens > 0 ? '✅ Available' : '❌ Not found'}`);
  console.log(`  Cache tokens: ${test1.tokenUsage.cacheCreationInputTokens > 0 || test1.tokenUsage.cacheReadInputTokens > 0 ? '✅ Available' : '⚠️ Zero or not used'}`);

  console.log(`\n${C.cyan}Context Window:${C.reset}`);
  console.log(`  Context limit visible: ${test1.model.contextWindow ? '✅ YES' : '❌ NO'}`);

  // Write raw messages for inspection
  const fs = await import('fs/promises');
  const resultsPath = '/Users/jordanknight/substrate/chainglass/scripts/agents/claude-model-tokens-results.json';
  await fs.writeFile(resultsPath, JSON.stringify({
    test1: { model: test1.model, tokens: test1.tokenUsage, cost: test1.cost },
    test2: { model: test2.model, tokens: test2.tokenUsage, cost: test2.cost },
    rawMessagesTest1: test1.rawMessages,
  }, null, 2));
  console.log(`\n${C.dim}Raw results saved to: ${resultsPath}${C.reset}`);
}

main().catch((err) => {
  console.error(`${C.red}[FATAL]${C.reset}`, err);
  process.exit(1);
});
