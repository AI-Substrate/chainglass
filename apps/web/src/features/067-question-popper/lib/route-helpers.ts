/**
 * Plan 067: Question Popper — Route Helpers
 *
 * Shared utilities for all `/api/event-popper/*` route handlers.
 *
 * Architecture (DYK-02): Handler functions take (request, service) for direct
 * testability with FakeQuestionPopperService. Route.ts files are thin wrappers
 * that handle auth + DI, then delegate to these handlers.
 *
 * Auth (DYK-01, DYK-R2-03, DYK-R2-04): `authorizeRequest(request, mode)` with
 * explicit 'cli-only' | 'shared' mode. Localhost checked first (fast, sync),
 * auth() fallback only in shared mode (slow, async).
 *
 * Validation (DYK-04, DYK-R2-02): `parseJsonBody` wraps request.json() in
 * try/catch (malformed JSON → 400). Full request schemas (AskQuestionRequestSchema,
 * SendAlertRequestSchema) validate source + meta + payload in one pass.
 *
 * Response mapping (DYK-R2-01): Routes return QuestionOut/AlertOut (ergonomic),
 * not StoredQuestion/StoredAlert (internal).
 */

import { z } from 'zod';

import type { IQuestionPopperService } from '@chainglass/shared/interfaces';
import {
  AlertPayloadSchema,
  AnswerPayloadSchema,
  ClarificationPayloadSchema,
  QuestionTypeEnum,
} from '@chainglass/shared/question-popper';
import type {
  AlertOut,
  AlertPayload,
  AnswerPayload,
  ClarificationPayload,
  QuestionOut,
  QuestionPayload,
  StoredAlert,
  StoredEvent,
  StoredQuestion,
} from '@chainglass/shared/question-popper';

// ── Request Schemas (DYK-R2-02) ──

/**
 * Full body schema for POST /api/event-popper/ask-question.
 * Validates source + meta + all QuestionPayload fields in one pass.
 */
export const AskQuestionRequestSchema = z.object({
  source: z.string().min(1),
  meta: z.record(z.string(), z.unknown()).optional(),
  questionType: QuestionTypeEnum,
  text: z.string().min(1),
  description: z.string().nullable().default(null),
  options: z.array(z.string().min(1)).nullable().default(null),
  default: z.union([z.string(), z.boolean()]).nullable().default(null),
  timeout: z.number().int().min(0).default(600),
  previousQuestionId: z.string().nullable().default(null),
});

export type AskQuestionRequest = z.infer<typeof AskQuestionRequestSchema>;

/**
 * Full body schema for POST /api/event-popper/send-alert.
 * Validates source + meta + all AlertPayload fields in one pass.
 */
export const SendAlertRequestSchema = z.object({
  source: z.string().min(1),
  meta: z.record(z.string(), z.unknown()).optional(),
  text: z.string().min(1),
  description: z.string().nullable().default(null),
});

export type SendAlertRequest = z.infer<typeof SendAlertRequestSchema>;

// Re-export for route.ts files that validate sub-payloads
export { AnswerPayloadSchema, ClarificationPayloadSchema };

// ── Body Parsing (DYK-04) ──

/**
 * Parse and validate JSON request body.
 * Wraps request.json() in try/catch — malformed JSON returns 400, not 500.
 * Then validates against Zod schema — validation errors return 400 with details.
 */
export async function parseJsonBody<T>(
  request: Request,
  // biome-ignore lint/suspicious/noExplicitAny: Zod v3/v4 cross-version compatibility
  schema: { safeParse: (data: unknown) => { success: boolean; data?: any; error?: any } }
): Promise<T | Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Invalid JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return Response.json(
      {
        error: 'Validation error',
        message: result.error.issues.map((i: { message: string }) => i.message).join('; '),
      },
      { status: 400 }
    );
  }

  return result.data as T;
}

// ── Error Mapping ──

/**
 * Map service errors to appropriate HTTP status codes.
 * "not found" → 404, "already" (resolved/acknowledged) → 409, else → 500.
 */
export function eventPopperErrorResponse(error: unknown, context: string): Response {
  const message = error instanceof Error ? error.message : 'Unknown error';

  if (message.includes('not found')) {
    return Response.json({ error: 'Not found', message }, { status: 404 });
  }
  if (message.includes('already')) {
    return Response.json({ error: 'Conflict', message }, { status: 409 });
  }

  console.error(`[event-popper/${context}]`, error);
  return Response.json({ error: 'Internal error', message }, { status: 500 });
}

// ── Response Mappers (DYK-R2-01) ──

/** Map internal StoredQuestion → ergonomic QuestionOut for API responses. */
export function toQuestionOut(stored: StoredQuestion): QuestionOut {
  const { id, request, response, status } = stored;

  const out: QuestionOut = {
    questionId: id,
    status,
    question: request.payload as unknown as QuestionPayload,
    source: request.source,
    createdAt: request.createdAt,
    meta: request.meta,
  };

  if (response) {
    out.respondedAt = response.respondedAt;
    out.respondedBy = response.respondedBy;

    if (status === 'answered') {
      out.answer = response.payload as unknown as AnswerPayload;
    } else if (status === 'needs-clarification') {
      out.clarification = response.payload as unknown as ClarificationPayload;
    }
  }

  return out;
}

/** Map internal StoredAlert → ergonomic AlertOut for API responses. */
export function toAlertOut(stored: StoredAlert): AlertOut {
  const { id, request, response, status } = stored;

  return {
    alertId: id,
    status,
    alert: request.payload as unknown as AlertPayload,
    source: request.source,
    createdAt: request.createdAt,
    acknowledgedAt: response?.respondedAt ?? null,
    acknowledgedBy: response?.respondedBy ?? null,
    meta: request.meta,
  };
}

/** Map any StoredEvent → its ergonomic output type. */
export function toEventOut(stored: StoredEvent): QuestionOut | AlertOut {
  return stored.type === 'question' ? toQuestionOut(stored) : toAlertOut(stored);
}

// ── Handler Functions (DYK-02) ──

/** POST /api/event-popper/ask-question — CLI-only. */
export async function handleAskQuestion(
  request: Request,
  service: IQuestionPopperService
): Promise<Response> {
  const bodyOrError = await parseJsonBody<AskQuestionRequest>(request, AskQuestionRequestSchema);
  if (bodyOrError instanceof Response) return bodyOrError;

  const { questionId } = await service.askQuestion(bodyOrError);
  return Response.json({ questionId }, { status: 201 });
}

/** GET /api/event-popper/question/[id] — shared. */
export async function handleGetQuestion(
  service: IQuestionPopperService,
  id: string
): Promise<Response> {
  const stored = await service.getQuestion(id);
  if (!stored) {
    return Response.json(
      { error: 'Not found', message: `Question not found: ${id}` },
      { status: 404 }
    );
  }
  return Response.json(toQuestionOut(stored));
}

/** POST /api/event-popper/answer-question/[id] — shared. */
export async function handleAnswerQuestion(
  request: Request,
  service: IQuestionPopperService,
  id: string
): Promise<Response> {
  const bodyOrError = await parseJsonBody<AnswerPayload>(request, AnswerPayloadSchema);
  if (bodyOrError instanceof Response) return bodyOrError;

  try {
    await service.answerQuestion(id, bodyOrError);
    const updated = await service.getQuestion(id);
    if (!updated)
      return eventPopperErrorResponse(
        new Error(`Question not found: ${id}`),
        `answer-question/${id}`
      );
    return Response.json(toQuestionOut(updated));
  } catch (error) {
    return eventPopperErrorResponse(error, `answer-question/${id}`);
  }
}

/** POST /api/event-popper/send-alert — CLI-only. */
export async function handleSendAlert(
  request: Request,
  service: IQuestionPopperService
): Promise<Response> {
  const bodyOrError = await parseJsonBody<SendAlertRequest>(request, SendAlertRequestSchema);
  if (bodyOrError instanceof Response) return bodyOrError;

  const { alertId } = await service.sendAlert(bodyOrError);
  return Response.json({ alertId }, { status: 201 });
}

/** GET /api/event-popper/list — shared. Supports ?status=X and ?limit=N. */
export async function handleList(
  request: Request,
  service: IQuestionPopperService
): Promise<Response> {
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status');
  const limitStr = url.searchParams.get('limit');
  const limit =
    limitStr === 'all' ? Number.MAX_SAFE_INTEGER : limitStr ? Number.parseInt(limitStr, 10) : 100;

  if (limitStr !== 'all' && (Number.isNaN(limit) || limit < 1)) {
    return Response.json(
      { error: 'Validation error', message: 'limit must be a positive integer' },
      { status: 400 }
    );
  }

  let events = await service.listAll();

  if (statusFilter) {
    events = events.filter((e) => {
      if (e.type === 'question') return e.status === statusFilter;
      if (e.type === 'alert') return e.status === statusFilter;
      return false;
    });
  }

  const items = events.slice(0, limit).map(toEventOut);
  return Response.json({ items, total: events.length });
}

/** POST /api/event-popper/dismiss/[id] — shared. Single-purpose (DYK-03). */
export async function handleDismiss(
  service: IQuestionPopperService,
  id: string
): Promise<Response> {
  try {
    await service.dismissQuestion(id);
    const updated = await service.getQuestion(id);
    if (!updated)
      return eventPopperErrorResponse(new Error(`Question not found: ${id}`), `dismiss/${id}`);
    return Response.json(toQuestionOut(updated));
  } catch (error) {
    return eventPopperErrorResponse(error, `dismiss/${id}`);
  }
}

/** POST /api/event-popper/clarify/[id] — shared. Separate from dismiss (DYK-03). */
export async function handleClarify(
  request: Request,
  service: IQuestionPopperService,
  id: string
): Promise<Response> {
  const bodyOrError = await parseJsonBody<ClarificationPayload>(
    request,
    ClarificationPayloadSchema
  );
  if (bodyOrError instanceof Response) return bodyOrError;

  try {
    await service.requestClarification(id, bodyOrError.text);
    const updated = await service.getQuestion(id);
    if (!updated)
      return eventPopperErrorResponse(new Error(`Question not found: ${id}`), `clarify/${id}`);
    return Response.json(toQuestionOut(updated));
  } catch (error) {
    return eventPopperErrorResponse(error, `clarify/${id}`);
  }
}

/** POST /api/event-popper/acknowledge/[id] — shared. */
export async function handleAcknowledge(
  service: IQuestionPopperService,
  id: string
): Promise<Response> {
  try {
    await service.acknowledgeAlert(id);
    const updated = await service.getAlert(id);
    if (!updated)
      return eventPopperErrorResponse(new Error(`Alert not found: ${id}`), `acknowledge/${id}`);
    return Response.json(toAlertOut(updated));
  } catch (error) {
    return eventPopperErrorResponse(error, `acknowledge/${id}`);
  }
}
