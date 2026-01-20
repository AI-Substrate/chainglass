/**
 * claude-code-session-demo.ts
 *
 * TypeScript demonstration of running Claude Code CLI with:
 * 1. An initial prompt
 * 2. Streaming NDJSON output with real-time display
 * 3. Extracting session ID from stream-json output
 * 4. Running a follow-up prompt in the same session
 *
 * Run with: npx tsx scripts/agents/claude-code-session-demo.ts [working_dir]
 */

import { spawn } from 'child_process';
import * as readline from 'readline';

// Configuration
const PROCESS_TIMEOUT_MS = 120_000; // 2 minutes max per run

// ANSI color codes
const COLORS = {
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

interface ClaudeCodeResult {
  stdout: string;
  exitCode: number | null;
  sessionId: string | null;
  timedOut: boolean;
  result?: string;
  cost?: number;
}

interface ClaudeCodeOptions {
  workingDir?: string;
  sessionId?: string; // For resume
  timeoutMs?: number;
  model?: string;
}

interface StreamMessage {
  type: string;
  subtype?: string;
  session_id?: string;
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  [key: string]: unknown;
}

/**
 * Format a stream-json message for display
 */
function formatMessage(msg: StreamMessage): string {
  const lines: string[] = [];

  switch (msg.type) {
    case 'system':
      if (msg.subtype === 'init') {
        lines.push(`${COLORS.cyan}[INIT]${COLORS.reset} Session: ${COLORS.bold}${msg.session_id}${COLORS.reset}`);
        lines.push(`${COLORS.dim}       Model: ${(msg as any).model || 'unknown'}${COLORS.reset}`);
      }
      break;

    case 'assistant':
      if (msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text) {
            // Show assistant text with nice formatting
            lines.push(`${COLORS.green}[ASSISTANT]${COLORS.reset}`);
            lines.push(block.text);
          } else if (block.type === 'tool_use') {
            const toolBlock = block as any;
            lines.push(`${COLORS.yellow}[TOOL_USE]${COLORS.reset} ${toolBlock.name || 'unknown'}`);
          }
        }
      }
      break;

    case 'tool_result':
      lines.push(`${COLORS.blue}[TOOL_RESULT]${COLORS.reset}`);
      break;

    case 'result':
      lines.push(`${COLORS.magenta}[RESULT]${COLORS.reset} ${msg.subtype || ''}`);
      if (msg.duration_ms) {
        lines.push(`${COLORS.dim}  Duration: ${msg.duration_ms}ms${COLORS.reset}`);
      }
      if (msg.total_cost_usd) {
        lines.push(`${COLORS.dim}  Cost: $${msg.total_cost_usd.toFixed(4)}${COLORS.reset}`);
      }
      break;

    default:
      // Show other message types dimmed
      lines.push(`${COLORS.dim}[${msg.type.toUpperCase()}]${COLORS.reset}`);
  }

  return lines.join('\n');
}

/**
 * Run Claude Code with a prompt and stream output in real-time
 */
async function runClaudeCode(prompt: string, options: ClaudeCodeOptions = {}): Promise<ClaudeCodeResult> {
  const workingDir = options.workingDir || process.cwd();
  const timeoutMs = options.timeoutMs || PROCESS_TIMEOUT_MS;

  const args = [
    '-p',
    prompt,
    '--verbose',
    '--output-format=stream-json',
    '--dangerously-skip-permissions',
  ];

  // Add model if specified
  if (options.model) {
    args.push('--model', options.model);
  }

  // Add resume flags if session ID provided
  if (options.sessionId) {
    args.push('--fork-session', '--resume', options.sessionId);
  }

  // Show command being run
  console.log(`${COLORS.cyan}[CMD]${COLORS.reset} claude ${args.join(' ')}`);
  console.log(`${COLORS.cyan}[CWD]${COLORS.reset} ${workingDir}`);
  console.log(`${COLORS.cyan}[PROMPT]${COLORS.reset} ${prompt}`);
  console.log('');
  console.log(`${COLORS.yellow}--- Claude Code Output ---${COLORS.reset}`);
  console.log('');

  return new Promise((resolve) => {
    const child = spawn('claude', args, {
      cwd: workingDir,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let sessionId: string | null = null;
    let result: string | undefined;
    let cost: number | undefined;
    let resolved = false;
    let lastOutputTime = Date.now();

    // Timeout handler
    const timeoutCheck = setInterval(() => {
      const timeSinceOutput = Date.now() - lastOutputTime;
      if (timeSinceOutput > timeoutMs) {
        if (!resolved) {
          resolved = true;
          clearInterval(timeoutCheck);
          console.log('');
          console.log(`${COLORS.red}[TIMEOUT]${COLORS.reset} No output for ${timeoutMs / 1000}s, killing process...`);
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 2000);
        }
      }
    }, 1000);

    // Create readline interface for line-by-line parsing
    const rl = readline.createInterface({
      input: child.stdout!,
      crlfDelay: Infinity,
    });

    rl.on('line', (line) => {
      lastOutputTime = Date.now();
      stdout += line + '\n';

      // Try to parse as JSON
      try {
        const msg: StreamMessage = JSON.parse(line);

        // Extract session ID from any message that has it
        if (msg.session_id && !sessionId) {
          sessionId = msg.session_id;
        }

        // Extract result and cost from result message
        if (msg.type === 'result') {
          result = msg.result;
          cost = msg.total_cost_usd;
        }

        // Format and display the message
        const formatted = formatMessage(msg);
        if (formatted) {
          console.log(formatted);
        }
      } catch {
        // Not JSON, print as-is
        console.log(line);
      }
    });

    // Stream stderr in real-time
    child.stderr?.on('data', (data) => {
      lastOutputTime = Date.now();
      const text = data.toString();
      process.stderr.write(`${COLORS.dim}${text}${COLORS.reset}`);
    });

    child.on('close', (exitCode) => {
      if (resolved) return;
      resolved = true;
      clearInterval(timeoutCheck);
      rl.close();

      console.log('');
      console.log(`${COLORS.yellow}--- End Claude Code Output ---${COLORS.reset}`);
      console.log('');

      if (exitCode === 0) {
        console.log(`${COLORS.green}[OK]${COLORS.reset} Claude Code completed (exit code: ${exitCode})`);
      } else {
        console.log(`${COLORS.red}[WARN]${COLORS.reset} Claude Code exited with code: ${exitCode}`);
      }

      if (sessionId) {
        console.log(`${COLORS.green}[OK]${COLORS.reset} Session ID: ${sessionId}`);
      } else {
        console.log(`${COLORS.red}[WARN]${COLORS.reset} Could not extract session ID`);
      }

      resolve({
        stdout,
        exitCode,
        sessionId,
        timedOut: false,
        result,
        cost,
      });
    });

    child.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      clearInterval(timeoutCheck);

      console.error(`${COLORS.red}[ERROR]${COLORS.reset} Failed to spawn Claude Code: ${error.message}`);
      resolve({
        stdout,
        exitCode: -1,
        sessionId: null,
        timedOut: false,
      });
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Main demo
async function main() {
  const workingDir = process.argv[2] || process.cwd();

  console.log('');
  console.log(`${COLORS.bold}╔════════════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.bold}║       Claude Code CLI Session Demo (TypeScript)            ║${COLORS.reset}`);
  console.log(`${COLORS.bold}╚════════════════════════════════════════════════════════════╝${COLORS.reset}`);
  console.log('');

  // === FIRST PROMPT ===
  console.log(`${COLORS.bold}┌──────────────────────────────────────────────────────────────┐${COLORS.reset}`);
  console.log(`${COLORS.bold}│ STEP 1: Initial Prompt                                       │${COLORS.reset}`);
  console.log(`${COLORS.bold}└──────────────────────────────────────────────────────────────┘${COLORS.reset}`);
  console.log('');

  const result1 = await runClaudeCode(
    'Write a short 4-line poem about a dog. Just output the poem, nothing else.',
    { workingDir, timeoutMs: 60_000 }
  );

  if (!result1.sessionId) {
    console.error('');
    console.error(`${COLORS.red}[ERROR]${COLORS.reset} Failed to extract session ID from first run`);
    process.exit(1);
  }

  console.log('');
  console.log(`${COLORS.bold}┌──────────────────────────────────────────────────────────────┐${COLORS.reset}`);
  console.log(`${COLORS.bold}│ STEP 2: Follow-up Prompt (Same Session)                      │${COLORS.reset}`);
  console.log(`${COLORS.bold}└──────────────────────────────────────────────────────────────┘${COLORS.reset}`);
  console.log('');
  console.log(`${COLORS.cyan}[INFO]${COLORS.reset} Resuming session: ${result1.sessionId}`);
  console.log('');

  const result2 = await runClaudeCode(
    'Now write a haiku about the same subject as the poem you just wrote. Just output the haiku, nothing else.',
    {
      workingDir,
      sessionId: result1.sessionId,
      timeoutMs: 60_000,
    }
  );

  console.log('');
  console.log(`${COLORS.bold}╔════════════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.bold}║                      Demo Complete                         ║${COLORS.reset}`);
  console.log(`${COLORS.bold}╚════════════════════════════════════════════════════════════╝${COLORS.reset}`);
  console.log('');
  console.log(`${COLORS.green}[OK]${COLORS.reset} Successfully demonstrated:`);
  console.log('  1. Running Claude Code with initial prompt');
  console.log('  2. Extracting session ID from stream-json output');
  console.log('  3. Resuming session with --fork-session --resume flag');
  console.log('');
  console.log(`${COLORS.cyan}[INFO]${COLORS.reset} Original Session ID: ${result1.sessionId}`);
  console.log(`${COLORS.cyan}[INFO]${COLORS.reset} Forked Session ID: ${result2.sessionId}`);
  console.log(`${COLORS.cyan}[INFO]${COLORS.reset} Total cost: $${((result1.cost || 0) + (result2.cost || 0)).toFixed(4)}`);
}

// Export for use as a module
export {
  runClaudeCode,
  ClaudeCodeResult,
  ClaudeCodeOptions,
};

// Run main if executed directly
main().catch((err) => {
  console.error(`${COLORS.red}[FATAL]${COLORS.reset}`, err);
  process.exit(1);
});
