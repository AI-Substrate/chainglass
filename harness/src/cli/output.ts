/**
 * Harness CLI output envelope — the canonical JSON contract for all commands.
 *
 * Every harness CLI command returns a HarnessEnvelope to stdout.
 * Agents parse this envelope to determine success/failure and extract data.
 *
 * Design decisions (DYK #1-#2):
 *  - Exit 0 for ok + degraded; exit 1 for command-level failures only
 *  - This envelope is the canonical shape; Phase 2 `just health` may be back-patched
 */

import { z } from 'zod';

// -- Error codes (E100-E110) --------------------------------------------------

export const ErrorCodes = {
  UNKNOWN: 'E100',
  CONTAINER_NOT_RUNNING: 'E101',
  BUILD_FAILED: 'E102',
  HEALTH_FAILED: 'E103',
  CDP_UNAVAILABLE: 'E104',
  TEST_FAILED: 'E105',
  SCREENSHOT_FAILED: 'E106',
  RESULTS_NOT_FOUND: 'E107',
  INVALID_ARGS: 'E108',
  TIMEOUT: 'E109',
  DOCKER_UNAVAILABLE: 'E110',
  // Agent runner error codes (Plan 070 Phase 2)
  AGENT_EXECUTION_FAILED: 'E120',
  AGENT_NOT_FOUND: 'E121',
  AGENT_AUTH_MISSING: 'E122',
  AGENT_TIMEOUT: 'E123',
  AGENT_VALIDATION_FAILED: 'E124',
  AGENT_RUN_FOLDER_FAILED: 'E125',
} as const;

export type HarnessErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// -- Envelope schema ----------------------------------------------------------

const ErrorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const HarnessEnvelopeSchema = z.object({
  command: z.string(),
  status: z.enum(['ok', 'error', 'degraded']),
  timestamp: z.string().datetime(),
  data: z.unknown().optional(),
  error: ErrorDetailSchema.optional(),
});

export type HarnessEnvelope = z.infer<typeof HarnessEnvelopeSchema>;
export type HarnessStatus = HarnessEnvelope['status'];
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

// -- Formatting helpers -------------------------------------------------------

export function formatSuccess<T>(
  command: string,
  data: T,
  status: 'ok' | 'degraded' = 'ok',
): HarnessEnvelope {
  return {
    command,
    status,
    timestamp: new Date().toISOString(),
    data,
  };
}

export function formatError(
  command: string,
  code: HarnessErrorCode | string,
  message: string,
  details?: unknown,
): HarnessEnvelope {
  return {
    command,
    status: 'error',
    timestamp: new Date().toISOString(),
    error: {
      code,
      message,
      ...(details !== undefined && { details }),
    },
  };
}

// -- Parsing helper -----------------------------------------------------------

export function parseEnvelope(json: string): HarnessEnvelope {
  const raw = JSON.parse(json);
  return HarnessEnvelopeSchema.parse(raw);
}

// -- Output helper (write to stdout) ------------------------------------------

export function printEnvelope(envelope: HarnessEnvelope): void {
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
}

// -- Exit helper (DYK #1: 0 for ok/degraded, 1 for error) --------------------

export function exitWithEnvelope(envelope: HarnessEnvelope): never {
  printEnvelope(envelope);
  process.exit(envelope.status === 'error' ? 1 : 0);
}
