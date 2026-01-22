import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
/**
 * web command - Start the Chainglass web interface
 *
 * This command starts the production web server from bundled standalone assets.
 * Assets are located relative to the CLI binary using import.meta.dirname.
 *
 * Critical Insight #3: Assets must be found via import.meta.dirname (relative to CLI binary),
 * NOT process.cwd() (which varies based on where user runs the command).
 *
 * Critical Insight #4: SIGINT must be forwarded to child server for clean shutdown.
 */
import type { Command } from 'commander';

interface WebCommandOptions {
  port: number;
}

/**
 * Find the bundled standalone assets directory.
 *
 * Per Critical Insight #3: Uses __dirname (CJS) or import.meta.dirname (ESM)
 * to locate assets relative to the CLI binary, ensuring npx portability.
 *
 * @returns Path to the bundled standalone web assets
 */
export function findStandaloneAssets(): string {
  // Get the directory containing this module
  // CJS: __dirname is defined
  // ESM: use import.meta.dirname or fileURLToPath
  let currentDir: string;

  // Check for CJS __dirname first (available when bundled with esbuild as CJS)
  // Note: __dirname is available in Node.js CJS modules and is declared in @types/node
  if (typeof __dirname !== 'undefined') {
    currentDir = __dirname;
  } else if (typeof import.meta.dirname !== 'undefined') {
    currentDir = import.meta.dirname;
  } else {
    currentDir = dirname(fileURLToPath(import.meta.url));
  }

  // Assets are bundled at web/ relative to CLI dist/ directory
  // In bundled output: dist/cli.cjs -> dist/web/standalone/apps/web
  const assetsPath = resolve(currentDir, 'web', 'standalone', 'apps', 'web');

  return assetsPath;
}

/**
 * Validate that standalone assets exist at the given path.
 *
 * @param assetsPath - Path to validate
 * @throws Error if assets are not found
 */
export function validateStandaloneAssets(assetsPath: string): void {
  if (!existsSync(assetsPath)) {
    throw new Error(
      `Standalone assets not found at ${assetsPath}. Run 'just build' to build the CLI with bundled web assets.`
    );
  }

  const serverPath = resolve(assetsPath, 'server.js');
  if (!existsSync(serverPath)) {
    throw new Error(
      `Server entry point not found at ${serverPath}. The standalone build may be incomplete.`
    );
  }
}

/**
 * Register the web command with the Commander program.
 */
export function registerWebCommand(program: Command): void {
  program
    .command('web')
    .description('Start the Chainglass web interface')
    .option('-p, --port <number>', 'Port to listen on', '3000')
    .action(async (options: WebCommandOptions) => {
      await runWebCommand(options);
    });
}

/**
 * Execute the web command.
 * Starts the production server from bundled standalone assets.
 *
 * Per Invariant #7: Shows first-run feedback message.
 * Per Critical Insight #4: Forwards SIGINT to child server.
 */
export async function runWebCommand(options: WebCommandOptions): Promise<void> {
  const port = Number.parseInt(String(options.port), 10);

  // FIX-001: Validate port range (1-65535)
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${options.port}. Port must be a number between 1 and 65535.`);
  }

  console.log(chalk.cyan(`Chainglass starting on http://localhost:${port}...`));

  // Find bundled standalone assets
  const assetsPath = findStandaloneAssets();

  // Check if assets exist (in production bundle)
  // If not, show helpful message for development
  if (!existsSync(assetsPath)) {
    console.log(
      chalk.yellow('Standalone assets not found. In development, use `just dev` instead.')
    );
    console.log(chalk.gray(`Looking for assets at: ${assetsPath}`));
    console.log(chalk.gray('Run `just build` to create the production bundle.'));
    return;
  }

  // Validate assets are complete
  try {
    validateStandaloneAssets(assetsPath);
  } catch (error) {
    console.log(chalk.red((error as Error).message));
    return;
  }

  // Start the Next.js standalone server
  const serverPath = resolve(assetsPath, 'server.js');
  let server: ChildProcess;

  // FIX-004: Wrap spawn in try/catch for synchronous errors
  try {
    server = spawn('node', [serverPath], {
      cwd: assetsPath,
      // FIX-002: Allowlist safe environment variables only
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        PATH: process.env.PATH, // Required for node execution
        PORT: String(port),
        HOSTNAME: '0.0.0.0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    console.error(chalk.red(`Failed to start server: ${(error as Error).message}`));
    process.exit(1);
  }

  // Forward server stdout
  server.stdout?.on('data', (data: Buffer) => {
    const output = data.toString().trim();
    if (output) {
      // FIX-006: Case-insensitive ready detection
      const lowerOutput = output.toLowerCase();
      if (
        lowerOutput.includes('ready') ||
        lowerOutput.includes('started') ||
        lowerOutput.includes('listening')
      ) {
        console.log(chalk.green('✓ Ready'));
      } else {
        console.log(output);
      }
    }
  });

  // Forward server stderr
  server.stderr?.on('data', (data: Buffer) => {
    const output = data.toString().trim();
    if (output) {
      console.error(chalk.red(output));
    }
  });

  // Critical Insight #4: Forward SIGINT to child server for clean shutdown
  // FIX-003: Use once() to prevent handler accumulation on multiple invocations
  process.once('SIGINT', () => {
    console.log(chalk.yellow('\nShutting down...'));
    server.kill('SIGINT');
  });

  process.once('SIGTERM', () => {
    server.kill('SIGTERM');
  });

  // FIX-007: Exit when server exits, logging non-zero codes
  server.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(chalk.red(`Server exited with code ${code}`));
    }
    process.exit(code ?? 0);
  });

  // Handle server errors
  server.on('error', (error) => {
    console.error(chalk.red(`Server error: ${error.message}`));
    process.exit(1);
  });
}
