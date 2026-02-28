import type { AgentEvent } from '../interfaces/agent-types.js';

/**
 * Raw event shape from Copilot CLI's events.jsonl file.
 * Each line is a JSON object with this structure.
 */
interface EventsJsonlRaw {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
  id?: string;
}

/**
 * Parse a single line from events.jsonl into an AgentEvent.
 *
 * Pure function — no I/O, no side effects. Translates Copilot CLI event types
 * into the unified AgentEvent discriminated union.
 *
 * Returns null for malformed lines (per PL-07: silently skip).
 */
export function parseEventsJsonlLine(line: string): AgentEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let raw: EventsJsonlRaw;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!raw.type || typeof raw.type !== 'string') return null;

  const base = {
    timestamp: raw.timestamp ?? new Date().toISOString(),
    eventId: raw.id,
  };

  switch (raw.type) {
    case 'assistant.message':
      return {
        ...base,
        type: 'message',
        data: {
          content: String(raw.data.content ?? ''),
          messageId: raw.data.messageId as string | undefined,
        },
      };

    case 'assistant.message_delta':
      return {
        ...base,
        type: 'text_delta',
        data: {
          content: String(raw.data.content ?? ''),
          messageId: raw.data.messageId as string | undefined,
        },
      };

    case 'tool.execution_start':
      return {
        ...base,
        type: 'tool_call',
        data: {
          toolName: String(raw.data.name ?? ''),
          input: raw.data.input,
          toolCallId: String(raw.data.id ?? ''),
        },
      };

    case 'tool.execution_complete':
      return {
        ...base,
        type: 'tool_result',
        data: {
          toolCallId: String(raw.data.id ?? ''),
          output: String(raw.data.output ?? ''),
          isError: Boolean(raw.data.isError),
        },
      };

    case 'assistant.reasoning':
    case 'assistant.reasoning_delta':
      return {
        ...base,
        type: 'thinking',
        data: {
          content: String(raw.data.content ?? ''),
        },
      };

    case 'assistant.usage':
      return {
        ...base,
        type: 'usage',
        data: {
          inputTokens: raw.data.inputTokens as number | undefined,
          outputTokens: raw.data.outputTokens as number | undefined,
          totalTokens: raw.data.totalTokens as number | undefined,
          tokenLimit: raw.data.tokenLimit as number | undefined,
        },
      };

    case 'session.idle':
      return {
        ...base,
        type: 'session_idle',
        data: {
          sessionId: raw.data.sessionId as string | undefined,
        },
      };

    case 'session.start':
      return {
        ...base,
        type: 'session_start',
        data: {
          sessionId: raw.data.sessionId as string | undefined,
        },
      };

    case 'session.error':
      return {
        ...base,
        type: 'session_error',
        data: {
          errorType: raw.data.errorType as string | undefined,
          message: raw.data.message as string | undefined,
        },
      };

    case 'user.message':
      return {
        ...base,
        type: 'user_prompt',
        data: {
          content: String(raw.data.content ?? ''),
        },
      };

    default:
      return {
        ...base,
        type: 'raw',
        data: {
          provider: 'copilot',
          originalType: raw.type,
          originalData: raw.data,
        },
      };
  }
}
