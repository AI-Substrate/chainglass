/**
 * Zod schemas for PositionalGraphReality leaf types.
 *
 * DYK-I4: No top-level PositionalGraphRealitySchema — runtime uses ReadonlyMap
 * which is not JSON-serializable. Validate at leaf level only.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

// ── ExecutionStatus ───────────────────────────────

export const ExecutionStatusSchema = z.enum([
  'pending',
  'ready',
  'starting',
  'agent-accepted',
  'waiting-question',
  'blocked-error',
  'interrupted',
  'complete',
]);

// ── ReadinessDetail ───────────────────────────────

export const ReadinessDetailSchema = z
  .object({
    precedingLinesComplete: z.boolean(),
    transitionOpen: z.boolean(),
    serialNeighborComplete: z.boolean(),
    inputsAvailable: z.boolean(),
    unitFound: z.boolean(),
    reason: z.string().optional(),
  })
  .strict();

// ── NodeError ─────────────────────────────────────

export const NodeErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    occurredAt: z.string().datetime(),
  })
  .strict();

// ── QuestionOption ────────────────────────────────

/** DYK-I2: structured options format. */
export const QuestionOptionSchema = z
  .object({
    key: z.string(),
    label: z.string(),
  })
  .strict();

// ── LineReality ───────────────────────────────────

export const LineRealitySchema = z
  .object({
    lineId: z.string().min(1),
    index: z.number().int().min(0),
    label: z.string().optional(),
    transition: z.enum(['auto', 'manual']),
    transitionTriggered: z.boolean(),
    isComplete: z.boolean(),
    isEmpty: z.boolean(),
    canRun: z.boolean(),
    precedingLinesComplete: z.boolean(),
    transitionOpen: z.boolean(),
    nodeIds: z.array(z.string()),
  })
  .strict();

// ── QuestionReality ───────────────────────────────

export const QuestionRealitySchema = z
  .object({
    questionId: z.string().min(1),
    nodeId: z.string().min(1),
    questionType: z.enum(['text', 'single', 'multi', 'confirm']),
    text: z.string().min(1),
    options: z.array(QuestionOptionSchema).optional(),
    defaultValue: z.union([z.string(), z.boolean()]).optional(),
    askedAt: z.string().datetime(),
    surfacedAt: z.string().datetime().optional(),
    isSurfaced: z.boolean(),
    answer: z.unknown().optional(),
    answeredAt: z.string().datetime().optional(),
    isAnswered: z.boolean(),
  })
  .strict();

// ── NodeReality ───────────────────────────────────
// Note: InputPack is not re-validated here; it comes from existing service output.

export const NodeRealitySchema = z
  .object({
    nodeId: z.string().min(1),
    lineIndex: z.number().int().min(0),
    positionInLine: z.number().int().min(0),
    unitSlug: z.string().min(1),
    unitType: z.enum(['agent', 'code', 'user-input']),
    status: ExecutionStatusSchema,
    execution: z.enum(['serial', 'parallel']),
    ready: z.boolean(),
    readyDetail: ReadinessDetailSchema,
    inputPack: z.object({
      inputs: z.record(z.unknown()),
      ok: z.boolean(),
    }),
    pendingQuestionId: z.string().optional(),
    error: NodeErrorSchema.optional(),
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
  })
  .strict();
