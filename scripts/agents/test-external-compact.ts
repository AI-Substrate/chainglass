/**
 * test-external-compact.ts
 *
 * Test whether we can trigger /compact from an external caller in:
 * 1. Claude Code
 * 2. GitHub Copilot CLI
 *
 * Strategy:
 * - Turn 1: Run a prompt that generates some context (e.g., "list files and describe the project")
 * - Turn 2: Send "/compact" as the prompt to see if it triggers compaction
 *
 * Run with: npx tsx scripts/agents/test-external-compact.ts
 */

import { spawn } from 'child_process';
import * as readline from 'readline';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

// ANSI colors
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

interface TestResult {
  agent: string;
  turn1SessionId: string | null;
  turn2Output: string;
  compactWorked: boolean;
  notes: string;
}

// ============================================================
// CLAUDE CODE
// ============================================================

interface ClaudeResult {
  output: string;
  sessionId: string | null;
  exitCode: number | null;
}

async function runClaudeCode(prompt: string, sessionId?: string): Promise<ClaudeResult> {
  const args = [
    '-p', prompt,
    '--verbose',
    '--output-format=stream-json',
    '--dangerously-skip-permissions',
  ];

  if (sessionId) {
    args.push('--fork-session', '--resume', sessionId);
  }

  console.log(`${C.dim}[claude] Running: claude ${args.slice(0, 4).join(' ')}...${C.reset}`);

  return new Promise((resolve) => {
    const child = spawn('claude', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let extractedSessionId: string | null = null;

    const rl = readline.createInterface({ input: child.stdout!, crlfDelay: Infinity });

    rl.on('line', (line) => {
      output += line + '\n';
      try {
        const msg = JSON.parse(line);
        if (msg.session_id && !extractedSessionId) {
          extractedSessionId = msg.session_id;
        }
        // Show assistant messages
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              console.log(`${C.green}[claude]${C.reset} ${block.text.substring(0, 200)}${block.text.length > 200 ? '...' : ''}`);
            }
          }
        }
        if (msg.type === 'result') {
          console.log(`${C.cyan}[claude]${C.reset} Result: ${msg.subtype}, cost: $${msg.total_cost_usd?.toFixed(4) || '?'}`);
        }
      } catch {
        // Not JSON
      }
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString();
      if (text.includes('error') || text.includes('Error')) {
        console.log(`${C.red}[claude stderr]${C.reset} ${text.trim()}`);
      }
    });

    child.on('close', (exitCode) => {
      rl.close();
      resolve({ output, sessionId: extractedSessionId, exitCode });
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      child.kill('SIGTERM');
    }, 120000);
  });
}

async function testClaudeCodeCompact(): Promise<TestResult> {
  console.log(`\n${C.bold}${C.cyan}=== Testing Claude Code /compact ===${C.reset}\n`);

  // Turn 1: Build some context
  console.log(`${C.yellow}[Turn 1]${C.reset} Building context...`);
  const turn1 = await runClaudeCode(
    'List the files in the current directory and give a brief 2-sentence description of what this project does.'
  );

  if (!turn1.sessionId) {
    return {
      agent: 'Claude Code',
      turn1SessionId: null,
      turn2Output: '',
      compactWorked: false,
      notes: 'Failed to get session ID from turn 1',
    };
  }

  console.log(`${C.green}[OK]${C.reset} Session ID: ${turn1.sessionId}\n`);

  // Turn 2: Try /compact
  console.log(`${C.yellow}[Turn 2]${C.reset} Sending /compact...`);
  const turn2 = await runClaudeCode('/compact', turn1.sessionId);

  // Analyze the output to see if compact worked
  const compactIndicators = [
    'compact', 'summariz', 'context', 'token', 'conversation',
    'trimmed', 'reduced', 'cleared'
  ];
  const outputLower = turn2.output.toLowerCase();
  const hasCompactIndicator = compactIndicators.some(ind => outputLower.includes(ind));

  // Check for errors or "unknown command" type responses
  const errorIndicators = ['unknown', 'invalid', 'not recognized', 'error'];
  const hasError = errorIndicators.some(ind => outputLower.includes(ind));

  return {
    agent: 'Claude Code',
    turn1SessionId: turn1.sessionId,
    turn2Output: turn2.output.substring(0, 1000),
    compactWorked: hasCompactIndicator && !hasError,
    notes: hasError ? 'Appears to have error/unknown command' :
           hasCompactIndicator ? 'Output mentions compact-related terms' :
           'No clear indication of compact behavior',
  };
}

// ============================================================
// GITHUB COPILOT
// ============================================================

interface CopilotResult {
  output: string;
  sessionId: string | null;
  exitCode: number | null;
}

async function createLogDir(): Promise<string> {
  const baseDir = path.join(os.tmpdir(), 'copilot_compact_test');
  const runId = randomUUID();
  const logDir = path.join(baseDir, runId);
  await fs.mkdir(logDir, { recursive: true });
  return logDir;
}

async function extractCopilotSessionId(logDir: string, timeoutMs: number = 30000): Promise<string | null> {
  const sessionRegex = /events to session ([0-9a-fA-F-]{36})/;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const files = await fs.readdir(logDir);
      for (const file of files.filter(f => f.endsWith('.log'))) {
        const content = await fs.readFile(path.join(logDir, file), 'utf-8');
        const match = content.match(sessionRegex);
        if (match) return match[1];
      }
    } catch { /* ignore */ }
    await new Promise(r => setTimeout(r, 200));
  }
  return null;
}

async function runCopilot(prompt: string, logDir: string, sessionId?: string, useStdin: boolean = false): Promise<CopilotResult> {
  const args = [
    '-y', '@github/copilot',
    '--no-color',
    '--yolo',
    '--log-level', 'debug',
    '--log-dir', logDir,
  ];

  // Use stdin for slash commands (like /compact), -p for regular prompts
  if (!useStdin) {
    args.push('-p', prompt);
  }

  if (sessionId) {
    args.push('--resume', sessionId);
  }

  console.log(`${C.dim}[copilot] Running: npx ${args.slice(0, 6).join(' ')}... ${useStdin ? '(stdin)' : '(-p)'}${C.reset}`);

  return new Promise((resolve) => {
    const child = spawn('npx', args, {
      cwd: process.cwd(),
      stdio: [useStdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });

    // Write to stdin if using stdin mode
    if (useStdin && child.stdin) {
      child.stdin.write(prompt + '\n');
      child.stdin.end();
    }

    let output = '';

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
      // Show first part of output
      if (output.length <= 500) {
        process.stdout.write(`${C.green}[copilot]${C.reset} ${text}`);
      }
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString();
      if (text.includes('error') || text.includes('Error')) {
        console.log(`${C.red}[copilot stderr]${C.reset} ${text.trim()}`);
      }
    });

    child.on('close', async (exitCode) => {
      const extractedSessionId = await extractCopilotSessionId(logDir, 10000);
      resolve({ output, sessionId: extractedSessionId, exitCode });
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      child.kill('SIGTERM');
    }, 120000);
  });
}

async function testCopilotCompact(): Promise<TestResult> {
  console.log(`\n${C.bold}${C.cyan}=== Testing GitHub Copilot /compact ===${C.reset}\n`);

  const logDir1 = await createLogDir();

  // Turn 1: Build some context
  console.log(`${C.yellow}[Turn 1]${C.reset} Building context...`);
  const turn1 = await runCopilot(
    'List the files in the current directory and give a brief 2-sentence description of what this project does.',
    logDir1
  );
  console.log(''); // newline after output

  if (!turn1.sessionId) {
    return {
      agent: 'GitHub Copilot',
      turn1SessionId: null,
      turn2Output: '',
      compactWorked: false,
      notes: 'Failed to get session ID from turn 1',
    };
  }

  console.log(`${C.green}[OK]${C.reset} Session ID: ${turn1.sessionId}\n`);

  const logDir2 = await createLogDir();

  // Turn 2: Try /compact via stdin (slash commands only work via stdin, not -p)
  console.log(`${C.yellow}[Turn 2]${C.reset} Sending /compact via stdin...`);
  const turn2 = await runCopilot('/compact', logDir2, turn1.sessionId, true); // useStdin=true
  console.log(''); // newline after output

  // Analyze the output
  const outputLower = turn2.output.toLowerCase();
  const compactIndicators = ['compact', 'summariz', 'context', 'token', 'conversation', 'trimmed', 'reduced'];
  const hasCompactIndicator = compactIndicators.some(ind => outputLower.includes(ind));

  const errorIndicators = ['unknown', 'invalid', 'not recognized', 'error', 'command not found'];
  const hasError = errorIndicators.some(ind => outputLower.includes(ind));

  return {
    agent: 'GitHub Copilot',
    turn1SessionId: turn1.sessionId,
    turn2Output: turn2.output.substring(0, 1000),
    compactWorked: hasCompactIndicator && !hasError,
    notes: hasError ? 'Appears to have error/unknown command' :
           hasCompactIndicator ? 'Output mentions compact-related terms' :
           'No clear indication of compact behavior',
  };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log(`${C.bold}╔════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║     Testing External /compact Command on Coding Agents     ║${C.reset}`);
  console.log(`${C.bold}╚════════════════════════════════════════════════════════════╝${C.reset}`);

  const results: TestResult[] = [];

  // Test Claude Code
  try {
    const claudeResult = await testClaudeCodeCompact();
    results.push(claudeResult);
  } catch (err) {
    console.error(`${C.red}[ERROR]${C.reset} Claude Code test failed:`, err);
    results.push({
      agent: 'Claude Code',
      turn1SessionId: null,
      turn2Output: '',
      compactWorked: false,
      notes: `Test error: ${err}`,
    });
  }

  // Test Copilot
  try {
    const copilotResult = await testCopilotCompact();
    results.push(copilotResult);
  } catch (err) {
    console.error(`${C.red}[ERROR]${C.reset} Copilot test failed:`, err);
    results.push({
      agent: 'GitHub Copilot',
      turn1SessionId: null,
      turn2Output: '',
      compactWorked: false,
      notes: `Test error: ${err}`,
    });
  }

  // Summary
  console.log(`\n${C.bold}╔════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}║                        RESULTS                             ║${C.reset}`);
  console.log(`${C.bold}╚════════════════════════════════════════════════════════════╝${C.reset}\n`);

  for (const result of results) {
    const status = result.compactWorked ? `${C.green}WORKED${C.reset}` : `${C.red}DID NOT WORK${C.reset}`;
    console.log(`${C.bold}${result.agent}:${C.reset} ${status}`);
    console.log(`  Session ID: ${result.turn1SessionId || 'N/A'}`);
    console.log(`  Notes: ${result.notes}`);
    console.log(`  Turn 2 Output Preview:`);
    console.log(`${C.dim}${result.turn2Output.substring(0, 300)}${result.turn2Output.length > 300 ? '...' : ''}${C.reset}`);
    console.log('');
  }

  // Write detailed results to file
  const resultsPath = path.join(process.cwd(), 'scripts/agents/compact-test-results.json');
  await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
  console.log(`${C.cyan}[INFO]${C.reset} Detailed results written to: ${resultsPath}`);
}

main().catch((err) => {
  console.error(`${C.red}[FATAL]${C.reset}`, err);
  process.exit(1);
});
