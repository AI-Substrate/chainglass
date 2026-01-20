/**
 * mcp command - Start MCP server for AI agent integration
 *
 * CRITICAL: Per ADR-0001 IMP-001 and Critical Discovery 10:
 * stdout is reserved EXCLUSIVELY for JSON-RPC messages in stdio mode.
 * All logging must go to stderr. Console redirection MUST happen
 * BEFORE any dynamic imports to catch module-level side effects.
 */
import type { Command } from 'commander';

export interface McpCommandOptions {
  stdio: boolean;
}

/**
 * Register the mcp command with the Commander program.
 */
export function registerMcpCommand(program: Command): void {
  program
    .command('mcp')
    .description('Start MCP server for AI agent integration')
    .option('--stdio', 'Use stdio transport (for AI agents)')
    .addHelpText(
      'after',
      `
Examples:
  $ cg mcp                  Start MCP server (default transport)
  $ cg mcp --stdio          Start MCP server with stdio transport`
    )
    .action(async (options: McpCommandOptions) => {
      await runMcpCommand(options);
    });
}

/**
 * Execute the mcp command.
 *
 * CRITICAL: This function implements the lazy-loading pattern per CD-10:
 * 1. Redirect console BEFORE any imports (catches module side effects)
 * 2. Dynamic import MCP server (safe now that console is redirected)
 * 3. MCP server uses stderr-configured logger (defense in depth)
 */
export async function runMcpCommand(options: McpCommandOptions): Promise<void> {
  if (options.stdio) {
    // STEP 1: Redirect console BEFORE any imports (catches module side effects)
    // Per ADR-0001 IMP-001: STDIO compliance must be configured BEFORE any imports
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalInfo = console.info;

    console.log = (...args: unknown[]) => console.error('[LOG]', ...args);
    console.warn = (...args: unknown[]) => console.error('[WARN]', ...args);
    console.info = (...args: unknown[]) => console.error('[INFO]', ...args);

    try {
      // STEP 2: Now safe to dynamic import (any module side effects go to stderr)
      const { createMcpServer } = await import('@chainglass/mcp-server');
      const { PinoLoggerAdapter } = await import('@chainglass/shared');

      // STEP 3: MCP server uses stderr-configured logger (defense in depth)
      const logger = PinoLoggerAdapter.createForStderr();
      const server = createMcpServer({ logger });

      // Connect using stdio transport
      await server.connectStdio();

      // Wait for process to be terminated
      // The server handles stdin/stdout communication
      await new Promise<void>((resolve) => {
        process.on('SIGINT', () => {
          server.close().then(resolve);
        });
        process.on('SIGTERM', () => {
          server.close().then(resolve);
        });
      });
    } finally {
      // Restore console methods on shutdown
      console.log = originalLog;
      console.warn = originalWarn;
      console.info = originalInfo;
    }
  } else {
    // Non-stdio mode: HTTP transport (future feature)
    // For now, just log that it's not implemented
    console.error('HTTP transport not yet implemented. Use --stdio for AI agent integration.');
    process.exit(1);
  }
}
