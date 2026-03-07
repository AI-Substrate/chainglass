/**
 * Agent runner — pure orchestration function.
 *
 * Takes an IAgentAdapter (injected by CLI command), an AgentDefinition,
 * and an AgentRunConfig. Executes the prompt, streams events to NDJSON,
 * writes completed.json, and returns structured results.
 *
 * Zero SDK imports — the runner is adapter-agnostic. The CLI command
 * (composition root) creates CopilotClient → SdkCopilotAdapter and
 * passes it here. Tests pass FakeAgentAdapter.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentEvent, AgentResult, IAgentAdapter } from '@chainglass/shared';
import type {
  AgentDefinition,
  AgentRunConfig,
  AgentRunResult,
  CompletedMetadata,
  RunEventStats,
  ValidationResult,
} from './types.js';
import { createRunFolder } from './folder.js';
import { validateOutput } from './validator.js';

/**
 * Execute an agent from its definition.
 *
 * @param adapter - The agent adapter to use (SdkCopilotAdapter in prod, FakeAgentAdapter in tests)
 * @param definition - The resolved agent definition (from folder.ts)
 * @param config - Run configuration (model, timeout, etc.)
 * @param onEvent - Optional callback for real-time event display
 * @returns Structured run result with metadata and validation
 */
export async function runAgent(
  adapter: IAgentAdapter,
  definition: AgentDefinition,
  config: AgentRunConfig,
  onEvent?: (event: AgentEvent) => void,
): Promise<AgentRunResult> {
  const startedAt = new Date();

  // Create run folder with frozen copies
  const { runDir, runId } = createRunFolder(definition);
  const eventsPath = path.join(runDir, 'events.ndjson');

  // Initialize events file (may have zero events if adapter doesn't emit)
  fs.writeFileSync(eventsPath, '');

  // Read prompt
  const prompt = fs.readFileSync(definition.promptPath, 'utf-8');
  const instructions = definition.instructionsPath
    ? fs.readFileSync(definition.instructionsPath, 'utf-8')
    : null;

  // Build full prompt (instructions prepended if present)
  const fullPrompt = instructions
    ? `${instructions}\n\n---\n\n${prompt}`
    : prompt;

  // Event tracking
  const stats: RunEventStats = {
    total: 0,
    toolCalls: 0,
    toolResults: 0,
    messages: 0,
    thinking: 0,
    errors: 0,
  };

  // Event handler — writes NDJSON incrementally and forwards to display
  const handleEvent = (event: AgentEvent): void => {
    stats.total++;
    switch (event.type) {
      case 'tool_call': stats.toolCalls++; break;
      case 'tool_result': stats.toolResults++; break;
      case 'message': stats.messages++; break;
      case 'thinking': stats.thinking++; break;
      case 'session_error': stats.errors++; break;
    }

    // Write to NDJSON incrementally (per Finding 08)
    fs.appendFileSync(eventsPath, `${JSON.stringify(event)}\n`);

    // Forward to display callback
    if (onEvent) onEvent(event);
  };

  // Execute agent with timeout
  let agentResult: AgentResult;
  let timedOut = false;
  const timeoutMs = (config.timeout ?? 300) * 1000;

  try {
    agentResult = await Promise.race([
      adapter.run({
        prompt: fullPrompt,
        model: config.model,
        reasoningEffort: config.reasoningEffort,
        cwd: config.cwd,
        onEvent: handleEvent,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          timedOut = true;
          reject(new Error(`Agent timed out after ${config.timeout ?? 300}s`));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (timedOut) {
      // Attempt to terminate the adapter
      try {
        await adapter.terminate('');
      } catch {
        // Best-effort termination
      }

      agentResult = {
        output: `Agent timed out after ${config.timeout ?? 300}s`,
        sessionId: '',
        status: 'killed',
        exitCode: 124, // Standard timeout exit code
        tokens: null,
      };
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      agentResult = {
        output: `Agent execution failed: ${errorMessage}`,
        sessionId: '',
        status: 'failed',
        exitCode: 1,
        tokens: null,
      };
    }
  }

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  // Validate output if schema exists
  let validation: ValidationResult | null = null;
  if (definition.schemaPath) {
    const outputPath = path.join(runDir, 'output', 'report.json');
    validation = validateOutput(definition.schemaPath, outputPath);
  }

  // Determine final result status
  let resultStatus: CompletedMetadata['result'] = agentResult.status === 'completed' ? 'completed' : 'failed';
  if (timedOut) resultStatus = 'timeout';
  if (agentResult.status === 'completed' && validation && !validation.valid) resultStatus = 'degraded';

  // List artifacts in run folder
  const artifacts = listArtifacts(runDir);

  // Write completed.json
  const metadata: CompletedMetadata = {
    slug: definition.slug,
    runId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs,
    sessionId: agentResult.sessionId,
    result: resultStatus,
    exitCode: agentResult.exitCode,
    validated: validation ? validation.valid : null,
    validationErrors: validation?.errors ?? [],
    eventCount: stats.total,
    toolCallCount: stats.toolCalls,
    artifacts,
  };

  fs.writeFileSync(
    path.join(runDir, 'completed.json'),
    JSON.stringify(metadata, null, 2),
  );

  return { agentResult, metadata, validation, runDir };
}

/** List all files in a run directory recursively (relative paths). */
function listArtifacts(dir: string, base?: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = base ? path.join(base, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...listArtifacts(path.join(dir, entry.name), rel));
    } else {
      files.push(rel);
    }
  }
  return files;
}
