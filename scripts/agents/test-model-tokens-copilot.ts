/**
 * test-model-tokens-copilot.ts
 *
 * Test GitHub Copilot CLI capabilities for:
 * 1. Seeing the selected model
 * 2. Changing the model at CLI time
 * 3. Seeing tokens used in the session
 * 4. Seeing tokens remaining (context window)
 *
 * Run with: npx tsx scripts/agents/test-model-tokens-copilot.ts
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

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

interface CopilotResult {
  output: string;
  sessionId: string | null;
  exitCode: number | null;
  logContents: string;
}

async function createLogDir(): Promise<string> {
  const baseDir = path.join(os.tmpdir(), 'copilot_model_test');
  const runId = randomUUID();
  const logDir = path.join(baseDir, runId);
  await fs.mkdir(logDir, { recursive: true });
  return logDir;
}

async function extractSessionId(logDir: string): Promise<string | null> {
  const sessionRegex = /events to session ([0-9a-fA-F-]{36})/;
  try {
    const files = await fs.readdir(logDir);
    for (const file of files.filter(f => f.endsWith('.log'))) {
      const content = await fs.readFile(path.join(logDir, file), 'utf-8');
      const match = content.match(sessionRegex);
      if (match) return match[1];
    }
  } catch { /* ignore */ }
  return null;
}

async function readAllLogs(logDir: string): Promise<string> {
  let combined = '';
  try {
    const files = await fs.readdir(logDir);
    for (const file of files.filter(f => f.endsWith('.log'))) {
      const content = await fs.readFile(path.join(logDir, file), 'utf-8');
      combined += `\n=== ${file} ===\n${content}`;
    }
  } catch { /* ignore */ }
  return combined;
}

async function runCopilot(
  prompt: string,
  options: { model?: string; sessionId?: string; logDir?: string } = {}
): Promise<CopilotResult> {
  const logDir = options.logDir || await createLogDir();

  const args = [
    '-y', '@github/copilot',
    '--no-color',
    '--yolo',
    '--log-level', 'debug',
    '--log-dir', logDir,
    '-p', prompt,
  ];

  if (options.model) {
    args.push('--model', options.model);
  }

  if (options.sessionId) {
    args.push('--resume', options.sessionId);
  }

  console.log(`${C.dim}[CMD] npx ${args.slice(0, 8).join(' ')}...${C.reset}`);

  return new Promise((resolve) => {
    const child = spawn('npx', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      // Show output as it comes
      if (output.length <= 500) {
        process.stdout.write(`${C.green}[COPILOT]${C.reset} ${text}`);
      }
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString();
      // Show errors
      if (text.toLowerCase().includes('error')) {
        console.log(`${C.red}[STDERR]${C.reset} ${text.trim()}`);
      }
    });

    child.on('close', async (exitCode) => {
      // Wait a moment for logs to flush
      await new Promise(r => setTimeout(r, 500));

      const sessionId = await extractSessionId(logDir);
      const logContents = await readAllLogs(logDir);

      resolve({ output, sessionId, exitCode, logContents });
    });

    // Timeout after 2 minutes
    setTimeout(() => child.kill('SIGTERM'), 120000);
  });
}

function searchLogsFor(logs: string, patterns: string[]): Map<string, string[]> {
  const results = new Map<string, string[]>();
  const lines = logs.split('\n');

  for (const pattern of patterns) {
    const matches: string[] = [];
    for (const line of lines) {
      if (line.toLowerCase().includes(pattern.toLowerCase())) {
        matches.push(line.trim().substring(0, 200));
      }
    }
    results.set(pattern, matches);
  }

  return results;
}

async function main() {
  console.log(`\n${C.bold}╔════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║   GitHub Copilot: Model Selection & Token Tracking Test    ║${C.reset}`);
  console.log(`${C.bold}╚════════════════════════════════════════════════════════════╝${C.reset}\n`);

  // Test 1: Default model
  console.log(`${C.bold}┌─ TEST 1: Default Model ─────────────────────────────────────┐${C.reset}\n`);
  const test1 = await runCopilot('What is 2+2? Just answer with the number.');

  console.log(`\n${C.yellow}Results:${C.reset}`);
  console.log(`  Session ID: ${test1.sessionId}`);
  console.log(`  Exit Code: ${test1.exitCode}`);
  console.log(`  Output: ${test1.output.trim().substring(0, 100)}`);

  // Search logs for model/token info
  const searchTerms = ['model', 'token', 'context', 'usage', 'limit', 'window', 'gpt', 'claude', 'gemini'];
  const found1 = searchLogsFor(test1.logContents, searchTerms);

  console.log(`\n${C.cyan}Log Analysis:${C.reset}`);
  for (const [term, matches] of found1) {
    if (matches.length > 0) {
      console.log(`  ${C.bold}${term}:${C.reset} ${matches.length} matches`);
      for (const match of matches.slice(0, 2)) {
        console.log(`    ${C.dim}${match}${C.reset}`);
      }
    }
  }

  // Test 2: Specify a model
  console.log(`\n${C.bold}┌─ TEST 2: Specify Model (gpt-4.1) ──────────────────────────┐${C.reset}\n`);
  const test2 = await runCopilot('What is 3+3? Just answer with the number.', { model: 'gpt-4.1' });

  console.log(`\n${C.yellow}Results:${C.reset}`);
  console.log(`  Session ID: ${test2.sessionId}`);
  console.log(`  Exit Code: ${test2.exitCode}`);
  console.log(`  Output: ${test2.output.trim().substring(0, 100)}`);

  const found2 = searchLogsFor(test2.logContents, searchTerms);
  console.log(`\n${C.cyan}Log Analysis:${C.reset}`);
  for (const [term, matches] of found2) {
    if (matches.length > 0) {
      console.log(`  ${C.bold}${term}:${C.reset} ${matches.length} matches`);
      for (const match of matches.slice(0, 2)) {
        console.log(`    ${C.dim}${match}${C.reset}`);
      }
    }
  }

  // Test 3: Try claude model via copilot
  console.log(`\n${C.bold}┌─ TEST 3: Specify Model (claude-sonnet-4) ───────────────────┐${C.reset}\n`);
  const test3 = await runCopilot('What is 4+4? Just answer with the number.', { model: 'claude-sonnet-4' });

  console.log(`\n${C.yellow}Results:${C.reset}`);
  console.log(`  Session ID: ${test3.sessionId}`);
  console.log(`  Exit Code: ${test3.exitCode}`);
  console.log(`  Output: ${test3.output.trim().substring(0, 100)}`);

  // Test 4: Multi-turn
  console.log(`\n${C.bold}┌─ TEST 4: Multi-turn ────────────────────────────────────────┐${C.reset}\n`);
  const turn1 = await runCopilot('Remember the number 99. Just say OK.');

  if (turn1.sessionId) {
    console.log(`\n${C.dim}Turn 1 complete, session: ${turn1.sessionId}${C.reset}\n`);

    const turn2 = await runCopilot('What number did I ask you to remember?', {
      sessionId: turn1.sessionId,
    });

    console.log(`\n${C.yellow}Turn 2 Results:${C.reset}`);
    console.log(`  Output: ${turn2.output.trim()}`);

    // Check if turn 2 logs have more token info
    const found4 = searchLogsFor(turn2.logContents, ['token', 'usage', 'context']);
    for (const [term, matches] of found4) {
      if (matches.length > 0) {
        console.log(`  ${term}: ${matches.length} log entries`);
      }
    }
  }

  // Summary
  console.log(`\n${C.bold}╔════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║                        SUMMARY                             ║${C.reset}`);
  console.log(`${C.bold}╚════════════════════════════════════════════════════════════╝${C.reset}\n`);

  console.log(`${C.cyan}Model Selection:${C.reset}`);
  console.log(`  --model flag: ${test2.exitCode === 0 ? '✅ Accepted' : '❌ Failed'}`);
  console.log(`  Model visible in stdout: ❓ Check output`);
  console.log(`  Model visible in logs: ${found2.get('model')?.length || 0 > 0 ? '✅ YES' : '❌ NO'}`);

  console.log(`\n${C.cyan}Token Tracking:${C.reset}`);
  const tokenMatches = found1.get('token')?.length || 0;
  console.log(`  Token info in stdout: ❌ Not in stdout (Copilot doesn't output JSON)`);
  console.log(`  Token info in logs: ${tokenMatches > 0 ? '✅ ' + tokenMatches + ' mentions' : '❌ Not found'}`);

  console.log(`\n${C.cyan}Context Window:${C.reset}`);
  const contextMatches = found1.get('context')?.length || 0;
  console.log(`  Context limit in logs: ${contextMatches > 0 ? '⚠️ ' + contextMatches + ' mentions (may not be token limit)' : '❌ Not found'}`);

  // Save logs for inspection
  const resultsPath = '/Users/jordanknight/substrate/chainglass/scripts/agents/copilot-model-tokens-results.json';
  await fs.writeFile(resultsPath, JSON.stringify({
    test1: { sessionId: test1.sessionId, output: test1.output },
    test2: { sessionId: test2.sessionId, output: test2.output },
    test3: { sessionId: test3.sessionId, output: test3.output },
    logSample: test1.logContents.substring(0, 5000),
  }, null, 2));
  console.log(`\n${C.dim}Results saved to: ${resultsPath}${C.reset}`);

  // Save full logs separately for deep inspection
  const logsPath = '/Users/jordanknight/substrate/chainglass/scripts/agents/copilot-full-logs.txt';
  await fs.writeFile(logsPath, `=== TEST 1 LOGS ===\n${test1.logContents}\n\n=== TEST 2 LOGS ===\n${test2.logContents}`);
  console.log(`${C.dim}Full logs saved to: ${logsPath}${C.reset}`);
}

main().catch((err) => {
  console.error(`${C.red}[FATAL]${C.reset}`, err);
  process.exit(1);
});
