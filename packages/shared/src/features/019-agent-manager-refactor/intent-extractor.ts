/**
 * FX004-1: Extract human-readable intent from agent events.
 *
 * Pure function — no side effects, no dependencies.
 * Only processes tool_call and thinking events (DYK-FX004-03/05).
 * Handles varied input shapes per adapter (DYK-FX004-02).
 *
 * @example
 * ```ts
 * extractIntent({ type: 'tool_call', data: { toolName: 'Read', input: 'src/auth.ts' } })
 * // → "Reading src/auth.ts"
 *
 * extractIntent({ type: 'thinking', data: { content: 'Let me analyze the code...' } })
 * // → "Thinking: Let me analyze the code..."
 *
 * extractIntent({ type: 'text_delta', data: { content: 'hello' } })
 * // → null (fast-path skip)
 * ```
 */

import type { AgentEvent } from '../../interfaces/index.js';

const INTENT_TYPES = new Set(['tool_call']);

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function basename(filePath: string): string {
  return filePath.split('/').pop() ?? filePath;
}

/** Extract a path-like value from varied tool input shapes (DYK-FX004-02). */
function extractInputValue(input: unknown): string | null {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    // Claude Code Bash: { command: "git status" }
    if (typeof obj.command === 'string') return obj.command;
    // File tools: { path: "src/auth.ts" } or { file_path: "..." }
    if (typeof obj.path === 'string') return obj.path;
    if (typeof obj.file_path === 'string') return obj.file_path;
    // Fallback: first string value
    for (const val of Object.values(obj)) {
      if (typeof val === 'string' && val.length > 0 && val.length < 200) return val;
    }
  }
  return null;
}

/**
 * Extract a human-readable intent string from an agent event.
 * Returns null if the event type is not intent-relevant.
 */
export function extractIntent(event: AgentEvent): string | null {
  // Fast-path: skip non-intent event types (DYK-FX004-03)
  if (!INTENT_TYPES.has(event.type)) return null;

  if (event.type === 'tool_call') {
    const toolName = (event.data as { toolName?: string }).toolName ?? 'Tool';
    const input = (event.data as { input?: unknown }).input;
    const value = extractInputValue(input);

    // Copilot CLI report_intent — use the intent text directly
    if (toolName === 'report_intent') {
      const obj = input as Record<string, unknown> | undefined;
      if (obj && typeof obj.intent === 'string') return truncate(obj.intent, 80);
      return value ? truncate(value, 80) : null;
    }

    if ((toolName === 'Bash' || toolName === 'bash') && value) {
      return truncate(`Running: ${value}`, 60);
    }
    if ((toolName === 'Read' || toolName === 'View' || toolName === 'read_file') && value) {
      return `Reading ${basename(value)}`;
    }
    if (
      (toolName === 'Write' ||
        toolName === 'Edit' ||
        toolName === 'write_file' ||
        toolName === 'edit_file') &&
      value
    ) {
      return `Editing ${basename(value)}`;
    }
    if (toolName === 'Search' || toolName === 'Grep' || toolName === 'grep') {
      return value ? truncate(`Searching: ${value}`, 60) : 'Searching';
    }
    return value ? truncate(`${toolName}: ${value}`, 60) : `Using ${toolName}`;
  }

  return null;
}
