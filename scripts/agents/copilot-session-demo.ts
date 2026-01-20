/**
 * copilot-session-demo.ts
 *
 * TypeScript demonstration of running GitHub Copilot CLI with:
 * 1. An initial prompt
 * 2. Waiting for completion (process exit)
 * 3. Extracting session ID from log files
 * 4. Running a follow-up prompt in the same session
 *
 * Based on Vibe Kanban's copilot.rs implementation patterns.
 *
 * Run with: npx tsx scripts/agents/copilot-session-demo.ts [working_dir]
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

// Configuration
const COPILOT_PACKAGE = '@github/copilot'; // Use latest version
const POLL_INTERVAL_MS = 200;
const SESSION_TIMEOUT_MS = 60_000;
const PROCESS_TIMEOUT_MS = 120_000; // 2 minutes max per run

interface CopilotResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  sessionId: string | null;
  logDir: string;
  timedOut: boolean;
}

interface CopilotOptions {
  workingDir?: string;
  sessionId?: string; // For resume
  logDir?: string;
  allowAllTools?: boolean; // Defaults to true for scripted usage
  timeoutMs?: number;
}

/**
 * Create a unique log directory for this run
 */
async function createLogDir(): Promise<string> {
  const baseDir = path.join(os.tmpdir(), 'copilot_session_demo');
  const runId = randomUUID();
  const logDir = path.join(baseDir, runId);
  await fs.mkdir(logDir, { recursive: true });
  return logDir;
}

/**
 * Extract session ID from log files (Vibe Kanban pattern)
 * Polls log directory for files containing "events to session <UUID>"
 */
async function extractSessionId(
  logDir: string,
  timeoutMs: number = SESSION_TIMEOUT_MS
): Promise<string | null> {
  const startTime = Date.now();
  const sessionRegex = /events to session ([0-9a-fA-F-]{36})/;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const files = await fs.readdir(logDir);
      const logFiles = files.filter((f) => f.endsWith('.log'));

      for (const logFile of logFiles) {
        const content = await fs.readFile(path.join(logDir, logFile), 'utf-8');
        const match = content.match(sessionRegex);
        if (match && match[1]) {
          return match[1];
        }
      }
    } catch {
      // Directory may not exist yet or be empty
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return null;
}

/**
 * Run Copilot with a prompt and stream output in real-time
 */
async function runCopilot(prompt: string, options: CopilotOptions = {}): Promise<CopilotResult> {
  const logDir = options.logDir || (await createLogDir());
  const workingDir = options.workingDir || process.cwd();
  const timeoutMs = options.timeoutMs || PROCESS_TIMEOUT_MS;

  const args = [
    '-y',
    COPILOT_PACKAGE,
    '--no-color',
    '--log-level',
    'debug',
    '--log-dir',
    logDir,
  ];

  // Add resume flag if session ID provided
  if (options.sessionId) {
    args.push('--resume', options.sessionId);
  }

  // Use --yolo for full non-interactive mode (all permissions)
  args.push('--yolo');

  // Use -p for non-interactive prompt (cleaner than stdin)
  args.push('-p', prompt);

  // Show command being run
  console.log(`\x1b[36m[CMD]\x1b[0m npx ${args.join(' ')}`);
  console.log(`\x1b[36m[CWD]\x1b[0m ${workingDir}`);
  console.log(`\x1b[36m[PROMPT]\x1b[0m ${prompt}`);
  console.log(`\x1b[36m[LOG_DIR]\x1b[0m ${logDir}`);
  console.log('');
  console.log('\x1b[33m--- Agent Output ---\x1b[0m');

  return new Promise((resolve) => {
    const child = spawn('npx', args, {
      cwd: workingDir,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],  // No stdin needed with -p flag
    });

    let stdout = '';
    let stderr = '';
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
          console.log(`\x1b[31m[TIMEOUT]\x1b[0m No output for ${timeoutMs / 1000}s, killing process...`);
          child.kill('SIGTERM');
          setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
          }, 2000);
        }
      }
    }, 1000);

    // Stream stdout in real-time
    child.stdout?.on('data', (data) => {
      lastOutputTime = Date.now();
      const text = data.toString();
      stdout += text;
      // Write each character immediately for real-time display
      process.stdout.write(text);
    });

    // Stream stderr in real-time (often contains progress info)
    child.stderr?.on('data', (data) => {
      lastOutputTime = Date.now();
      const text = data.toString();
      stderr += text;
      // Show stderr in dim color to distinguish from stdout
      process.stderr.write(`\x1b[2m${text}\x1b[0m`);
    });

    child.on('close', async (exitCode) => {
      if (resolved) return;
      resolved = true;
      clearInterval(timeoutCheck);

      console.log('');
      console.log('\x1b[33m--- End Agent Output ---\x1b[0m');
      console.log('');

      if (exitCode === 0) {
        console.log(`\x1b[32m[OK]\x1b[0m Copilot completed (exit code: ${exitCode})`);
      } else {
        console.log(`\x1b[31m[WARN]\x1b[0m Copilot exited with code: ${exitCode}`);
      }

      // Extract session ID from logs
      console.log(`\x1b[36m[INFO]\x1b[0m Extracting session ID from logs...`);
      const sessionId = await extractSessionId(logDir, 10_000);

      if (sessionId) {
        console.log(`\x1b[32m[OK]\x1b[0m Session ID: ${sessionId}`);
      } else {
        console.log(`\x1b[31m[WARN]\x1b[0m Could not extract session ID`);
      }

      resolve({
        stdout,
        stderr,
        exitCode,
        sessionId,
        logDir,
        timedOut: false,
      });
    });

    child.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      clearInterval(timeoutCheck);

      console.error(`\x1b[31m[ERROR]\x1b[0m Failed to spawn Copilot: ${error.message}`);
      resolve({
        stdout,
        stderr,
        exitCode: -1,
        sessionId: null,
        logDir,
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
  console.log('\x1b[1m╔════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m║       GitHub Copilot CLI Session Demo (TypeScript)         ║\x1b[0m');
  console.log('\x1b[1m╚════════════════════════════════════════════════════════════╝\x1b[0m');
  console.log('');

  // === FIRST PROMPT ===
  console.log('\x1b[1m┌──────────────────────────────────────────────────────────────┐\x1b[0m');
  console.log('\x1b[1m│ STEP 1: Initial Prompt                                       │\x1b[0m');
  console.log('\x1b[1m└──────────────────────────────────────────────────────────────┘\x1b[0m');
  console.log('');

  const result1 = await runCopilot(
    'Write a short 4-line poem about a cat.',
    { workingDir, timeoutMs: 60_000 }
  );

  if (!result1.sessionId) {
    console.error('');
    console.error('\x1b[31m[ERROR]\x1b[0m Failed to extract session ID from first run');
    console.log(`\x1b[36m[INFO]\x1b[0m Check log files in: ${result1.logDir}`);

    // List log files for debugging
    try {
      const files = await fs.readdir(result1.logDir);
      console.log(`\x1b[36m[INFO]\x1b[0m Log files: ${files.join(', ') || '(none)'}`);
    } catch {
      console.log(`\x1b[36m[INFO]\x1b[0m Could not read log directory`);
    }

    process.exit(1);
  }

  console.log('');
  console.log('\x1b[1m┌──────────────────────────────────────────────────────────────┐\x1b[0m');
  console.log('\x1b[1m│ STEP 2: Follow-up Prompt (Same Session)                      │\x1b[0m');
  console.log('\x1b[1m└──────────────────────────────────────────────────────────────┘\x1b[0m');
  console.log('');
  console.log(`\x1b[36m[INFO]\x1b[0m Resuming session: ${result1.sessionId}`);
  console.log('');

  const result2 = await runCopilot(
    'Now write a haiku about the same subject as the poem you just wrote.',
    {
      workingDir,
      sessionId: result1.sessionId,
      timeoutMs: 60_000,
    }
  );

  console.log('');
  console.log('\x1b[1m╔════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m║                      Demo Complete                         ║\x1b[0m');
  console.log('\x1b[1m╚════════════════════════════════════════════════════════════╝\x1b[0m');
  console.log('');
  console.log('\x1b[32m[OK]\x1b[0m Successfully demonstrated:');
  console.log('  1. Running Copilot with initial prompt');
  console.log('  2. Extracting session ID from log files');
  console.log('  3. Resuming session with --resume flag');
  console.log('');
  console.log(`\x1b[36m[INFO]\x1b[0m Session ID: ${result1.sessionId}`);
  console.log(`\x1b[36m[INFO]\x1b[0m Log directories:`);
  console.log(`  - Initial: ${result1.logDir}`);
  console.log(`  - Follow-up: ${result2.logDir}`);
}

// Export for use as a module
export {
  runCopilot,
  extractSessionId,
  createLogDir,
  CopilotResult,
  CopilotOptions,
};

// Run main if executed directly
main().catch((err) => {
  console.error('\x1b[31m[FATAL]\x1b[0m', err);
  process.exit(1);
});
