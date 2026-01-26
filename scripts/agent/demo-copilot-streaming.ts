#!/usr/bin/env npx tsx
/**
 * Demo: REAL SdkCopilotAdapter streaming events
 * 
 * Shows real-time event emission during ACTUAL Copilot execution.
 * Uses REAL Copilot SDK - requires authentication.
 * 
 * Run: npx tsx scratch/demo-copilot-streaming.ts
 */

import { CopilotClient } from '@github/copilot-sdk';
import type { AgentEvent } from '@chainglass/shared';

// Color helpers for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function formatEvent(event: AgentEvent): string {
  const timestamp = event.timestamp.split('T')[1].slice(0, 12);
  
  switch (event.type) {
    case 'text_delta':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.green}text_delta${colors.reset}: "${event.data.content}"`;
    case 'message':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.blue}message${colors.reset}: "${event.data.content.slice(0, 80)}${event.data.content.length > 80 ? '...' : ''}"`;
    case 'usage':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.yellow}usage${colors.reset}: in=${event.data.inputTokens}, out=${event.data.outputTokens}`;
    case 'session_idle':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.dim}session_idle${colors.reset}`;
    case 'session_error':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.red}session_error${colors.reset}: ${event.data.errorType} - ${event.data.message}`;
    case 'raw':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.magenta}raw${colors.reset}: ${event.data.originalType}`;
    default:
      return `${colors.cyan}[${timestamp}]${colors.reset} unknown: ${JSON.stringify(event)}`;
  }
}

/**
 * Translate real Copilot SDK event to AgentEvent
 */
function translateToAgentEvent(event: any): AgentEvent | null {
  const timestamp = new Date().toISOString();

  switch (event.type) {
    case 'assistant.message_delta':
      return {
        type: 'text_delta',
        timestamp,
        data: {
          content: event.data?.deltaContent ?? '',
          messageId: event.data?.messageId,
        },
      };

    case 'assistant.message':
      return {
        type: 'message',
        timestamp,
        data: {
          content: event.data?.content ?? '',
          messageId: event.data?.messageId,
        },
      };

    case 'assistant.usage':
      return {
        type: 'usage',
        timestamp,
        data: {
          inputTokens: event.data?.inputTokens,
          outputTokens: event.data?.outputTokens,
        },
      };

    case 'session.idle':
      return {
        type: 'session_idle',
        timestamp,
        data: {},
      };

    case 'session.error':
      return {
        type: 'session_error',
        timestamp,
        data: {
          errorType: event.data?.errorType ?? 'UNKNOWN',
          message: event.data?.message ?? 'Unknown error',
        },
      };

    default:
      return {
        type: 'raw',
        timestamp,
        data: {
          provider: 'copilot',
          originalType: event.type,
          originalData: event,
        },
      };
  }
}

async function main() {
  console.log(`${colors.bright}🚀 REAL Copilot Streaming Events Demo${colors.reset}\n`);
  console.log(`${colors.dim}Using actual @github/copilot-sdk - requires Copilot authentication${colors.reset}\n`);

  // Create REAL Copilot client
  let client: CopilotClient;
  try {
    client = new CopilotClient();
    console.log(`${colors.green}✓ CopilotClient created${colors.reset}\n`);
  } catch (error) {
    console.error(`${colors.red}✗ Failed to create CopilotClient:${colors.reset}`, error);
    console.log(`\n${colors.yellow}Make sure you have Copilot CLI installed and authenticated:${colors.reset}`);
    console.log(`  npm install -g @github/copilot`);
    console.log(`  gh auth login`);
    process.exit(1);
  }

  const prompt = 'Say "Hello, I am Copilot!" in exactly those words.';
  console.log(`${colors.dim}Prompt: "${prompt}"${colors.reset}\n`);
  console.log(`${colors.bright}Events:${colors.reset}`);

  // Collect streaming content
  let streamedContent = '';
  let finalContent = '';

  try {
    // Create session with streaming ENABLED
    const session = await client.createSession({ streaming: true });
    console.log(`${colors.green}✓ Session created: ${session.sessionId}${colors.reset}\n`);

    // Register event handler BEFORE sendAndWait (DYK-02)
    session.on((event: any) => {
      const agentEvent = translateToAgentEvent(event);
      if (agentEvent) {
        console.log(formatEvent(agentEvent));
        
        if (agentEvent.type === 'text_delta') {
          streamedContent += agentEvent.data.content;
          process.stdout.write(`${colors.dim}  → Accumulated: "${streamedContent}"${colors.reset}\n`);
        }
        
        if (agentEvent.type === 'message') {
          finalContent = agentEvent.data.content;
        }
      }
    });

    // Send and wait
    await session.sendAndWait({ prompt });

    // Cleanup
    await session.destroy();

    console.log(`\n${colors.bright}Final Result:${colors.reset}`);
    console.log(`  Session ID: ${session.sessionId}`);
    console.log(`  Streamed: "${streamedContent}"`);
    console.log(`  Final:    "${finalContent}"`);

  } catch (error) {
    console.error(`\n${colors.red}Error:${colors.reset}`, error);
  } finally {
    await client.stop();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
