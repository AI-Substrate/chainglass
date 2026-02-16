/**
 * Plan 034: Agentic CLI — Terminal Event Handlers
 *
 * Formats agent events for terminal output. Three modes:
 * - Human-readable (--verbose): [name] prefixed text with event type formatting
 * - NDJSON (--stream): Raw JSON per event line
 * - Default / Quiet: No handler attached (JSON result only)
 *
 * Per DYK-P3#1: JSON output is the default. Human-readable is opt-in via --verbose.
 */

import type { AgentEvent, AgentEventHandler } from '@chainglass/shared';

export interface TerminalEventHandlerOptions {
  /** Show thinking and tool_result content (verbose mode) */
  verbose?: boolean;
  /** Override write function for testability (default: process.stdout.write) */
  write?: (s: string) => void;
}

/** Truncate a string to maxLen, appending '...' if truncated. */
export function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 3)}...`;
}

/**
 * Create a human-readable terminal event handler.
 * Events are formatted with a [name] prefix.
 *
 * In verbose mode: thinking events and tool_result content are shown.
 * In default mode: only text_delta, message, tool_call, and tool_result errors are shown.
 */
export function createTerminalEventHandler(
  name: string,
  options: TerminalEventHandlerOptions = {}
): AgentEventHandler {
  const write = options.write ?? ((s: string) => process.stdout.write(s));
  const prefix = `[${name}]`;

  return (event: AgentEvent) => {
    switch (event.type) {
      case 'text_delta':
        write(`${prefix} ${(event.data as { content: string }).content}`);
        break;

      case 'message':
        write(`${prefix} ${(event.data as { content: string }).content}\n`);
        break;

      case 'tool_call': {
        const data = event.data as { toolName: string; input: unknown };
        write(`${prefix} [tool] ${data.toolName}: ${truncate(JSON.stringify(data.input), 100)}\n`);
        break;
      }

      case 'tool_result': {
        const data = event.data as { output: string; isError: boolean };
        if (data.isError) {
          write(`${prefix} [tool error] ${truncate(data.output, 200)}\n`);
        } else if (options.verbose) {
          write(`${prefix}   > ${truncate(data.output, 200)}\n`);
        }
        break;
      }

      case 'thinking':
        if (options.verbose) {
          write(
            `${prefix} [thinking] ${truncate((event.data as { content: string }).content, 200)}\n`
          );
        }
        break;
    }
  };
}

/**
 * NDJSON event handler — outputs raw JSON per event line.
 * Used with --stream flag for machine-readable output.
 */
export function ndjsonEventHandler(event: AgentEvent): void {
  console.log(JSON.stringify(event));
}
